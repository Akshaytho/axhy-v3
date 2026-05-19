/**
 * OpenAI circuit breaker — Redis-backed state so all replicas trip together
 * during an OpenAI outage (friend's review Wave A.2 #5).
 *
 * Wave A.2.1 follow-up — addresses friend's Wave A.2 review:
 *   #9  HALF_OPEN race fixed via Lua CAS (one trial call, not N).
 *   #11 recordSuccess is a no-op when already CLOSED (saves 3 Redis ops/req
 *       under the steady-state).
 *   #12 keys go through lib/redis-keys.ts for env-namespacing.
 *   #17 parseInt + NaN guards (silent misconfig used to leave breaker dead).
 *
 * State machine:
 *   CLOSED   — calls go through. On failure, increment failure counter.
 *              After `FAILURE_THRESHOLD` consecutive failures within
 *              `FAILURE_WINDOW_MS`, transition to OPEN.
 *   OPEN     — calls fast-fail without hitting OpenAI. After
 *              `OPEN_DURATION_MS`, transition to HALF_OPEN.
 *   HALF_OPEN — exactly ONE trial call is allowed (Lua CAS picks the winner).
 *               Success → CLOSED + reset counter. Failure → back to OPEN.
 *
 * Graceful degradation: if Redis is unreachable, the breaker is CLOSED
 * (let traffic through). Same fail-open philosophy as rate-limit + concurrency.
 *
 * @derives(ADR-0024)
 * @derives(friend review Wave A.2 #5, #9, #11, #12, #17)
 */

import { getRedis } from './redis.js';
import { RedisKeys } from './redis-keys.js';

/**
 * Safe int env parser — defaults silently when the env var is missing OR
 * non-numeric. Friend review #17: bare `parseInt(env, 10)` returns NaN
 * for malformed values, and `n >= NaN` is always false, so a typo in
 * `OPENAI_CIRCUIT_FAILURE_THRESHOLD=abc` would silently leave the breaker
 * permanently CLOSED.
 */
function safeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const FAILURE_THRESHOLD = safeIntEnv('OPENAI_CIRCUIT_FAILURE_THRESHOLD', 5);
const FAILURE_WINDOW_MS = safeIntEnv('OPENAI_CIRCUIT_FAILURE_WINDOW_MS', 60_000);
const OPEN_DURATION_MS = safeIntEnv('OPENAI_CIRCUIT_OPEN_DURATION_MS', 30_000);

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitOpenError extends Error {
  readonly code = 'OPENAI_CIRCUIT_OPEN';
  constructor(public readonly retryAfterMs: number) {
    super(`OpenAI circuit is OPEN. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`);
  }
}

/**
 * Lua: atomic OPEN → HALF_OPEN transition for one caller.
 *   KEYS[1] = state key
 *   KEYS[2] = open-until key
 *   ARGV[1] = now (ms epoch as string)
 * Returns: 'OPEN' | 'HALF_OPEN' | 'CLOSED' | 'TRIAL_WINNER'.
 * 'TRIAL_WINNER' means we won the CAS and may proceed with a trial call;
 * 'HALF_OPEN' means another caller is already trialling — we fast-fail.
 */
const HALF_OPEN_CAS_SCRIPT = `
  local state = redis.call('GET', KEYS[1])
  if state == 'OPEN' then
    local openUntil = tonumber(redis.call('GET', KEYS[2]) or '0')
    if tonumber(ARGV[1]) >= openUntil then
      -- Window elapsed: race to the trial slot.
      if redis.call('SET', KEYS[1], 'HALF_OPEN', 'XX') then
        return 'TRIAL_WINNER'
      end
      -- Someone else flipped us to HALF_OPEN concurrently — they trial, we open.
      return 'HALF_OPEN'
    end
    return 'OPEN'
  end
  if state == 'HALF_OPEN' then
    return 'HALF_OPEN'
  end
  return 'CLOSED'
`;

/**
 * Check the breaker state. Returns the state seen by THIS caller — never
 * returns 'HALF_OPEN' to two callers concurrently (Lua CAS picks one
 * 'TRIAL_WINNER', the rest see 'HALF_OPEN' and get rejected as OPEN).
 * Throws `CircuitOpenError` when the breaker is OPEN or HALF_OPEN-but-not-me.
 */
