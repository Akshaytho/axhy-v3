/**
 * Real-DB integration test: POST /worker/consent.
 *
 * Verifies that an authenticated worker can submit one-page DPDP consent
 * and that a ConsentLog row is appended with the right policyVersion.
 * Also asserts the unauth (no Bearer) rejection.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §6 + §13 M22)
 * @derives(F-006b worker-shell relaxation)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `consent-${Date.now()}-`;
const TEST_PHONE = `+9197${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;
let userId: string;
let accessToken: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000093',
      ownerName: 'Owner C',
    },
  });
  companyId = co.id;

  // Use OTP bypass to mint an access token. First verify creates the User
  // but lacks a membership (403). We then create the WORKER membership
  // and re-verify to obtain a token.
  await app.inject({
    method: 'POST',
    url: '/auth/otp/request',
    payload: { phone: TEST_PHONE },
  });
  await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone: TEST_PHONE, code: '123456' },
  });

  const user = await prismaRaw.user.findUnique({ where: { phone: TEST_PHONE } });
  if (!user) throw new Error('test setup failed: user not created');
  userId = user.id;

  await prismaRaw.membership.create({
    data: { companyId, userId, role: 'WORKER' },
  });

  await app.inject({
    method: 'POST',
    url: '/auth/otp/request',
    payload: { phone: TEST_PHONE },
  });
  const verify = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone: TEST_PHONE, code: '123456' },
  });
  accessToken = (verify.json() as { accessToken: string }).accessToken;
}, 90_000);

afterAll(async () => {
  await prismaRaw.consentLog.deleteMany({ where: { userId } });
  await prismaRaw.membership.deleteMany({ where: { userId } });
  await prismaRaw.user.deleteMany({ where: { id: userId } });
  await prismaRaw.$executeRawUnsafe(`DELETE FROM axhy.otp_attempts WHERE phone = $1`, TEST_PHONE);
  await prismaRaw.company.deleteMany({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('POST /worker/consent', () => {
  it('persists a ConsentLog row with policyVersion + acceptedAt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/consent',
      payload: { policyVersion: '2026-05-21' },
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: true; acceptedAt: string };
    expect(body.ok).toBe(true);
    expect(body.acceptedAt).toBeTruthy();

    const rows = await prismaRaw.consentLog.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.policyVersion).toBe('2026-05-21');
  });

  it('dedups a re-submit of the SAME policy version with 409 (no duplicate row)', async () => {
    // The prior test already accepted '2026-05-21' for this user. Re-submitting
    // the same version (reinstall / refocus) must NOT pile up a duplicate legal
    // record — it returns 409, which the client treats as "already consented".
    const res = await app.inject({
      method: 'POST',
      url: '/worker/consent',
      payload: { policyVersion: '2026-05-21' },
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe('ALREADY_CONSENTED');

    const rows = await prismaRaw.consentLog.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
    });
    expect(rows).toHaveLength(1); // still exactly one, not two
    expect(rows[0]?.policyVersion).toBe('2026-05-21');
  });

  it('rejects an unknown / non-allowlisted policyVersion with 400 (no row written)', async () => {
    const before = await prismaRaw.consentLog.count({ where: { userId } });
    const res = await app.inject({
      method: 'POST',
      url: '/worker/consent',
      payload: { policyVersion: 'v999-bogus' },
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('BAD_INPUT');

    const after = await prismaRaw.consentLog.count({ where: { userId } });
    expect(after).toBe(before); // garbage version never persisted
  });

  it('rejects unauth requests with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/consent',
      payload: { policyVersion: '2026-05-21' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects bad input (missing policyVersion) with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/consent',
      payload: {},
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe.skipIf(!process.env.REDIS_URL)('POST /worker/consent — per-user rate limit', () => {
  it('returns 429 RATE_LIMITED + Retry-After header after exhausting the per-user budget', async () => {
    const { getRedis } = await import('../src/lib/redis.js');
    const { RedisKeys } = await import('../src/lib/redis-keys.js');
    await getRedis().del(RedisKeys.rateLimit('worker:consent', userId));

    const envKey = 'RATE_LIMIT_WORKER_CONSENT_PER_MIN';
    const prev = process.env[envKey];
    process.env[envKey] = '2';
    try {
      for (let i = 0; i < 2; i++) {
        const ok = await app.inject({
          method: 'POST',
          url: '/worker/consent',
          payload: { policyVersion: '2026-05-21' },
          headers: { authorization: `Bearer ${accessToken}` },
        });
        expect(ok.statusCode).not.toBe(429);
      }
      const limited = await app.inject({
        method: 'POST',
        url: '/worker/consent',
        payload: { policyVersion: '2026-05-21' },
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(limited.statusCode).toBe(429);
      const body = limited.json() as { error: string; retryAfterMs: number };
      expect(body.error).toBe('RATE_LIMITED');
      expect(body.retryAfterMs).toBeGreaterThan(0);
      expect(limited.headers['retry-after']).toBeDefined();
    } finally {
      if (prev === undefined) delete process.env[envKey];
      else process.env[envKey] = prev;
    }
  });
});
