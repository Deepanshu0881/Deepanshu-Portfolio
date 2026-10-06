import './src/env.js';
import crypto from 'node:crypto';
import express from 'express';
import compression from 'compression';
import { PATHS } from './src/paths.js';
import { initStore, getContent } from './src/store.js';
import { initAuth } from './src/auth.js';
import { initStats, recordView, flushStats } from './src/stats.js';
import { renderPage, renderFavicon, renderNotFound } from './src/render.js';
import { adminApi, isAdmin, isHttps } from './src/routes/admin.js';
import { publicApi } from './src/routes/public.js';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const VERSION = Date.now().toString(36);
const ADMIN_PATH = (() => {
  const raw = `/${(process.env.ADMIN_PATH || 'admin').replace(/^\/+|\/+$/g, '')}`;
  if (!/^\/[\w-]+(\/[\w-]+)*$/.test(raw) || /^\/(api|uploads|css|js|img)(\/|$)/.test(raw)) {
    throw new Error(`Invalid ADMIN_PATH "${process.env.ADMIN_PATH}". Use something like "/admin" or "/my-secret-panel".`);
  }
  return raw;
})();

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

// Security headers + per-request CSP nonce for the two tiny inline scripts.
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://cdn.simpleicons.org",
      "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  if (isHttps(req)) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.use(compression());

const originOf = req => `${isHttps(req) ? 'https' : req.protocol}://${req.get('host')}`;

app.get('/', (req, res) => {
  if (!isAdmin(req)) recordView(req);
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(renderPage(getContent(), { nonce: res.locals.nonce, version: VERSION, origin: originOf(req) }));
});
app.get('/favicon.svg', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600').type('image/svg+xml').send(renderFavicon(getContent()));
});
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nSitemap: ${originOf(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${originOf(req)}/</loc><lastmod>${getContent().updatedAt.slice(0, 10)}</lastmod></url></urlset>`);
});

app.use('/uploads', express.static(PATHS.uploads, { index: false, maxAge: '30d', immutable: true }));
app.use(express.static(PATHS.public, { index: false, maxAge: IS_PROD ? '1d' : 0 }));
app.use(ADMIN_PATH, (req, res, next) => {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-cache' });
  next();
}, express.static(PATHS.admin));

app.use('/api/admin', adminApi());
app.use(publicApi());

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).type('html').send(renderNotFound(getContent(), { version: VERSION, nonce: res.locals.nonce }));
});

app.use((err, req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message;
  if (err.type === 'entity.too.large') message = 'That file is too large (max 10 MB).';
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed request body.'; }
  if (status >= 500) {
    console.error(err);
    message = 'Something went wrong on the server.';
  }
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
  res.status(status).type('text').send(message);
});

await initStore();
await initAuth();
await initStats();

const server = app.listen(PORT, () => {
  console.log(`\n  Portfolio:        http://localhost:${PORT}`);
  console.log(`  Admin dashboard:  http://localhost:${PORT}${ADMIN_PATH}\n`);
});

const shutdown = async () => {
  await flushStats().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
