// Tiny in-memory fixed-window rate limiter keyed by IP (or any string).
export function createLimiter({ windowMs, max }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweep.unref();

  const entryFor = key => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    return entry;
  };

  return {
    /** Seconds until the key may try again, or 0 if it is not blocked. */
    blockedFor(key) {
      const entry = entryFor(key);
      return entry.count >= max ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
    },
    hit(key) { entryFor(key).count += 1; },
    reset(key) { hits.delete(key); },
  };
}
