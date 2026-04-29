/**
 * Redis-based fixed-window rate limiter.
 *
 * Fail-open: if Redis is unavailable (dev environments without Redis,
 * transient infra failures), the limiter does NOT block requests. Operators
 * should monitor `event: rate_limit_redis_unavailable` and pair this with
 * upstream WAF / load-balancer limits in production.
 */

import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

export interface RateLimitOptions {
  /** Identifier for the bucket (e.g. `login:1.2.3.4`, `register:user@x.com`) */
  key: string;
  /** Max requests allowed in the window */
  limit: number;
  /** Window length in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetSec: number;
}

/**
 * Increment the counter for `key`. If it exceeds `limit` within `windowSec`,
 * returns `{ ok: false }`. On Redis failure returns `{ ok: true }` (fail open).
 */
export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const fullKey = `rl:${opts.key}`;
  try {
    const count = await redis.incr(fullKey);
    if (count === 1) {
      await redis.expire(fullKey, opts.windowSec);
    }
    const ttl = await redis.ttl(fullKey);
    const ok = count <= opts.limit;
    if (!ok) {
      logger.warn({ event: 'rate_limit_exceeded', key: opts.key, count, limit: opts.limit });
    }
    return {
      ok,
      remaining: Math.max(0, opts.limit - count),
      resetSec: ttl > 0 ? ttl : opts.windowSec,
    };
  } catch (error) {
    logger.warn({
      event: 'rate_limit_redis_unavailable',
      key: opts.key,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: true, remaining: opts.limit, resetSec: opts.windowSec };
  }
}

/**
 * Extract client IP from a Next.js Request, with a fallback to a stable
 * pseudo-anonymous bucket so a missing header doesn't disable the limiter
 * for everyone behind a misconfigured proxy.
 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
