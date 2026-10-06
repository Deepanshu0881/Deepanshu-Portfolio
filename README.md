# Developer Portfolio + Admin Dashboard

A minimal, fast developer portfolio where **every piece of content is editable from a password-protected admin dashboard** — no code changes, no redeploys.

- **Public site** → `http://localhost:3000`
- **Admin dashboard** → `http://localhost:3000/admin` (path configurable)

## Quick start

```bash
npm install
npm start          # or: npm run dev  (auto-restarts on file changes)
```

On first start an admin password is generated, printed in the console and saved to
`data/initial-admin-password.txt`. Sign in at `/admin`, then set your own password in **Security**
(the file is deleted automatically when you do).

> Requires Node.js 20.12 or newer.

## What's on the site

| Section | Edited in dashboard under |
| --- | --- |
| Hero / introduction (photo, name, typed roles, headline, availability, local time, socials) | Introduction |
| About (bio with markdown, `developer.ts` code card, auto stats) | Introduction |
| Tech stack (filterable by category, brand icons, proficiency) | Technologies |
| Experience timeline | Experience |
| Projects (featured cards + grid, tag filters) | Projects |
| Achievements (awards, certifications, talks, hackathons…) | Achievements |
| Contact (copy-email, socials, contact form → dashboard inbox) | Introduction + Messages |

Sections can be hidden or renamed in **Appearance & SEO**; empty sections hide themselves.

### Extras
- **Command palette** — `Ctrl/⌘ + K` to jump to sections, search projects, copy email, switch theme.
- **Interactive terminal** — press `` ` `` and try `help`, `neofetch`, `skills`, `projects`, `open 1`, `hire`.
- Dark/light theme with a circular reveal transition, live accent color, scroll progress bar,
  cursor spotlight on cards, count-up stats, server-side rendering + JSON-LD for SEO, dynamic favicon,
  a terminal-style 404 page, and a friendly hello in the DevTools console.

## Admin dashboard

- Overview with page views (privacy-friendly, no cookies or stored IPs), unread messages and a setup checklist
- Drag-and-drop reordering, show/hide per item, featured projects
- Image uploads are resized and converted to WebP in the browser before upload; PDF résumé upload
- Unsaved-changes bar with `Ctrl/⌘ + S` to save & publish
- Automatic backup on every save (last 30), one-click restore, JSON export/import
- Contact-form inbox with read/unread and reply-by-email

## Security

Password auth was chosen over SMS OTP: it's free, works anywhere and has no carrier or DLT-registration dependency.
For a second factor, the dashboard supports **authenticator-app 2FA (TOTP)** — also free and more secure than SMS.

- Passwords hashed with scrypt; HMAC-signed, `HttpOnly`, `SameSite=Strict` session cookies (7 days)
- Login rate limiting (5 attempts / 15 min per IP), TOTP replay protection
- Changing the password signs out all other sessions; "sign out other devices" button
- CSRF protection via a required custom header, strict Content-Security-Policy with nonces
- Uploads are type-checked by magic bytes (no SVG/HTML), all content is sanitized server-side and escaped on render

**Locked out?** Run `npm run reset-admin` on the server: it generates a new password, turns off 2FA and signs out every session. Restart the server afterwards.

## Configuration

Copy `.env.example` to `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ADMIN_PATH` | `/admin` | Where the dashboard lives (e.g. `/my-secret-panel`) |
| `ADMIN_PASSWORD` | random | Initial password, only used the very first time |
| `DATA_DIR` | `./data` | Content, uploads, messages, backups |
| `TRUST_PROXY` | — | Set to `1` behind a proxy/platform load balancer |
| `NODE_ENV` | — | `production` enables longer asset caching |

## Deploying

The app is a single Node process that stores everything in `DATA_DIR`, so any host with a **persistent disk** works:

- **VPS** (DigitalOcean, Hetzner, Lightsail, Oracle free tier…): `npm ci --omit=dev && NODE_ENV=production node server.js` behind Nginx/Caddy for HTTPS.
- **Docker**: `docker build -t portfolio . && docker run -p 3000:3000 -v portfolio-data:/app/data portfolio`
- **Railway / Render / Fly.io**: attach a volume and set `DATA_DIR` to its mount path, plus `TRUST_PROXY=1`.

Serverless hosts with read-only filesystems (e.g. Vercel, Netlify) won't keep your edits.
Back up `data/` (or use **Backups → Export JSON**) before moving servers.

## Project structure

```
server.js            Express app: security headers, SSR, static files, routes
src/schema.js        Content schema + sanitizer (single source of truth)
src/render.js        Server-side rendering of the portfolio
src/store.js         JSON file storage, backups, uploads, messages
src/auth.js          Passwords, sessions, 2FA state
src/totp.js          RFC 6238 authenticator codes
src/routes/          Admin API and public API
public/              Site CSS/JS and the shared icon set
admin/               Dashboard (vanilla JS, no build step)
seed/content.json    Dummy content used on first start
scripts/reset-admin.js
```
