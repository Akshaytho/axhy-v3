/**
 * Chat request idempotency dedup — Redis-backed per ADR-0024.
 *
 * Wave A.2.1 follow-up — addresses friend's Wave A.2 review:
 *   #12 keys go through lib/redis-keys.ts for env-namespacing.
 *   #15 dropped the unused `_prisma` parameter. The ADR-0024 rollback path
 *       is documented in the ADR itself; we don't ship dead parameters
 *       just to support a hypothetical rollback signature.
 *   #18 TTL lowered from 10 min to 120 s. Chat is conversational; legitimate
 *       retries (network blip, double-tap) happen within 60-120s, not
 *       10 minutes. A 5-minute-old "cached response" served to an
 *       intentional re-send would be stale.
 *
 * Reserve-then-execute (friend review Wave A.2 #4):
 *   1. `reserveIdempotency` does atomic `SET key PROCESSING NX PX 120s`.
 *      Success → we own the slot, proceed with the AI call.
 *      Failure → another request already started; caller serves the cache
 *      hit or returns 409 IDEMPOTENCY_IN_FLIGHT.
 *   2. `recordIdempotency` finalises with the actual response via
 *      `SET key <json> XX PX 120s`.
 *
 * @derives(master-plan §G)
 * @derives(ADR-0024 — Redis for caches)
 * @derives(friend review Wave A.2 #4, #12, #15, #18)
 */

import { getRedis } from './redis.js';
import { RedisKeys } from './redis-keys.js';

/** Friend review #18 — 120s is enough for legitimate mobile retry without
 *  serving stale responses to intentional re-sends. */
const TTL_MS = 120 * 1000;
const PROCESSING_SENTINEL = '__PROCESSING__';

export type CheckResult =
  | { cached: true; responseJson: unknown }
  | { cached: false }
  | { cached: 'in_flight' };

/**
 * Look up an existing idempotency entry. Returns:
 *   - `{ cached: true, responseJson }` when a finalised response exists.
 *   - `{ cached: 'in_flight' }` when another request is mid-AI-call.
 *   - `{ cached: false }` when no entry exists.
 *
 * Friend review #15 — the `_prisma` param was dropped. The ADR-0024
 * rollback story doesn't justify shipping dead code; if we ever
 * rollback, we change the signature then.
 */
export async function checkIdempotency(
  companyId: string,
  idempotencyKey: string,
): Promise<CheckResult> {
  const redis = getRedis();
  const raw = await redis.get(RedisKeys.chatIdempotency(companyId, idempotencyKey));
  if (raw === null) return { cached: false };
  if (raw === PROCESSING_SENTINEL) return { cached: 'in_flight' };
  try {
    return { cached: true, responseJson: JSON.parse(raw) };
  } catch {
    await redis.del(RedisKeys.chatIdempotency(companyId, idempotencyKey));
    return { cached: false };
  }
}

/** Atomic reservation. Returns true if THIS caller owns the slot. */
export async function reserveIdempotency(
  companyId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const redis = getRedis();
  const reply = await redis.set(
    RedisKeys.chatIdempotency(companyId, idempotencyKey),
    PROCESSING_SENTINEL,
    'PX',
    TTL_MS,
    'NX',
  );
  return reply === 'OK';
}

/** Finalise with the actual response (XX = only if already exists). */
export async function recordIdempotency(
  companyId: string,
  idempotencyKey: string,
  responseJson: object,
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    RedisKeys.chatIdempotency(companyId, idempotencyKey),
    JSON.stringify(responseJson),
    'PX',
    TTL_MS,
    'XX',
  );
}

/** Release a PROCESSING reservation without persisting a response. */
export async function releaseIdempotency(companyId: string, idempotencyKey: string): Promise<void> {
  const redis = getRedis();
  const lua = `
    local v = redis.call('GET', KEYS[1])
    if v == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
  `;
  await redis.eval(
    lua,
    1,
    RedisKeys.chatIdempotency(companyId, idempotencyKey),
    PROCESSING_SENTINEL,
  );
}
