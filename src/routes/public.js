import express from 'express';
import * as store from '../store.js';
import { createLimiter } from '../ratelimit.js';
import { publicContent } from '../render.js';

// 5 contact messages per IP per hour.
const contactLimiter = createLimiter({ windowMs: 60 * 60_000, max: 5 });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const field = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

export function publicApi() {
  const r = express.Router();

  r.get('/api/content', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(publicContent(store.getContent()));
  });

  // Works both with fetch (JSON) and as a plain HTML form post when JavaScript is disabled.
  r.post('/api/contact',
    express.json({ limit: '20kb' }),
    express.urlencoded({ extended: false, limit: '20kb' }),
    async (req, res) => {
      const wantsJson = req.is('application/json');
      const reply = (status, payload) => (wantsJson
        ? res.status(status).json(payload)
        : res.redirect(303, `/?contact=${payload.ok ? 'sent' : 'error'}#contact`));

      const body = req.body ?? {};
      if (body.company) return reply(200, { ok: true }); // honeypot: silently drop bots

      const name = field(body.name, 100).replace(/\s+/g, ' ');
      const email = field(body.email, 160);
      const message = field(body.message, 5000);
      if (!name || !EMAIL_RE.test(email) || message.length < 2) {
        return reply(400, { error: 'Please add your name, a valid email and a message.' });
      }
      const wait = contactLimiter.blockedFor(req.ip);
      if (wait) return reply(429, { error: 'You’ve sent a few messages already — please try again later.' });

      contactLimiter.hit(req.ip);
      await store.addMessage({ name, email, message });
      reply(200, { ok: true });
    });

  return r;
}
