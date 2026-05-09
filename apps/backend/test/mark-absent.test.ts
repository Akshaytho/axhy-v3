/**
 * Real-DB integration test: POST /workers/:id/mark-absent
 *
 * Exercises the full path:
 *   1. Auth: Bearer token → req.auth populated
 *   2. Tenant scoping: cross-tenant target → 404
 *   3. Happy path: supervisor of company A marks Mukesh absent →
 *      Attendance row + AuditEvent row + Outbox topics queued
 *   4. Idempotent re-mark: same (workerId, date) twice → upsert, one row
 *   5. payDeductPaise math: ABSENT_NO_CALL → full daily, HALF_DAY → half
 *
 * Uses real Railway Postgres (master plan rule: prod-only testing,
 * sandbox tenant). Each run isolates by a unique TEST_PREFIX so cleanup
 * doesn't touch other tenants' rows.
 *
 * @derives(ADR-0007)
 * @derives(ADR-0004)
 * @derives(panel-2026-05-08) — Phase B.3 mark-absent route
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

const TEST_PREFIX = `mark-absent-${Date.now()}-`;
const SUP_PHONE = `+9199${String(Date.now() + 1).slice(-8)}`;
const WORKER_PHONE_A = `+9199${String(Date.now() + 2).slice(-8)}`;
const WORKER_PHONE_OTHER_TENANT = `+9199${String(Date.now() + 3).slice(-8)}`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let supervisorId: string;
let workerAId: string;
let workerBId: string;
let accessToken: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  // Two companies for cross-tenant isolation test
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

  // Supervisor in CoA only
  const sup = await prismaRaw.user.create({
    data: { phone: SUP_PHONE, name: 'Test Supervisor', locale: 'en' },
  });
  supervisorId = sup.id;
  await prismaRaw.membership.create({
    data: { companyId: companyAId, userId: sup.id, role: 'SUPERVISOR' },
  });

  // Worker in CoA — supervisor can mark this one
  const wA = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      name: 'Mukesh Yadav',
      phone: WORKER_PHONE_A,
      state: 'ACTIVE',
      baseSalaryPaise: 1300000, // ₹13,000/mo → ~₹500/day
    },
  });
  workerAId = wA.id;

  // Worker in CoB — supervisor must NOT be able to mark this one
  const wB = await prismaRaw.worker.create({
    data: {
      companyId: companyBId,
      name: 'Other Tenant Worker',
      phone: WORKER_PHONE_OTHER_TENANT,
      state: 'ACTIVE',
      baseSalaryPaise: 1200000,
    },
  });
  workerBId = wB.id;

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
  // Cascade delete: Company → Attendance / AuditEvent / Outbox / Worker
  await prismaRaw.attendance.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.auditEvent.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.outbox.deleteMany({
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

async function inject(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  return await app.inject({ method: method as 'GET' | 'POST', url, payload: body, headers });
}

const authHeader = () => ({ authorization: `Bearer ${accessToken}` });

describe('POST /workers/:id/mark-absent', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await inject('POST', `/workers/${workerAId}/mark-absent`, {
      date: '2026-05-08',
      status: 'ABSENT_NO_CALL',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed input with 400', async () => {
    const res = await inject(
      'POST',
      `/workers/${workerAId}/mark-absent`,
      { date: 'not-a-date', status: 'ABSENT_NO_CALL' },
      authHeader(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when worker is in a different tenant', async () => {
    const res = await inject(
      'POST',
      `/workers/${workerBId}/mark-absent`,
      { date: '2026-05-08', status: 'ABSENT_NO_CALL' },
      authHeader(),
    );
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: string };
    expect(body.error).toBe('WORKER_NOT_FOUND');
  });

  it('happy path: marks worker absent, writes Attendance + AuditEvent + Outbox', async () => {
    const res = await inject(
      'POST',
      `/workers/${workerAId}/mark-absent`,
      { date: '2026-05-08', status: 'ABSENT_NO_CALL', reason: 'no call' },
      authHeader(),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: true;
      attendanceId: string;
      workerId: string;
      date: string;
      status: string;
      payDeductPaise: number;
    };
    expect(body.ok).toBe(true);
    expect(body.workerId).toBe(workerAId);
    expect(body.date).toBe('2026-05-08');
    expect(body.status).toBe('ABSENT_NO_CALL');
    // ₹13,000 / 26 working days = ₹500/day = 50,000 paise
    expect(body.payDeductPaise).toBe(50000);

    // Attendance row exists with the right shape
    const att = await prismaRaw.attendance.findUnique({ where: { id: body.attendanceId } });
    expect(att).not.toBeNull();
    expect(att!.workerId).toBe(workerAId);
    expect(att!.companyId).toBe(companyAId);
    expect(att!.markedBySupervisorId).toBe(supervisorId);
    expect(att!.reason).toBe('no call');
    expect(att!.payDeductPaise).toBe(50000);

    // AuditEvent recorded
    const audits = await prismaRaw.auditEvent.findMany({
      where: { companyId: companyAId, kind: 'WORKER_MARKED_ABSENT', targetId: workerAId },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0]!.actorId).toBe(supervisorId);

    // Outbox topics enqueued
    const outboxRows = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId, processedAt: null },
    });
    const topics = outboxRows.map((r) => r.topic);
    expect(topics).toContain('hr.worker_absent');
    expect(topics).toContain('payroll.recompute');
  });

  it('idempotent: re-marking same (worker, date) updates the row, no dup', async () => {
    await inject(
      'POST',
      `/workers/${workerAId}/mark-absent`,
      { date: '2026-05-09', status: 'ABSENT_NO_CALL' },
      authHeader(),
    );
    const res = await inject(
      'POST',
      `/workers/${workerAId}/mark-absent`,
      { date: '2026-05-09', status: 'HALF_DAY', reason: 'came late' },
      authHeader(),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; payDeductPaise: number };
    expect(body.status).toBe('HALF_DAY');
    // Half of ₹500 = ₹250 = 25,000 paise
    expect(body.payDeductPaise).toBe(25000);

    const rows = await prismaRaw.attendance.findMany({
      where: { workerId: workerAId, date: new Date('2026-05-09') },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe('HALF_DAY');
    expect(rows[0]!.reason).toBe('came late');
  });
});
