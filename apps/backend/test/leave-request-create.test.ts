/**
 * Real-DB integration + water-flow test: POST /leave-requests (create).
 *
 * Proves the worker self-service leave create path end-to-end across TWO
 * tenants, and that the RCA-H identity binding (2026-06-04) closed the
 * horizontal-privilege hole where a WORKER could file leave for another
 * worker.
 *
 * Water-flow: a worker's POST flows route → withTenantContext →
 * createLeaveRequestService → LeaveRequest row + AuditEvent(LEAVE_REQUESTED)
 * + Outbox(hr.leave_requested). We assert every link.
 *
 * Identity binding (the bug that existed): createLeaveRequestService only
 * scopes by companyId; before the fix a worker could POST any same-tenant
 * Worker.id. Now a WORKER caller is bound to self (403 FORBIDDEN_NOT_SELF);
 * SUPERVISOR keeps the on-behalf-of contract.
 *
 * @derives(master-plan §G)
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
const TEST_PREFIX = `leavecreate-${Date.now()}-`;

// Two tenants. co1 has worker A, worker B, supervisor S1. co2 has worker C.
const A_PHONE = `+9194${STAMP}`;
const B_PHONE = `+9193${STAMP}`;
const S1_PHONE = `+9192${STAMP}`;
const C_PHONE = `+9191${STAMP}`;

let app: FastifyInstance;

let co1Id: string;
let co2Id: string;
let workerAId: string;
let workerBId: string;
let workerCId: string;
let aToken: string;
let s1Token: string;

async function mintToken(phone: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
  const verify = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: '123456' },
  });
  return (verify.json() as { accessToken: string }).accessToken;
}

async function seedWorker(
  companyId: string,
  phone: string,
  name: string,
): Promise<{ workerId: string; token: string }> {
  await mintToken(phone);
  const user = await prismaRaw.user.findUnique({ where: { phone } });
  if (!user) throw new Error(`test setup: user not created for ${phone}`);
  await prismaRaw.membership.create({ data: { companyId, userId: user.id, role: 'WORKER' } });
  const worker = await prismaRaw.worker.create({
    data: { companyId, userId: user.id, name, phone },
  });
  const token = await mintToken(phone);
  return { workerId: worker.id, token };
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const co1 = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co1',
      slug: TEST_PREFIX + 'co1',
      ownerPhone: '+919900000081',
      ownerName: 'Owner One',
    },
  });
  co1Id = co1.id;

  const co2 = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co2',
      slug: TEST_PREFIX + 'co2',
      ownerPhone: '+919900000082',
      ownerName: 'Owner Two',
    },
  });
  co2Id = co2.id;

  const a = await seedWorker(co1Id, A_PHONE, 'Worker A');
  workerAId = a.workerId;
  aToken = a.token;

  const b = await seedWorker(co1Id, B_PHONE, 'Worker B');
  workerBId = b.workerId;

  const c = await seedWorker(co2Id, C_PHONE, 'Worker C');
  workerCId = c.workerId;

  // Supervisor S1 in co1 — membership first, then re-mint so the JWT carries SUPERVISOR.
  await mintToken(S1_PHONE);
  const s1User = await prismaRaw.user.findUnique({ where: { phone: S1_PHONE } });
  if (!s1User) throw new Error('test setup: supervisor user not created');
  await prismaRaw.membership.create({
    data: { companyId: co1Id, userId: s1User.id, role: 'SUPERVISOR' },
  });
  s1Token = await mintToken(S1_PHONE);
}, 120_000);

afterAll(async () => {
  for (const companyId of [co1Id, co2Id]) {
    if (!companyId) continue;
    await prismaRaw.leaveRequest.deleteMany({ where: { companyId } });
    await prismaRaw.outbox.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
  }
  await prismaRaw.user.deleteMany({
    where: { phone: { in: [A_PHONE, B_PHONE, S1_PHONE, C_PHONE] } },
  });
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM axhy.otp_attempts WHERE phone IN ($1, $2, $3, $4)`,
    A_PHONE,
    B_PHONE,
    S1_PHONE,
    C_PHONE,
  );
  await prismaRaw.site.deleteMany({ where: { companyId: { in: [co1Id, co2Id] } } });
  await prismaRaw.company.deleteMany({ where: { id: { in: [co1Id, co2Id] } } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('POST /leave-requests', { timeout: 25_000 }, () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/leave-requests',
      payload: { workerId: workerAId, fromDate: '2026-06-10', toDate: '2026-06-12', reason: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('lets a worker create their OWN leave (201) and writes row + audit + outbox', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/leave-requests',
      headers: { authorization: `Bearer ${aToken}` },
      payload: {
        workerId: workerAId,
        fromDate: '2026-06-10',
        toDate: '2026-06-12',
        reason: 'Family function',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      ok: boolean;
      leaveRequestId: string;
      workerId: string;
      fromDate: string;
      toDate: string;
      state: string;
    };
    expect(body.ok).toBe(true);
    expect(body.workerId).toBe(workerAId);
    expect(body.fromDate).toBe('2026-06-10');
    expect(body.toDate).toBe('2026-06-12');
    expect(body.state).toBe('REQUESTED');

    // Primary DB row.
    const row = await prismaRaw.leaveRequest.findUnique({ where: { id: body.leaveRequestId } });
    expect(row).not.toBeNull();
    expect(row?.companyId).toBe(co1Id);
    expect(row?.workerId).toBe(workerAId);
    expect(row?.state).toBe('REQUESTED');
    expect(row?.reason).toBe('Family function');

    // Side-effect 1: audit event in the same tenant.
    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId: co1Id, kind: 'LEAVE_REQUESTED', targetId: body.leaveRequestId },
    });
    expect(audit).not.toBeNull();

    // Side-effect 2: HR outbox topic with the matching leaveRequestId.
    const outbox = await prismaRaw.outbox.findFirst({
      where: { companyId: co1Id, topic: 'hr.leave_requested' },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox).not.toBeNull();
    const payload = (outbox?.payload ?? {}) as { leaveRequestId?: string; workerId?: string };
    expect(payload.leaveRequestId).toBe(body.leaveRequestId);
    expect(payload.workerId).toBe(workerAId);
  });

  it('blocks a worker from filing leave for ANOTHER worker in the same tenant (403, no row)', async () => {
    const before = await prismaRaw.leaveRequest.count({ where: { workerId: workerBId } });
    const res = await app.inject({
      method: 'POST',
      url: '/leave-requests',
      headers: { authorization: `Bearer ${aToken}` },
      payload: {
        workerId: workerBId,
        fromDate: '2026-06-10',
        toDate: '2026-06-10',
        reason: 'Not mine to file',
      },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('FORBIDDEN_NOT_SELF');

    const after = await prismaRaw.leaveRequest.count({ where: { workerId: workerBId } });
    expect(after).toBe(before);
  });

  it('blocks a worker from filing leave for a worker in ANOTHER tenant (403, no row)', async () => {
    const before = await prismaRaw.leaveRequest.count({ where: { workerId: workerCId } });
    const res = await app.inject({
      method: 'POST',
      url: '/leave-requests',
      headers: { authorization: `Bearer ${aToken}` },
      payload: {
        workerId: workerCId,
        fromDate: '2026-06-10',
        toDate: '2026-06-10',
        reason: 'Cross tenant attempt',
      },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('FORBIDDEN_NOT_SELF');

    const after = await prismaRaw.leaveRequest.count({ where: { workerId: workerCId } });
    expect(after).toBe(before);
  });

  it('lets a supervisor file leave on behalf of a worker in their own tenant (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/leave-requests',
      headers: { authorization: `Bearer ${s1Token}` },
      payload: {
        workerId: workerAId,
        fromDate: '2026-07-01',
        toDate: '2026-07-01',
        reason: 'Supervisor-filed sick day',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { workerId: string; state: string };
    expect(body.workerId).toBe(workerAId);
    expect(body.state).toBe('REQUESTED');
  });

  it('404s a supervisor filing leave for a worker in a different tenant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/leave-requests',
      headers: { authorization: `Bearer ${s1Token}` },
      payload: {
        workerId: workerCId,
        fromDate: '2026-07-01',
        toDate: '2026-07-01',
        reason: 'Foreign worker',
      },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe('WORKER_NOT_FOUND');
  });

  it('400s when fromDate is after toDate (BAD_RANGE)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/leave-requests',
      headers: { authorization: `Bearer ${aToken}` },
      payload: {
        workerId: workerAId,
        fromDate: '2026-06-12',
        toDate: '2026-06-10',
        reason: 'Backwards range',
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('BAD_RANGE');
  });
});
