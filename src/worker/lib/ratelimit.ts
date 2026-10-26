/**
 * Best-effort, dependency-free rate limiting. Each process keeps its own counters, which is exactly
 * what you want for a single-container deployment and still useful on Workers (per isolate): the goal
 * is to stop one abusive client from filling the database, not to be a billing-grade quota.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function isRateLimited(key: string, limitPerMinute: number, now = Date.now()): boolean {
  if (limitPerMinute <= 0) return false;
  if (buckets.size > 20_000) {
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    if (buckets.size > 20_000) buckets.clear();
  }
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + 60_000 });
    return false;
  }
  b.count++;
  return b.count > limitPerMinute;
}

/** Exposed for tests. */
export function resetRateLimits() {
  buckets.clear();
}