export async function assertCircuitClosed(): Promise<CircuitState> {
  let redis;
  try {
    redis = getRedis();
  } catch {
    return 'CLOSED'; // Redis down → assume CLOSED so traffic flows
  }

  try {
    const now = Date.now();
    const result = (await redis.eval(
      HALF_OPEN_CAS_SCRIPT,
      2,
      RedisKeys.circuitState(),
      RedisKeys.circuitOpenUntil(),
      String(now),
    )) as string;

    if (result === 'CLOSED' || result === 'TRIAL_WINNER') {
      return 'CLOSED';
    }
    // OPEN or HALF_OPEN (another caller already trialling) → fast-fail.
    const openUntilRaw = await redis.get(RedisKeys.circuitOpenUntil());
    const openUntil = openUntilRaw ? Number(openUntilRaw) : now + OPEN_DURATION_MS;
    const retryAfterMs = Math.max(1, openUntil - now);
    throw new CircuitOpenError(retryAfterMs);
  } catch (err) {
    if (err instanceof CircuitOpenError) throw err;
    return 'CLOSED'; // Redis blip → fail open
  }
}

/**
 * Record a successful OpenAI call. Friend review #11: only writes when the
 * breaker isn't already CLOSED (the steady state). Saves 3 Redis ops/req
 * at 100 rps × 60s = ~18k unnecessary ops/min.
 */
export async function recordSuccess(): Promise<void> {
  let redis;
  try {
    redis = getRedis();
  } catch {
    return;
  }
  try {
    const state = await redis.get(RedisKeys.circuitState());
    if (state === null || state === 'CLOSED') return; // hot path no-op
    await redis
      .multi()
      .set(RedisKeys.circuitState(), 'CLOSED')
      .del(RedisKeys.circuitFailures())
      .del(RedisKeys.circuitOpenUntil())
      .exec();
  } catch (err) {
    console.warn(
      { event: 'circuit.record_success_failed', err: errMsg(err) },
      'circuit-breaker: success-recording failed',
    );
  }
}

/**
 * Record a failed OpenAI call. Increments the failure counter within the
 * window. If the counter exceeds the threshold, transition to OPEN with
 * an expiry of `OPEN_DURATION_MS`. Returns the new state.
 */
export async function recordFailure(): Promise<CircuitState> {
  let redis;
  try {
    redis = getRedis();
  } catch {
    return 'CLOSED';
  }
  try {
    const failures = await redis.incr(RedisKeys.circuitFailures());
    if (failures === 1) {
      await redis.pexpire(RedisKeys.circuitFailures(), FAILURE_WINDOW_MS);
    }
    if (failures >= FAILURE_THRESHOLD) {
      const openUntil = Date.now() + OPEN_DURATION_MS;
      await redis
        .multi()
        .set(RedisKeys.circuitState(), 'OPEN')
        .set(RedisKeys.circuitOpenUntil(), String(openUntil))
        .pexpire(RedisKeys.circuitOpenUntil(), OPEN_DURATION_MS + 1_000)
        .exec();
      console.warn(
        {
          event: 'circuit.opened',
          failures,
          openUntil,
          threshold: FAILURE_THRESHOLD,
          windowMs: FAILURE_WINDOW_MS,
        },
        'circuit-breaker: OPEN — fast-failing OpenAI calls',
      );
      return 'OPEN';
    }
    return 'CLOSED';
  } catch (err) {
    console.warn(
      { event: 'circuit.record_failure_failed', err: errMsg(err) },
      'circuit-breaker: failure-recording failed',
    );
    return 'CLOSED';
  }
}

/**
 * Test/ops helper — force the breaker into a specific state. Production
 * code does not call this; emergency-override script can.
 */
export async function forceCircuitState(state: CircuitState): Promise<void> {
  const redis = getRedis();
  if (state === 'OPEN') {
    const openUntil = Date.now() + OPEN_DURATION_MS;
    await redis
      .multi()
      .set(RedisKeys.circuitState(), 'OPEN')
      .set(RedisKeys.circuitOpenUntil(), String(openUntil))
      .pexpire(RedisKeys.circuitOpenUntil(), OPEN_DURATION_MS + 1_000)
      .exec();
  } else if (state === 'CLOSED') {
    await redis
      .multi()
      .set(RedisKeys.circuitState(), 'CLOSED')
      .del(RedisKeys.circuitFailures())
      .del(RedisKeys.circuitOpenUntil())
      .exec();
  } else {
    await redis.set(RedisKeys.circuitState(), 'HALF_OPEN');
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
