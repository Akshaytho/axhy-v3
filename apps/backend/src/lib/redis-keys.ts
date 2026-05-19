/**
 * Central Redis key registry — every Redis key in the backend goes through
 * this module so:
 *
 *   (a) Every key is environment-namespaced (friend review #12). Dev,
 *       staging, prod sharing a Redis instance won't collide.
 *   (b) Every key + its TTL + its owner is documented in one place
 *       (friend review #21). When debugging in prod, you read this file
 *       to understand what keys exist.
 *
 * Namespace: `AXHY_REDIS_NAMESPACE` env var. Defaults to NODE_ENV
 * (production / staging / development / test). Pre-Wave-A.3 deployments
 * had no prefix — set the env when you redeploy or run a one-time SCAN
 * + RENAME migration. Old keys naturally expire via TTL.
 *
 * @derives(ADR-0024)
 * @derives(master-plan §G)
 * @derives(friend review Wave A.2 #12 + #21)
 */

const ENV_NAMESPACE = process.env.AXHY_REDIS_NAMESPACE ?? process.env.NODE_ENV ?? 'development';

/** Internal — builds the namespaced key. */
function k(unprefixed: string): string {
  return `${ENV_NAMESPACE}:${unprefixed}`;
}

export const RedisKeys = {
  // ── Rate limiter (sliding window ZSET, members are timestamps) ────────
  // TTL: window length + 1s. Owner: lib/redis-rate-limit.ts.
  rateLimit: (route: string, subject: string): string => k(`rl:${route}:${subject}`),

  // ── Chat concurrency semaphore (ZSET, members are slot tokens) ────────
  // TTL: SLOT_TTL_MS + 5s. Owner: lib/chat-concurrency.ts.
  chatConcurrency: (): string => k('chatconc'),

  // ── OpenAI circuit breaker state (3 keys) ─────────────────────────────
  // Owner: lib/openai-circuit-breaker.ts.
  circuitState: (): string => k('openai:cb:state'),
  circuitFailures: (): string => k('openai:cb:failures'),
  circuitOpenUntil: (): string => k('openai:cb:open_until'),

  // ── Chat idempotency (SET NX PX 120s) ─────────────────────────────────
  // Friend review #18 — TTL lowered to 120s for chat. Owner: lib/chat-idempotency.ts.
  chatIdempotency: (companyId: string, idempotencyKey: string): string =>
    k(`idem:chat:${companyId}:${idempotencyKey}`),

  // ── OTP store (HASH of issuedAt → codeHash; ZSET for rate limit) ──────
  // TTL: 5min (storage), 15min (rate-limit window). Owner: lib/otp-store.ts.
  otpStore: (phone: string): string => k(`otp:phone:${phone}`),
  otpRateLimit: (phone: string): string => k(`otp:rl:${phone}`),
} as const;

/** Read the current env namespace — useful for tests + diagnostics. */
export function getRedisNamespace(): string {
  return ENV_NAMESPACE;
}
