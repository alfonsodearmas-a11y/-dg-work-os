// Minimal in-memory sliding-window rate limiter for the public auth endpoints
// (forgot-password / magic-link). Best-effort per server instance — Fluid
// Compute reuses instances so this catches bursts; the real abuse backstop is
// that both endpoints only ever email the account owner and never reveal
// whether an account exists.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const buckets = new Map<string, number[]>();

function prune(now: number) {
  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size < 1000) return;
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) buckets.delete(key);
    else buckets.set(key, live);
  }
}

/** Record a hit for `key`; returns true if the key is within `limit` per window. */
export function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  prune(now);
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/** Per-email + per-IP limits for an auth email endpoint. */
export function checkAuthEmailRateLimit(email: string, ip: string): boolean {
  // 5 emails per address per window; 20 requests per IP per window.
  return checkRateLimit(`email:${email}`, 5) && checkRateLimit(`ip:${ip}`, 20);
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}
