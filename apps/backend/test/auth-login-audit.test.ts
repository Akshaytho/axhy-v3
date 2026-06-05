/**
 * Real-DB integration test: POST /auth/otp/verify writes a login audit.
 *
 * RCA-I (2026-06-04): before this fix a successful OTP verify issued tokens
 * but recorded NOTHING for already-active workers and for every supervisor /
 * HR / owner login — no forensic trail of who signed in. Now each successful
 * verify writes one `AUTH_LOGIN` AuditEvent scoped to the active company.
 *
 * Asserted via before/after delta on the AuditEvent count so unrelated
 * setup writes (e.g. a worker-activation audit) never affect the AUTH_LOGIN
 * count we measure.
 *
 * @derives(master-plan §L) — every auth event auditable
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const STAMP = String(Date.now()).slice(-8);
const TEST_PREFIX = `loginaudit-${Date.now()}-`;

const A_PHONE = `+9194${STAMP}`; // worker in co1
const S1_PHONE = `+9193${STAMP}`; // supervisor in co1
const C_PHONE = `+9192${STAMP}`; // worker in co2

let app: FastifyInstance;
let co1Id: string;
let co2Id: string;
let workerAUserId: string;
let s1UserId: string;
let workerCUserId: string;

async function verifyLogin(phone: string): Promise<number> {
  await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
  const res = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: '123456' },
  });
  return res.statusCode;
}

function loginAuditCount(companyId: string, actorId: string): Promise<number> {
  return prismaRaw.auditEvent.count({
    where: { companyId, actorId, kind: 'AUTH_LOGIN' },
  });
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const co1 = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co1',
      slug: TEST_PREFIX + 'co1',
      ownerPhone: '+919900000071',
      ownerName: 'Owner One',
    },
  });
  co1Id = co1.id;
  const co2 = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co2',
      slug: TEST_PREFIX + 'co2',
      ownerPhone: '+919900000072',
      ownerName: 'Owner Two',
    },
  });
  co2Id = co2.id;

  // Seed users + memberships directly so setup does NOT mint any AUTH_LOGIN.
  const aUser = await prismaRaw.user.create({ data: { phone: A_PHONE, locale: 'en' } });
  workerAUserId = aUser.id;
  await prismaRaw.membership.create({
    data: { companyId: co1Id, userId: aUser.id, role: 'WORKER' },
  });
  await prismaRaw.worker.create({
    data: { companyId: co1Id, userId: aUser.id, name: 'Login Worker A', phone: A_PHONE },
  });

  const s1User = await prismaRaw.user.create({ data: { phone: S1_PHONE, locale: 'en' } });
  s1UserId = s1User.id;
  await prismaRaw.membership.create({
    data: { companyId: co1Id, userId: s1User.id, role: 'SUPERVISOR' },
  });

  const cUser = await prismaRaw.user.create({ data: { phone: C_PHONE, locale: 'en' } });
  workerCUserId = cUser.id;
  await prismaRaw.membership.create({
    data: { companyId: co2Id, userId: cUser.id, role: 'WORKER' },
  });
  await prismaRaw.worker.create({
    data: { companyId: co2Id, userId: cUser.id, name: 'Login Worker C', phone: C_PHONE },
  });
}, 120_000);

afterAll(async () => {
  for (const companyId of [co1Id, co2Id]) {
    if (!companyId) continue;
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.outbox.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
  }
  await prismaRaw.user.deleteMany({ where: { phone: { in: [A_PHONE, S1_PHONE, C_PHONE] } } });
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM axhy.otp_attempts WHERE phone IN ($1, $2, $3)`,
    A_PHONE,
    S1_PHONE,
    C_PHONE,
  );
  await prismaRaw.company.deleteMany({ where: { id: { in: [co1Id, co2Id] } } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('POST /auth/otp/verify — login audit', { timeout: 30_000 }, () => {
  it('writes exactly one AUTH_LOGIN for a worker login, scoped to the active company', async () => {
    const before = await loginAuditCount(co1Id, workerAUserId);
    expect(await verifyLogin(A_PHONE)).toBe(200);
    const after = await loginAuditCount(co1Id, workerAUserId);
    expect(after - before).toBe(1);

    const row = await prismaRaw.auditEvent.findFirst({
      where: { companyId: co1Id, actorId: workerAUserId, kind: 'AUTH_LOGIN' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    const payload = (row?.payload ?? {}) as { role?: string; via?: string };
    expect(payload.role).toBe('WORKER');
    expect(payload.via).toBe('otp');
  });

  it('writes an AUTH_LOGIN for a supervisor login too', async () => {
    const before = await loginAuditCount(co1Id, s1UserId);
    expect(await verifyLogin(S1_PHONE)).toBe(200);
    const after = await loginAuditCount(co1Id, s1UserId);
    expect(after - before).toBe(1);

    const row = await prismaRaw.auditEvent.findFirst({
      where: { companyId: co1Id, actorId: s1UserId, kind: 'AUTH_LOGIN' },
      orderBy: { createdAt: 'desc' },
    });
    const payload = (row?.payload ?? {}) as { role?: string };
    expect(payload.role).toBe('SUPERVISOR');
  });

  it('audits to the correct tenant only (multi-company isolation)', async () => {
    // Worker C logs into co2 → audit lands in co2, never co1.
    expect(await verifyLogin(C_PHONE)).toBe(200);
    expect(await loginAuditCount(co2Id, workerCUserId)).toBeGreaterThanOrEqual(1);
    expect(await loginAuditCount(co1Id, workerCUserId)).toBe(0);
    // And worker A's login never produced a co2 row.
    expect(await loginAuditCount(co2Id, workerAUserId)).toBe(0);
  });

  it('records one row PER login (a second login adds a second AUTH_LOGIN)', async () => {
    const before = await loginAuditCount(co1Id, workerAUserId);
    expect(await verifyLogin(A_PHONE)).toBe(200);
    const after = await loginAuditCount(co1Id, workerAUserId);
    expect(after - before).toBe(1);
  });
});
