/**
 * Real-Redis tests for the Wave A.2 primitives (ADR-0024):
 *   - lib/redis-rate-limit.ts (sliding window)
 *   - lib/chat-concurrency.ts (distributed semaphore)
 *   - lib/openai-circuit-breaker.ts (3-state circuit)
 *   - lib/chat-idempotency.ts (reserve-then-execute)
 *   - lib/otp-store.ts (Redis-backed OTP)
 *
 * Hits the live Railway Redis service (REDIS_URL must be set). Each test
 * uses a unique key prefix so concurrent runs don't collide.
 *
 * @derives(ADR-0024)
 * @derives(plans/abstract-wandering-kazoo.md Wave A.2)
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';

import { getRedis, closeRedis } from '../src/lib/redis.js';
import { checkAndConsumeRateLimit } from '../src/lib/redis-rate-limit.js';
import {
  tryAcquireChatSlot,
  releaseChatSlot,
  getChatInFlight,
} from '../src/lib/chat-concurrency.js';
import {
  assertCircuitClosed,
  recordSuccess,
  recordFailure,
  forceCircuitState,
  CircuitOpenError,
} from '../src/lib/openai-circuit-breaker.js';
import {
  checkIdempotency,
  reserveIdempotency,
  recordIdempotency,
  releaseIdempotency,
} from '../src/lib/chat-idempotency.js';
import { issueOtp, verifyOtp } from '../src/lib/otp-store.js';

const HAS_REDIS = Boolean(process.env.REDIS_URL);

afterAll(async () => {
  await closeRedis();
});

describe.skipIf(!HAS_REDIS)('Redis: sliding-window rate limit', () => {
  it('allows up to limit, then rejects', async () => {
    const subject = `rl-test-${Date.now()}`;
    const args = { route: 'test:rl-allow', subject, limit: 3, windowMs: 5_000 };
    for (let i = 0; i < 3; i++) {
      const r = await checkAndConsumeRateLimit(args);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.remaining).toBe(3 - i - 1);
    }
    const fourth = await checkAndConsumeRateLimit(args);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('per-subject isolation', async () => {
    const s1 = `rl-s1-${Date.now()}`;
    const s2 = `rl-s2-${Date.now()}`;
    const args1 = { route: 'test:rl-iso', subject: s1, limit: 2, windowMs: 5_000 };
    const args2 = { route: 'test:rl-iso', subject: s2, limit: 2, windowMs: 5_000 };
    for (let i = 0; i < 2; i++) {
      expect((await checkAndConsumeRateLimit(args1)).ok).toBe(true);
    }
    expect((await checkAndConsumeRateLimit(args1)).ok).toBe(false);
    // s2 unaffected
    expect((await checkAndConsumeRateLimit(args2)).ok).toBe(true);
  });
});

describe.skipIf(!HAS_REDIS)('Redis: chat-concurrency semaphore', () => {
  it('acquire returns a unique token; release frees the slot', async () => {
    const t1 = await tryAcquireChatSlot();
    expect(t1).not.toBeNull();
    const before = await getChatInFlight();
    expect(before).toBeGreaterThanOrEqual(1);
    await releaseChatSlot(t1!);
    const after = await getChatInFlight();
    expect(after).toBeLessThan(before);
  });
});

describe.skipIf(!HAS_REDIS)('Redis: OpenAI circuit breaker', () => {
  beforeAll(async () => {
    // Reset to CLOSED state before each test in this describe.
    await forceCircuitState('CLOSED');
  });

  it('CLOSED by default', async () => {
    await forceCircuitState('CLOSED');
    const state = await assertCircuitClosed();
    expect(state).toBe('CLOSED');
  });

  it('opens after consecutive failures + throws CircuitOpenError', async () => {
    await forceCircuitState('CLOSED');
    // Threshold default = 5 — drive past it
    for (let i = 0; i < 5; i++) {
      await recordFailure();
    }
    let thrown: unknown = null;
    try {
      await assertCircuitClosed();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CircuitOpenError);
    await forceCircuitState('CLOSED'); // cleanup
  });

  it('recordSuccess resets to CLOSED', async () => {
    await forceCircuitState('OPEN');
    await recordSuccess();
    const state = await assertCircuitClosed();
    expect(state).toBe('CLOSED');
  });
});

describe.skipIf(!HAS_REDIS)('Redis: chat idempotency reserve-then-execute', () => {
  it('reserve then finalise: subsequent checks see cached response', async () => {
    const companyId = `00000000-0000-0000-0000-${Date.now().toString().padStart(12, '0').slice(-12)}`;
    const key = `idem-${Date.now()}`;
    const reserved = await reserveIdempotency(companyId, key);
    expect(reserved).toBe(true);
    // A second reserve attempt fails (in-flight).
    const second = await reserveIdempotency(companyId, key);
    expect(second).toBe(false);
    const before = await checkIdempotency(companyId, key);
    expect(before.cached).toBe('in_flight');
    // Finalise with a response.
    await recordIdempotency(companyId, key, { ok: true, value: 42 });
    const after = await checkIdempotency(companyId, key);
    expect(after.cached).toBe(true);
    if (after.cached === true) {
      expect((after.responseJson as { value: number }).value).toBe(42);
    }
  });

  it('releaseIdempotency drops a reservation but not a finalised response', async () => {
    const companyId = `00000000-0000-0000-0000-${(Date.now() + 1).toString().padStart(12, '0').slice(-12)}`;
    const key = `idem-rel-${Date.now()}`;
    await reserveIdempotency(companyId, key);
    await releaseIdempotency(companyId, key);
    expect((await checkIdempotency(companyId, key)).cached).toBe(false);

    // Now finalise then try to release — release should be a no-op.
    await reserveIdempotency(companyId, key);
    await recordIdempotency(companyId, key, { ok: true });
    await releaseIdempotency(companyId, key);
    expect((await checkIdempotency(companyId, key)).cached).toBe(true);
  });
});

describe.skipIf(!HAS_REDIS)('Redis: OTP store', () => {
  it('issue + verify happy path', async () => {
    const phone = `+9199${Date.now().toString().slice(-8)}`;
    const { code, expiresAt } = await issueOtp(phone);
    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const ok = await verifyOtp(phone, code);
    expect(ok).toBe(true);
    // Replay → false
    const replay = await verifyOtp(phone, code);
    expect(replay).toBe(false);
  });

  it('dev bypass code 123456 works when AXHY_OTP_BYPASS=1', async () => {
    const prevBypass = process.env.AXHY_OTP_BYPASS;
    process.env.AXHY_OTP_BYPASS = '1';
    try {
      const phone = `+9198${Date.now().toString().slice(-8)}`;
      // Issue a real code so the rate-limit ZSET has a row to clean up.
      await issueOtp(phone);
      const ok = await verifyOtp(phone, '123456');
      expect(ok).toBe(true);
    } finally {
      if (prevBypass === undefined) delete process.env.AXHY_OTP_BYPASS;
      else process.env.AXHY_OTP_BYPASS = prevBypass;
    }
  });

  it('rate-limits issue at the cap', async () => {
    const phone = `+9197${Date.now().toString().slice(-8)}`;
    const prevBypass = process.env.AXHY_OTP_BYPASS;
    delete process.env.AXHY_OTP_BYPASS; // force prod cap (3/15min)
    try {
      for (let i = 0; i < 3; i++) {
        await issueOtp(phone);
      }
      let thrown: unknown = null;
      try {
        await issueOtp(phone);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      if (thrown instanceof Error) {
        expect(thrown.message).toContain('OTP_RATE_LIMITED');
      }
    } finally {
      if (prevBypass === undefined) delete process.env.AXHY_OTP_BYPASS;
      else process.env.AXHY_OTP_BYPASS = prevBypass;
    }
  });

  it('rejects an unknown code', async () => {
    const phone = `+9196${Date.now().toString().slice(-8)}`;
    await issueOtp(phone);
    const ok = await verifyOtp(phone, '000000');
    expect(ok).toBe(false);
  });
});

describe.skipIf(!HAS_REDIS)('Redis client lifecycle', () => {
  it('getRedis returns a singleton', async () => {
    const a = getRedis();
    const b = getRedis();
    expect(a).toBe(b);
  });
});
