// Fixed-window limiter. In-memory only: swap for Redis before running more than one instance.
const hits = new Map<string, { n: number; reset: number }>();
export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now(), h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
  return ++h.n > max;
}
