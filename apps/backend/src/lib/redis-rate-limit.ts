/**
 * Redis-backed sliding-window rate limiter — replaces the per-process
 * `Map`-based limiter that became fake protection across multi-replica
 * deploys (friend's Wave A.2 finding #8).
 *
 * Wave A.2.1 follow-up — addresses friend's review:
 *   #10 atomicity via Lua (was two separate pipelines with a race window).
 *   #12 keys go through lib/redis-keys.ts for env-namespacing.
 *
 * Algorithm (in one Lua script, atomic):
 *   1. ZREMRANGEBYSCORE to evict entries older than the window.
 *   2. ZCARD remaining.
 *   3. If count >= limit → return -1 (reject) without adding.
 *   4. Else ZADD now + PEXPIRE.
 *
 * Graceful degradation: Redis unreachable → fail OPEN. Set
 * `AXHY_RATE_LIMIT_FAIL_CLOSED=1` to reverse.
 *
 * @derives(ADR-0024)
 * @derives(friend review Wave A.2 #7, #8, #10, #12)
 */

import type { Redis } from 'ioredis';
import pino from 'pino';

import { getRedis } from './redis.js';
import { RedisKeys } from './redis-keys.js';

const log = pino({ name: 'redis-rate-limit' });

export type RateLimitCheckArgs = {
  /** Route key, e.g. "chat:messages" or "chat:apply" or "auth:otp". */
  route: string;
  /** Subject key — usually `userId` or phone or IP. */
  subject: string;
  /** Max requests allowed in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitCheckResult =
  | { ok: true; remaining: number; resetAtMs: number }
  | { ok: false; reason: 'RATE_LIMITED'; retryAfterMs: number; resetAtMs: number };

/**
 * Lua script — atomic check + consume. Returns:
 *   { -1, earliestScore }  → over the limit (caller computes retry-after)
 *   { count, 0 }           → allowed, `count` is post-consume slot count
 *
 *   KEYS[1] = the ZSET key
 *   ARGV[1] = now (ms epoch)
 *   ARGV[2] = window cutoff (now - windowMs)
 *   ARGV[3] = limit
 *   ARGV[4] = unique member (timestamp + random suffix)
 *   ARGV[5] = pexpire ms (windowMs + 1000 safety)
 */
const SCRIPT = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[2])
  local count = redis.call('ZCARD', KEYS[1])
  if count >= tonumber(ARGV[3]) then
    local earliest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    local earliestScore = 0
    if #earliest >= 2 then earliestScore = tonumber(earliest[2]) end
    return {-1, earliestScore}
  end
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
  return {count + 1, 0}
`;

export async function checkAndConsumeRateLimit(
  args: RateLimitCheckArgs,
  redisOverride?: Redis,
): Promise<RateLimitCheckResult> {
  const now = Date.now();
  const cutoff = now - args.windowMs;
  const key = RedisKeys.rateLimit(args.route, args.subject);

  let redis: Redis;
  try {
    redis = redisOverride ?? getRedis();
  } catch (err) {
    return failOpenOrClosed(args, now, err);
  }

  try {
    const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    const result = (await redis.eval(
      SCRIPT,
      1,
      key,
      String(now),
      String(cutoff),
      String(args.limit),
      member,
      String(args.windowMs + 1_000),
    )) as [number, number];
    const [postCount, earliestScore] = result;
    if (postCount === -1) {
      const resetAtMs = (earliestScore || now - args.windowMs) + args.windowMs;
      const retryAfterMs = Math.max(0, resetAtMs - now);
      return { ok: false, reason: 'RATE_LIMITED', retryAfterMs, resetAtMs };
    }
    return {
      ok: true,
      remaining: Math.max(0, args.limit - postCount),
      resetAtMs: now + args.windowMs,
    };
  } catch (err) {
    return failOpenOrClosed(args, now, err);
  }
}

function failOpenOrClosed(
  args: RateLimitCheckArgs,
  now: number,
  err: unknown,
): RateLimitCheckResult {
  if (process.env.AXHY_RATE_LIMIT_FAIL_CLOSED === '1') {
    return {
      ok: false,
      reason: 'RATE_LIMITED',
      retryAfterMs: args.windowMs,
      resetAtMs: now + args.windowMs,
    };
  }
  log.warn(
    { event: 'rate_limit.redis_unreachable', err: errMsg(err), route: args.route },
    'rate-limit: Redis unreachable — failing open',
  );
  return { ok: true, remaining: args.limit, resetAtMs: now + args.windowMs };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
