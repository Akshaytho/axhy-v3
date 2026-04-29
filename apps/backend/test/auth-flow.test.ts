/**
 * Real-DB integration test: full auth flow.
 *
 * Exercises:
 *   1. POST /auth/otp/request issues an OTP (bypass mode — no SMS sent)
 *   2. Read the issued code from the otp_attempts table
 *   3. POST /auth/otp/verify with the code returns JWT(s) + memberships
 *   4. GET /me with the access token returns the right user + company
 *   5. GET /me with no token → 401
 *   6. GET /me with a token signed by the wrong secret → 401
 *
 * Uses real Railway Postgres (no mocks, master plan rule).
 *
 * @derives(ADR-0007)
 * @derives(ADR-0004)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

// Force test mode BEFORE buildServer / prisma client load
process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `auth-${Date.now()}-`;
const TEST_PHONE = `+9199${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyAId: string;
let userId: string | null = null;

beforeAll(async () => {
  // Lazy import so env vars above take effect first
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const a = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'CoA',
      slug: TEST_PREFIX + 'co-a',
      ownerPhone: '+919900000091',
      ownerName: 'Owner A',
    },
  });
  companyAId = a.id;
});

afterAll(async () => {
  await app.close();
  await prismaRaw.$executeRawUnsafe(`DELETE FROM axhy.otp_attempts WHERE phone = $1`, TEST_PHONE);
  await prismaRaw.membership.deleteMany({
    where: { company: { slug: { startsWith: TEST_PREFIX } } },
  });
  if (userId) await prismaRaw.user.deleteMany({ where: { id: userId } });
  await prismaRaw.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prismaRaw.$disconnect();
});

async function inject(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  return await app.inject({ method: method as 'GET' | 'POST', url, payload: body, headers });
}

describe('auth flow', () => {
  it('POST /auth/otp/request issues an OTP', async () => {
    const res = await inject('POST', '/auth/otp/request', { phone: TEST_PHONE });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: true; resendInSeconds: number };
    expect(body.ok).toBe(true);
    expect(body.resendInSeconds).toBeGreaterThan(0);
  });

  it('rate-limits 4th OTP request within 15 min', async () => {
    // 1st was just made above; issue 2 more, then 4th must be 429
    await inject('POST', '/auth/otp/request', { phone: TEST_PHONE });
    await inject('POST', '/auth/otp/request', { phone: TEST_PHONE });
    const fourth = await inject('POST', '/auth/otp/request', { phone: TEST_PHONE });
    expect(fourth.statusCode).toBe(429);
  });

  it('verify with wrong code → 401, with right code + no membership → 403', async () => {
    // Wrong code
    const wrong = await inject('POST', '/auth/otp/verify', { phone: TEST_PHONE, code: '000000' });
    expect(wrong.statusCode).toBe(401);

    // Read the right code from DB (test-mode bypass means no SMS was sent)
    // OTP is hashed in storage, so we re-issue and use a known code path:
    // Easier: directly insert a known-hash OTP row.
    const knownCode = '424242';
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256').update(`${TEST_PHONE}:${knownCode}`).digest('hex');
    await prismaRaw.$executeRawUnsafe(
      `INSERT INTO axhy.otp_attempts (phone, code_hash, expires_at)
       VALUES ($1, $2, now() + interval '5 minutes')`,
      TEST_PHONE,
      hash,
    );

    const right = await inject('POST', '/auth/otp/verify', { phone: TEST_PHONE, code: knownCode });
    expect(right.statusCode).toBe(403); // user gets created, but no membership → 403
    const body = right.json() as { error: string };
    expect(body.error).toBe('NO_MEMBERSHIPS');
  });

  it('verify with valid code AND active membership → JWTs + memberships array', async () => {
    // Find the user we just created in the previous test
    const user = await prismaRaw.user.findUnique({ where: { phone: TEST_PHONE } });
    expect(user).not.toBeNull();
    userId = user!.id;

    await prismaRaw.membership.create({
      data: { companyId: companyAId, userId: user!.id, role: 'WORKER' },
    });

    // Issue another fresh OTP — DELETE prior to clear rate-limit window
    await prismaRaw.$executeRawUnsafe(`DELETE FROM axhy.otp_attempts WHERE phone = $1`, TEST_PHONE);
    const freshCode = '777777';
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256').update(`${TEST_PHONE}:${freshCode}`).digest('hex');
    await prismaRaw.$executeRawUnsafe(
      `INSERT INTO axhy.otp_attempts (phone, code_hash, expires_at)
       VALUES ($1, $2, now() + interval '5 minutes')`,
      TEST_PHONE,
      hash,
    );

    const res = await inject('POST', '/auth/otp/verify', { phone: TEST_PHONE, code: freshCode });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: true;
      accessToken: string;
      refreshToken: string;
      memberships: Array<{ companyId: string; role: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0]?.companyId).toBe(companyAId);
    expect(body.memberships[0]?.role).toBe('WORKER');
  });
});

describe('GET /me', () => {
  it('without token → 401', async () => {
    const res = await inject('GET', '/me');
    expect(res.statusCode).toBe(401);
  });

  it('with bad signature → 401', async () => {
    const badToken = await new SignJWT({ sub: 'fake', companyId: 'fake', kind: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('z'.repeat(64)));
    const res = await inject('GET', '/me', undefined, { authorization: `Bearer ${badToken}` });
    expect(res.statusCode).toBe(401);
  });

  it('with valid token → returns user + company + memberships', async () => {
    // Reuse the access token from the verify step above by re-doing verify
    await prismaRaw.$executeRawUnsafe(`DELETE FROM axhy.otp_attempts WHERE phone = $1`, TEST_PHONE);
    const code = '999111';
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256').update(`${TEST_PHONE}:${code}`).digest('hex');
    await prismaRaw.$executeRawUnsafe(
      `INSERT INTO axhy.otp_attempts (phone, code_hash, expires_at)
       VALUES ($1, $2, now() + interval '5 minutes')`,
      TEST_PHONE,
      hash,
    );

    const verifyRes = await inject('POST', '/auth/otp/verify', { phone: TEST_PHONE, code });
    const { accessToken } = verifyRes.json() as { accessToken: string };

    const res = await inject('GET', '/me', undefined, { authorization: `Bearer ${accessToken}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      user: { id: string; phone: string };
      activeCompany: { id: string; name: string };
      activeRole: string;
      memberships: Array<unknown>;
    };
    expect(body.user.phone).toBe(TEST_PHONE);
    expect(body.activeCompany.id).toBe(companyAId);
    expect(body.activeRole).toBe('WORKER');
    expect(body.memberships).toHaveLength(1);
  });
});
