// Privacy-friendly page view counter: daily totals only, no cookies, no IPs stored.
import crypto from 'node:crypto';
import { PATHS } from './paths.js';
import { readJSON, writeJSON } from './store.js';

const KEEP_DAYS = 400;
const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests|axios|node-fetch/i;

let stats = { days: {} };
let dirty = false;
let today = '';
let seenToday = new Set();
const salt = crypto.randomBytes(16);

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export async function initStats() {
  stats = await readJSON(PATHS.stats, { days: {} });
  const timer = setInterval(flushStats, 15_000);
  timer.unref();
}

export async function flushStats() {
  if (!dirty) return;
  dirty = false;
  const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 86400_000));
  for (const key of Object.keys(stats.days)) if (key < cutoff) delete stats.days[key];
  await writeJSON(PATHS.stats, stats);
}

export function recordView(req) {
  const ua = req.get('user-agent') || '';
  if (!ua || BOT_RE.test(ua)) return;
  const key = dayKey();
  if (key !== today) { today = key; seenToday = new Set(); }
  const day = (stats.days[key] ||= { views: 0, visitors: 0 });
  day.views += 1;
  const visitor = crypto.createHash('sha256').update(salt).update(`${req.ip}|${ua}|${key}`).digest('hex').slice(0, 16);
  if (!seenToday.has(visitor)) { seenToday.add(visitor); day.visitors += 1; }
  dirty = true;
}

export function statsSummary(days = 30) {
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86400_000));
    series.push({ date: key, ...(stats.days[key] || { views: 0, visitors: 0 }) });
  }
  const sum = (arr, k) => arr.reduce((n, d) => n + d[k], 0);
  const all = Object.values(stats.days);
  return {
    series,
    today: series.at(-1),
    last7: { views: sum(series.slice(-7), 'views'), visitors: sum(series.slice(-7), 'visitors') },
    last30: { views: sum(series, 'views'), visitors: sum(series, 'visitors') },
    total: { views: sum(all, 'views'), visitors: sum(all, 'visitors') },
  };
}
