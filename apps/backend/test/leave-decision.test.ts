/**
 * Real-DB integration test: POST /leave-requests/:id/{approve,reject}
 *
 * Exercises:
 *   1. 401 unauth, 400 malformed
 *   2. Cross-tenant 404
 *   3. Approve happy path: REQUESTED → APPROVED + AuditEvent + Outbox
 *   4. Reject happy path: REQUESTED → REJECTED + AuditEvent + Outbox
 *   5. Re-decide already-decided → 409
 *
 * Uses real Railway Postgres.
 *
 * @derives(ADR-0007)
 * @derives(data-flow §5)
 * @derives(panel-2026-05-08) — Phase B.4
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

const TEST_PREFIX = `leave-${Date.now()}-`;
const SUP_PHONE = `+9199${String(Date.now()).slice(-8)}`;
const WORKER_PHONE_A = `+9199${String(Date.now() + 1).slice(-8)}`;
const WORKER_PHONE_B = `+9199${String(Date.now() + 2).slice(-8)}`;
const WORKER_PHONE_OTHER = `+9199${String(Date.now() + 3).slice(-8)}`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let supervisorId: string;
let workerAId: string;
let workerBId: string;
let leaveAId: string;
let leaveBId: string;
let leaveOtherTenantId: string;
let accessToken: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
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
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'co-b',
      ownerPhone: '+919900000092',
      ownerName: 'Owner B',
    },
  });
  companyBId = b.id;

  const sup = await prismaRaw.user.create({
    data: { phone: SUP_PHONE, name: 'Test Supervisor', locale: 'en' },
  });
  supervisorId = sup.id;
  await prismaRaw.membership.create({
    data: { companyId: companyAId, userId: sup.id, role: 'SUPERVISOR' },
  });

  // Two workers in CoA
  const wA = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      name: 'Worker A',
      phone: WORKER_PHONE_A,
      state: 'ACTIVE',
    },
  });
  workerAId = wA.id;
  const wB = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      name: 'Worker B',
      phone: WORKER_PHONE_B,
      state: 'ACTIVE',
    },
  });
  workerBId = wB.id;
  // Worker in CoB (cross-tenant)
  const wOther = await prismaRaw.worker.create({
    data: {
      companyId: companyBId,
      name: 'Other Tenant Worker',
      phone: WORKER_PHONE_OTHER,
      state: 'ACTIVE',
    },
  });

  // Three leave requests
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const leaveA = await prismaRaw.leaveRequest.create({
    data: {
      companyId: companyAId,
      workerId: workerAId,
      fromDate: tomorrow,
      toDate: tomorrow,
      reason: 'family function',
      state: 'REQUESTED',
    },
  });
  leaveAId = leaveA.id;
  const leaveB = await prismaRaw.leaveRequest.create({
    data: {
      companyId: companyAId,
      workerId: workerBId,
      fromDate: tomorrow,
      toDate: tomorrow,
      reason: 'medical',
      state: 'REQUESTED',
    },
  });
  leaveBId = leaveB.id;
  const leaveOther = await prismaRaw.leaveRequest.create({
    data: {
      companyId: companyBId,
      workerId: wOther.id,
      fromDate: tomorrow,
      toDate: tomorrow,
      reason: 'other tenant leave',
      state: 'REQUESTED',
    },
  });
  leaveOtherTenantId = leaveOther.id;

  accessToken = await issueAccessToken({
    userId: supervisorId,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await app.close();
  await prismaRaw.auditEvent.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.outbox.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.leaveRequest.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.membership.deleteMany({
    where: { company: { slug: { startsWith: TEST_PREFIX } } },
  });
  await prismaRaw.worker.deleteMany({
    where: { company: { slug: { startsWith: TEST_PREFIX } } },
  });
  await prismaRaw.user.deleteMany({ where: { phone: SUP_PHONE } });
  await prismaRaw.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prismaRaw.$disconnect();
});

const authHeader = () => ({ authorization: `Bearer ${accessToken}` });

async function inject(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  return await app.inject({ method: method as 'GET' | 'POST', url, payload: body, headers });
}

describe('POST /leave-requests/:id/approve | /reject', () => {
  it('rejects unauthenticated approve with 401', async () => {
    const res = await inject('POST', `/leave-requests/${leaveAId}/approve`, {});
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed input with 400', async () => {
    const res = await inject(
      'POST',
      `/leave-requests/${leaveAId}/approve`,
      { note: 'x'.repeat(600) }, // exceeds 500 char limit
      authHeader(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for cross-tenant leave', async () => {
    const res = await inject(
      'POST',
      `/leave-requests/${leaveOtherTenantId}/approve`,
      { note: 'should not reach this' },
      authHeader(),
    );
    expect(res.statusCode).toBe(404);
  });

  it('approve happy path: REQUESTED → APPROVED + AuditEvent + Outbox', async () => {
    const res = await inject(
      'POST',
      `/leave-requests/${leaveAId}/approve`,
      { note: 'family is important' },
      authHeader(),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: true;
      leaveRequestId: string;
      state: string;
      decidedBy: string;
    };
    expect(body.state).toBe('APPROVED');
    expect(body.decidedBy).toBe(supervisorId);

    const updated = await prismaRaw.leaveRequest.findUnique({ where: { id: leaveAId } });
    expect(updated!.state).toBe('APPROVED');
    expect(updated!.decisionNote).toBe('family is important');
    expect(updated!.decidedBy).toBe(supervisorId);
    expect(updated!.decidedAt).not.toBeNull();

    const audits = await prismaRaw.auditEvent.findMany({
      where: { companyId: companyAId, kind: 'LEAVE_APPROVED', targetId: leaveAId },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0]!.actorId).toBe(supervisorId);

    const outbox = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId, topic: 'worker.leave_approved', processedAt: null },
    });
    expect(outbox.length).toBeGreaterThan(0);
  });

  it('reject happy path: REQUESTED → REJECTED + AuditEvent + Outbox', async () => {
    const res = await inject(
      'POST',
      `/leave-requests/${leaveBId}/reject`,
      { note: 'no replacement available' },
      authHeader(),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as { state: string };
    expect(body.state).toBe('REJECTED');

    const updated = await prismaRaw.leaveRequest.findUnique({ where: { id: leaveBId } });
    expect(updated!.state).toBe('REJECTED');

    const audits = await prismaRaw.auditEvent.findMany({
      where: { companyId: companyAId, kind: 'LEAVE_REJECTED', targetId: leaveBId },
    });
    expect(audits.length).toBeGreaterThan(0);

    const outbox = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId, topic: 'worker.leave_rejected', processedAt: null },
    });
    expect(outbox.length).toBeGreaterThan(0);
  });

  it('returns 409 when re-deciding an already-decided leave', async () => {
    // leaveAId was approved in a prior test
    const res = await inject('POST', `/leave-requests/${leaveAId}/reject`, {}, authHeader());
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string; state: string };
    expect(body.error).toBe('ALREADY_DECIDED');
    expect(body.state).toBe('APPROVED');
  });
});
