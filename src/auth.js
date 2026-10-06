// Admin authentication: scrypt password hashing, HMAC-signed session cookies,
// and optional TOTP two-factor authentication.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { PATHS } from './paths.js';
import { readJSON, writeJSON } from './store.js';
import { verifyTotp } from './totp.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
export const SESSION_COOKIE = 'pf_admin';
export const SESSION_MS = 7 * 24 * 3600 * 1000;
export const MIN_PASSWORD_LENGTH = 10;

let auth;
const save = () => writeJSON(PATHS.auth, auth);

export function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  const raw = Array.from(bytes, b => chars[b % chars.length]).join('');
  return raw.match(/.{4}/g).join('-');
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function checkPassword(password, stored) {
  const [algo, N, r, p, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(String(password), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(actual, expected);
}

/** Writes a fresh auth file with the given password (used on first run and by `npm run reset-admin`). */
export async function resetAuth(password, { mustChangePassword }) {
  const previous = await readJSON(PATHS.auth, null);
  auth = {
    passwordHash: await hashPassword(password),
    sessionSecret: crypto.randomBytes(32).toString('base64'),
    sessionVersion: (previous?.sessionVersion ?? 0) + 1,
    mustChangePassword,
    totp: { enabled: false, secret: null, pendingSecret: null, lastCounter: -1 },
    updatedAt: new Date().toISOString(),
  };
  await save();
}

export async function initAuth() {
  auth = await readJSON(PATHS.auth, null);
  if (auth) return;

  const fromEnv = process.env.ADMIN_PASSWORD;
  const password = fromEnv || generatePassword();
  await resetAuth(password, { mustChangePassword: !fromEnv });
  if (!fromEnv) {
    await fs.writeFile(PATHS.initialPassword,
      `Initial admin password (delete this file after you change it in Dashboard → Security):\n\n${password}\n`);
    console.log([
      '',
      '  ┌───────────────────────────────────────────────────────────────┐',
      '  │  Admin account created.                                       │',
      `  │  Initial password: ${password.padEnd(43)}│`,
      '  │  (also saved to data/initial-admin-password.txt)              │',
      '  │  Change it from the dashboard → Security after logging in.    │',
      '  └───────────────────────────────────────────────────────────────┘',
      '',
    ].join('\n'));
  }
}

export const authStatus = () => ({
  mustChangePassword: Boolean(auth.mustChangePassword),
  totpEnabled: Boolean(auth.totp?.enabled),
});

/* --------------------------------- sessions --------------------------------- */

const b64url = buf => Buffer.from(buf).toString('base64url');
const sign = payload => crypto.createHmac('sha256', auth.sessionSecret).update(payload).digest('base64url');

export function createSessionToken() {
  const payload = b64url(JSON.stringify({ v: auth.sessionVersion, exp: Date.now() + SESSION_MS }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const { v, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return v === auth.sessionVersion && exp > Date.now();
  } catch {
    return false;
  }
}

export async function revokeAllSessions() {
  auth.sessionVersion += 1;
  await save();
}

/* ---------------------------------- login ---------------------------------- */

/** @returns {'ok' | 'bad-password' | 'need-code' | 'bad-code'} */
export async function attemptLogin(password, code) {
  if (!password || !(await checkPassword(password, auth.passwordHash))) return 'bad-password';
  if (!auth.totp?.enabled) return 'ok';
  if (!code) return 'need-code';
  const counter = verifyTotp(auth.totp.secret, code, auth.totp.lastCounter);
  if (counter === null) return 'bad-code';
  auth.totp.lastCounter = counter;
  await save();
  return 'ok';
}

export async function changePassword(current, next) {
  if (!(await checkPassword(current, auth.passwordHash))) return { error: 'Current password is incorrect.' };
  if (typeof next !== 'string' || next.length < MIN_PASSWORD_LENGTH) {
    return { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  auth.passwordHash = await hashPassword(next);
  auth.mustChangePassword = false;
  auth.sessionVersion += 1; // sign out every other device
  await save();
  await fs.rm(PATHS.initialPassword, { force: true });
  return { ok: true };
}

/* ----------------------------------- 2FA ----------------------------------- */

export async function startTotpSetup(secret) {
  auth.totp.pendingSecret = secret;
  await save();
}

export async function confirmTotpSetup(code) {
  const secret = auth.totp.pendingSecret;
  if (!secret) return false;
  const counter = verifyTotp(secret, code);
  if (counter === null) return false;
  auth.totp = { enabled: true, secret, pendingSecret: null, lastCounter: counter };
  await save();
  return true;
}

export async function disableTotp(password, code) {
  if (!(await checkPassword(password, auth.passwordHash))) return { error: 'Password is incorrect.' };
  if (verifyTotp(auth.totp.secret, code, auth.totp.lastCounter) === null) return { error: 'Authentication code is incorrect.' };
  auth.totp = { enabled: false, secret: null, pendingSecret: null, lastCounter: -1 };
  await save();
  return { ok: true };
}
