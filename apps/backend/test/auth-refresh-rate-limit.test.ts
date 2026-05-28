/**
 * F1-b Task 6 — POST /auth/refresh rate limit (10/min/IP).
 *
 * 11 sequential POSTs from the same simulated IP within 60 s. First 10
 * must pass rate-limit (they fail downstream with 401 INVALID_REFRESH
 * because the test sends a fresh axrt_-shaped but non-existent token).
 * The 11th must return 429 REFRESH_RATE_LIMITED — proving the route's
 * checkAndConsumeRateLimit call wires correctly.
 *
 * Gated on REDIS_URL availability per existing precedent: with no Redis
 * the limiter fails open and the cap can't be exercised.
 *
 * @derives(ADR-0007)
 * @derives(F1-b plan 2026-05-28 Task 6)
 */

import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const REDIS_AVAILABLE = !!process.env.REDIS_URL;

const TEST_IP = '10.99.0.1';

let app: FastifyInstance;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  // Pre-clear any leftover rate-limit bucket for 127.0.0.1 (default ip in
  // app.inject) under the authrefresh route, so other tests don't poison
  // this one.
  if (REDIS_AVAILABLE) {
    const { getRedis } = await import('../src/lib/redis.js');
    const { RedisKeys } = await import('../src/lib/redis-keys.js');
    try {
      await getRedis().del(RedisKeys.rateLimit('authrefresh', TEST_IP));
    } catch {
      // Redis init failure → test will skip below.
    }
  }
}, 30_000);

afterAll(async () => {
  if (REDIS_AVAILABLE) {
    const { getRedis } = await import('../src/lib/redis.js');
    const { RedisKeys } = await import('../src/lib/redis-keys.js');
    try {
      await getRedis().del(RedisKeys.rateLimit('authrefresh', TEST_IP));
    } catch {
      // best-effort cleanup
    }
  }
  await app.close();
});

describe('POST /auth/refresh — rate limit', () => {
  it.runIf(REDIS_AVAILABLE)(
    '11th request from same IP within 60 s → 429 REFRESH_RATE_LIMITED',
    async () => {
      // Use a deterministic axrt_-shaped token that won't collide with any
      // real family. Long enough to pass Zod min(20).
      const bogusToken = `axrt_${crypto.randomBytes(32).toString('base64url')}`;

      for (let i = 1; i <= 10; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: { refreshToken: bogusToken },
          remoteAddress: TEST_IP,
        });
        // First 10 should pass rate-limit but fail downstream (token unknown)
        expect(res.statusCode, `call ${i}`).toBe(401);
        expect((res.json() as { error: string }).error).toBe('INVALID_REFRESH');
      }

      const eleventh = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: bogusToken },
        remoteAddress: TEST_IP,
      });
      expect(eleventh.statusCode).toBe(429);
      expect((eleventh.json() as { error: string }).error).toBe('REFRESH_RATE_LIMITED');
      // retry-after header set so client can back off
      expect(eleventh.headers['retry-after']).toBeDefined();
    },
    60_000,
  );

  it.skipIf(REDIS_AVAILABLE)(
    "skipped — REDIS_URL not set, fail-open path can't exercise cap",
    () => {
      expect(true).toBe(true);
    },
  );
});
