/**
 * Fixed-window counter keyed by whatever the caller chooses (we use IP + email
 * for sign-in). In memory, so it resets on restart and isn't shared between
 * instances. That's fine for slowing down password guessing on a single node.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt. Returns how long to wait if the key is over the limit. */
  attempt(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = this.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return { allowed: true };
    }

    entry.count += 1;
    if (entry.count > this.max) return { allowed: false, retryAfterMs: entry.resetAt - now };
    return { allowed: true };
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  // Keep the map from growing without bound under a spray of distinct keys.
  private sweep(now: number) {
    if (this.hits.size < 10_000) return;
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
