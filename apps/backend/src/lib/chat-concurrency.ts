/**
 * Distributed chat-concurrency semaphore — Redis-backed replacement for
 * the per-process counter that became fake protection across multi-replica
 * deploys (friend's Wave A.2 review #8).
 *
 * Wave A.2.1 follow-up — addresses friend's review:
 *   #12 keys go through lib/redis-keys.ts for env-namespacing.
 *   #17 parseInt + NaN guards.
 *   #19 SLOT_TTL_MS bumped to 120s (was 60s, dangerously close to the 50s
 *       chat timeout + 5-10s persistChatTurn). Now 2× the chat timeout
 *       so legitimate handlers aren't reaped mid-write.
 *   #20 SCRIPT LOAD + EVALSHA via the SHA cache (less GC pressure than
 *       sending the script string every call).
 *
 * Cap: 50 concurrent in-flight chat tool-loop calls *across all replicas*
 * (configurable via `CHAT_MAX_CONCURRENT` env). Implementation uses a
 * Redis ZSET keyed via `RedisKeys.chatConcurrency()` where members are
 * unique slot tokens and scores are insertion timestamps. Anything older
 * than `SLOT_TTL_MS` is reaped on acquire so a crashed handler doesn't
 * leak slots forever.
 *
 * Slot lifecycle:
 *   tryAcquireChatSlot() → returns a `token` string when acquired, `null`
 *   when over the cap. Caller stores the token and passes it to
 *   `releaseChatSlot(token)` in a `finally` block.
 *
 * Graceful degradation: Redis unreachable → fail OPEN (allow). Same
 * rationale as redis-rate-limit.
 *
 * @derives(ADR-0024)
 * @derives(friend review Wave A.2 #5, #8, #12, #17, #19, #20)
 */

import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';

import { getRedis } from './redis.js';
import { RedisKeys } from './redis-keys.js';

function safeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const MAX_CONCURRENT = safeIntEnv('CHAT_MAX_CONCURRENT', 50);
/** Crashed-handler slot reap window. 2× the 50s chat timeout +
 *  persistChatTurn budget — friend review #19 was correct that 60s left
 *  ~10s margin which let live handlers get reaped mid-write under load. */
const SLOT_TTL_MS = safeIntEnv('CHAT_SLOT_TTL_MS', 120_000);

export type SlotToken = string;

const ACQUIRE_SCRIPT = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
  local count = redis.call('ZCARD', KEYS[1])
  if count >= tonumber(ARGV[2]) then
    return -1
  end
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
  return count + 1
`;

/**
 * SCRIPT LOAD + EVALSHA cache. Friend review #20 — sending the Lua
 * source on every call is wasteful. Load once, evalsha thereafter; if
 * Redis was restarted (script flushed), fall back to EVAL then re-cache.
 */
let acquireSha: string | null = null;
async function ensureAcquireSha(redis: Redis): Promise<string> {
  if (acquireSha) return acquireSha;
  acquireSha = (await redis.script('LOAD', ACQUIRE_SCRIPT)) as string;
  return acquireSha;
}

async function evalAcquire(redis: Redis, args: ReadonlyArray<string>): Promise<number> {
  const sha = await ensureAcquireSha(redis);
  try {
    const res = (await redis.evalsha(sha, 1, RedisKeys.chatConcurrency(), ...args)) as number;
    return res;
  } catch (err) {
    // Redis flushed the script cache (e.g. after restart) — fall back to
    // raw EVAL once, and re-cache the SHA for next time.
    if (err instanceof Error && /NOSCRIPT/i.test(err.message)) {
      acquireSha = null;
      return (await redis.eval(ACQUIRE_SCRIPT, 1, RedisKeys.chatConcurrency(), ...args)) as number;
    }
    throw err;
  }
}

/**
 * Try to acquire a chat slot. Returns a token to pass to `releaseChatSlot`
 * on success; `null` when the global cap is reached.
 */
export async function tryAcquireChatSlot(): Promise<SlotToken | null> {
  const now = Date.now();
  let redis;
  try {
    redis = getRedis();
  } catch {
    return `fallback-${randomUUID()}`;
  }

  try {
    const token = `${now}-${randomUUID()}`;
    const reapBefore = now - SLOT_TTL_MS;
    const res = await evalAcquire(redis, [
      String(reapBefore),
      String(MAX_CONCURRENT),
      String(now),
      token,
      String(SLOT_TTL_MS + 5_000),
    ]);
    if (res < 0) return null;
    return token;
  } catch (err) {
    console.warn(
      { event: 'chat_concurrency.acquire_failed', err: errMsg(err) },
      'chat-concurrency: acquire failed — failing open',
    );
    return `fallback-${randomUUID()}`;
  }
}

/**
 * Release a previously acquired slot. Safe to call with a fallback token
 * (no-op when the token doesn't match a real slot).
 */
export async function releaseChatSlot(token: SlotToken): Promise<void> {
  if (token.startsWith('fallback-')) return;
  let redis;
  try {
    redis = getRedis();
  } catch {
    return;
  }
  try {
    await redis.zrem(RedisKeys.chatConcurrency(), token);
  } catch (err) {
    console.warn(
      { event: 'chat_concurrency.release_failed', err: errMsg(err), token },
      'chat-concurrency: release failed — slot will reap on TTL',
    );
  }
}

/**
 * Read current in-flight count across all replicas. Used by observability
 * + health checks. Not used in the hot path.
 */
export async function getChatInFlight(): Promise<number> {
  let redis;
  try {
    redis = getRedis();
  } catch {
    return 0;
  }
  try {
    await redis.zremrangebyscore(RedisKeys.chatConcurrency(), 0, Date.now() - SLOT_TTL_MS);
    return await redis.zcard(RedisKeys.chatConcurrency());
  } catch {
    return 0;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
