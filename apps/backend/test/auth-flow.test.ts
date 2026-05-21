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
    // ADR-0024 (2026-05-20): OTP store moved to Redis. The dev rate-limit
    // cap is 100/15min when AXHY_OTP_BYPASS=1 (see lib/otp-store.ts), so
    // 4 requests don't trip the cap any more — this is intentional dev
    // ergonomics. Temporarily flip to prod mode to exercise the cap.
    const prev = process.env.AXHY_OTP_BYPASS;
    delete process.env.AXHY_OTP_BYPASS;
    // Use a separate phone so the prior bypass-mode counters don't
    // interfere — prod cap is 3.
    const tempPhone = `+9189${String(Date.now()).slice(-8)}`;
    try {
      await inject('POST', '/auth/otp/request', { phone: tempPhone });
      await inject('POST', '/auth/otp/request', { phone: tempPhone });
      await inject('POST', '/auth/otp/request', { phone: tempPhone });
      const fourth = await inject('POST', '/auth/otp/request', { phone: tempPhone });
      expect(fourth.statusCode).toBe(429);
    } finally {
      process.env.AXHY_OTP_BYPASS = prev;
    }
  });

  it('verify with wrong code → 401, with right code + no membership → 403', async () => {
    // Wrong code → 401
    const wrong = await inject('POST', '/auth/otp/verify', { phone: TEST_PHONE, code: '000000' });
    expect(wrong.statusCode).toBe(401);

    // ADR-0024: OTP store is Redis now. Test used to raw-SQL-insert a
    // known hash into `axhy.otp_attempts`; that's a Postgres-side hack
    // that's invisible to the Redis hot path. Use the AXHY_OTP_BYPASS=1
    // magic code '123456' instead — same semantic (a "known" code that
    // the verify path accepts without needing the random-issued code).
    // Issue a fresh OTP first so the rate-limit counter has a row + the
    // verify path has an attempt to consume.
    const reqRes = await inject('POST', '/auth/otp/request', {
      phone: `+91999${String(Date.now()).slice(-7)}`,
    });
    expect(reqRes.statusCode).toBe(200);
    await inject('POST', '/auth/otp/request', { phone: TEST_PHONE });

    const right = await inject('POST', '/auth/otp/verify', {
      phone: TEST_PHONE,
      code: '123456',
    });
    expect(right.statusCode).toBe(403); // user gets created, but no membership → 403
    const body = right.json() as { error: string };
    expect(body.error).toBe('NO_MEMBERSHIPS');
  });

  it('verify with valid code AND active membership → JWTs + memberships array', async () => {
    const user = await prismaRaw.user.findUnique({ where: { phone: TEST_PHONE } });
    expect(user).not.toBeNull();
    userId = user!.id;

    await prismaRaw.membership.create({
      data: { companyId: companyAId, userId: user!.id, role: 'WORKER' },
    });

    // Issue a fresh OTP (Redis-backed); verify with bypass magic code.
    await inject('POST', '/auth/otp/request', { phone: TEST_PHONE });
    const res = await inject('POST', '/auth/otp/verify', {
      phone: TEST_PHONE,
      code: '123456',
    });
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
    // ADR-0024: Redis OTP store. Use bypass magic code (AXHY_OTP_BYPASS=1
    // is set at the top of the file).
    await inject('POST', '/auth/otp/request', { phone: TEST_PHONE });
    const verifyRes = await inject('POST', '/auth/otp/verify', {
      phone: TEST_PHONE,
      code: '123456',
    });
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

/**
 * F-006b 2026-05-21 — worker OTP activation through workerMachine.
 *
 * Verifies that POST /auth/otp/verify, for a Worker in PENDING_ACTIVATION,
 * fires the OTP_VERIFIED event on workerMachine and persists DOC_PENDING.
 * This is the first machine-driven transition wired to a real route; before
 * F-006b the route skipped the machine entirely (inherited gap).
 *
 * @derives(F-006b worker-shell relaxation)
 * @derives(.claude/rules/state-machines.md)
 */
describe('worker OTP activation (F-006b)', () => {
  const WORKER_PHONE = `+9198${String(Date.now()).slice(-8)}`;
  let workerCompanyId: string;
  let workerUserId: string;
  let workerId: string;

  beforeAll(async () => {
    const co = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'WkrCo',
        slug: TEST_PREFIX + 'wkr-co',
        ownerPhone: '+919900000099',
        ownerName: 'Owner Wkr',
      },
    });
    workerCompanyId = co.id;

    const wu = await prismaRaw.user.create({
      data: { phone: WORKER_PHONE, locale: 'en' },
    });
    workerUserId = wu.id;

    await prismaRaw.membership.create({
      data: { companyId: co.id, userId: wu.id, role: 'WORKER' },
    });

    const wkr = await prismaRaw.worker.create({
      data: {
        companyId: co.id,
        userId: wu.id,
        name: 'Test Worker (F-006b)',
        phone: WORKER_PHONE,
        state: 'PENDING_ACTIVATION',
      },
    });
    workerId = wkr.id;
  }, 60_000);

  afterAll(async () => {
    await prismaRaw.outbox
      .deleteMany({ where: { companyId: workerCompanyId } })
      .catch(() => undefined);
    await prismaRaw.auditEvent
      .deleteMany({ where: { companyId: workerCompanyId } })
      .catch(() => undefined);
    await prismaRaw.worker.deleteMany({ where: { id: workerId } });
    await prismaRaw.membership.deleteMany({ where: { companyId: workerCompanyId } });
    await prismaRaw.user.deleteMany({ where: { id: workerUserId } });
    await prismaRaw.$executeRawUnsafe(
      `DELETE FROM axhy.otp_attempts WHERE phone = $1`,
      WORKER_PHONE,
    );
    await prismaRaw.company.deleteMany({ where: { id: workerCompanyId } });
  });

  it('PENDING_ACTIVATION worker transitions to DOC_PENDING on OTP verify (machine event fires)', async () => {
    await inject('POST', '/auth/otp/request', { phone: WORKER_PHONE });
    const res = await inject('POST', '/auth/otp/verify', {
      phone: WORKER_PHONE,
      code: '123456',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { memberships: Array<{ role: string }> };
    expect(body.memberships[0]?.role).toBe('WORKER');

    const wkr = await prismaRaw.worker.findUnique({ where: { id: workerId } });
    expect(wkr?.state).toBe('DOC_PENDING');

    // Audit + outbox rows were written inside the transition tx.
    const auditCount = await prismaRaw.auditEvent.count({
      where: { companyId: workerCompanyId, kind: 'WORKER_OTP_VERIFIED', targetId: workerId },
    });
    expect(auditCount).toBe(1);

    const outboxCount = await prismaRaw.outbox.count({
      where: { companyId: workerCompanyId, topic: 'worker.activated' },
    });
    expect(outboxCount).toBe(1);
  });

  it('worker already in DOC_PENDING is unchanged on subsequent verify (idempotent NO_TRANSITION)', async () => {
    await inject('POST', '/auth/otp/request', { phone: WORKER_PHONE });
    const res = await inject('POST', '/auth/otp/verify', {
      phone: WORKER_PHONE,
      code: '123456',
    });
    expect(res.statusCode).toBe(200);

    const wkr = await prismaRaw.worker.findUnique({ where: { id: workerId } });
    expect(wkr?.state).toBe('DOC_PENDING');

    // No additional audit row should have been written for the no-op call.
    const auditCount = await prismaRaw.auditEvent.count({
      where: { companyId: workerCompanyId, kind: 'WORKER_OTP_VERIFIED', targetId: workerId },
    });
    expect(auditCount).toBe(1);
  });
});
