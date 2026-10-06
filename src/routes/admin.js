import express from 'express';
import QRCode from 'qrcode';
import * as auth from '../auth.js';
import * as store from '../store.js';
import { statsSummary } from '../stats.js';
import { createLimiter } from '../ratelimit.js';
import { generateSecret, otpauthUri } from '../totp.js';
import { sanitizeContent } from '../schema.js';

// 5 wrong passwords / codes per IP per 15 minutes.
const authLimiter = createLimiter({ windowMs: 15 * 60_000, max: 5 });

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const isHttps = req => req.secure || (req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
export const isAdmin = req => auth.verifySessionToken(parseCookies(req.headers.cookie)[auth.SESSION_COOKIE]);

function setSessionCookie(req, res) {
  res.cookie(auth.SESSION_COOKIE, auth.createSessionToken(), {
    httpOnly: true, sameSite: 'strict', secure: isHttps(req), maxAge: auth.SESSION_MS, path: '/',
  });
}

function throttled(req, res) {
  const wait = authLimiter.blockedFor(req.ip);
  if (!wait) return false;
  res.set('Retry-After', String(wait));
  res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
  return true;
}

export function adminApi() {
  const r = express.Router();

  // Every admin call must carry this header. Browsers can't add custom headers cross-site
  // without a CORS preflight (which we never allow), so this doubles as CSRF protection.
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('x-admin-request') !== '1') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
  r.use(express.json({ limit: '2mb' }));

  r.post('/login', async (req, res) => {
    if (throttled(req, res)) return;
    const { password, code } = req.body ?? {};
    const result = await auth.attemptLogin(password, code);
    if (result === 'need-code') return res.status(401).json({ need2fa: true });
    if (result !== 'ok') {
      authLimiter.hit(req.ip);
      return res.status(401).json({
        error: result === 'bad-code' ? 'Invalid authentication code.' : 'Incorrect password.',
        need2fa: result === 'bad-code',
      });
    }
    authLimiter.reset(req.ip);
    setSessionCookie(req, res);
    res.json({ authenticated: true, ...auth.authStatus() });
  });

  r.post('/logout', (req, res) => {
    res.clearCookie(auth.SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/session', (req, res) => {
    res.json(isAdmin(req) ? { authenticated: true, ...auth.authStatus() } : { authenticated: false });
  });

  /* ------------------------- everything below requires a session ------------------------- */
  r.use((req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Your session has expired. Please sign in again.' })));

  r.get('/content', (req, res) => res.json(store.getContent()));
  r.put('/content', async (req, res) => res.json(await store.saveContent(req.body)));
  // Normalizes an imported JSON file without saving it, so the editor can show it first.
  r.post('/content/sanitize', (req, res) => res.json(sanitizeContent(req.body)));

  r.post('/upload', express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
    const mime = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    res.json({ url: await store.saveUpload(req.body, mime) });
  });

  r.get('/messages', (req, res) => res.json(store.listMessages()));
  r.patch('/messages/:id', async (req, res) => {
    const msg = await store.updateMessage(req.params.id, req.body ?? {});
    msg ? res.json(msg) : res.status(404).json({ error: 'Message not found.' });
  });
  r.delete('/messages/:id', async (req, res) => {
    (await store.deleteMessage(req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: 'Message not found.' });
  });

  r.get('/stats', (req, res) => {
    res.json({ ...statsSummary(30), unread: store.listMessages().filter(m => !m.read).length });
  });

  r.get('/backups', async (req, res) => res.json(await store.listBackups()));
  r.post('/backups/:name/restore', async (req, res) => res.json(await store.restoreBackup(req.params.name)));

  r.post('/password', async (req, res) => {
    if (throttled(req, res)) return;
    const result = await auth.changePassword(req.body?.current, req.body?.next);
    if (result.error) {
      if (result.error.startsWith('Current')) authLimiter.hit(req.ip);
      return res.status(400).json(result);
    }
    setSessionCookie(req, res); // keep this device signed in after sessions were rotated
    res.json({ ok: true, ...auth.authStatus() });
  });

  r.post('/2fa/setup', async (req, res) => {
    if (auth.authStatus().totpEnabled) return res.status(400).json({ error: 'Two-factor authentication is already enabled.' });
    const secret = generateSecret();
    await auth.startTotpSetup(secret);
    const name = store.getContent().profile.name.replace(/:/g, '') || 'Portfolio';
    const uri = otpauthUri({ secret, issuer: `${name} Portfolio`, account: 'admin' });
    res.json({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) });
  });

  r.post('/2fa/enable', async (req, res) => {
    if (throttled(req, res)) return;
    if (await auth.confirmTotpSetup(req.body?.code)) return res.json({ ok: true, ...auth.authStatus() });
    authLimiter.hit(req.ip);
    res.status(400).json({ error: 'That code didn’t match. Make sure your device’s clock is correct and try again.' });
  });

  r.post('/2fa/disable', async (req, res) => {
    if (throttled(req, res)) return;
    const result = await auth.disableTotp(req.body?.password, req.body?.code);
    if (result.error) {
      authLimiter.hit(req.ip);
      return res.status(400).json(result);
    }
    res.json({ ok: true, ...auth.authStatus() });
  });

  r.post('/sessions/revoke', async (req, res) => {
    await auth.revokeAllSessions();
    setSessionCookie(req, res);
    res.json({ ok: true });
  });

  return r;
}
