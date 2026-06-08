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
const SUP_B_PHONE = `+9199${String(Date.now() + 4).slice(-8)}`;
const WORKER_PHONE_UNASSIGNED = `+9199${String(Date.now() + 5).slice(-8)}`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let supervisorId: string;
let supervisorBId: string;
let workerAId: string;
let workerBId: string;
let workerUnassignedId: string;
let siteAId: string;
let accessToken: string;
let accessTokenB: string;

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

  // Worker in CoA — supervisor can mark this one.
  // ADR-0025: salary lives on Membership now; create User + Membership(WORKER) first.
  const wAUser = await prismaRaw.user.create({
    data: { phone: WORKER_PHONE_A, locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: {
      companyId: companyAId,
      userId: wAUser.id,
      role: 'WORKER',
      baseSalaryPaise: 1300000, // ₹13,000/mo → ~₹500/day
    },
  });
  const wA = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      userId: wAUser.id,
      name: 'Mukesh Yadav',
      phone: WORKER_PHONE_A,
      state: 'ACTIVE',
    },
  });
  workerAId = wA.id;

  // Worker in CoB — supervisor must NOT be able to mark this one.
  const wBUser = await prismaRaw.user.create({
    data: { phone: WORKER_PHONE_OTHER_TENANT, locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: {
      companyId: companyBId,
      userId: wBUser.id,
      role: 'WORKER',
      baseSalaryPaise: 1200000,
    },
  });
  const wB = await prismaRaw.worker.create({
    data: {
      companyId: companyBId,
      userId: wBUser.id,
      name: 'Other Tenant Worker',
      phone: WORKER_PHONE_OTHER_TENANT,
      state: 'ACTIVE',
    },
  });
  workerBId = wB.id;

  // Site in CoA — workerA is assigned here; supervisorId is the PERMANENT binding.
  // Q2=B hardening: without this seed, the new supervises-worker check would
  // reject the existing happy path (no effective binding → NO_PRIMARY_SITE).
  const site = await prismaRaw.site.create({
    data: {
      companyId: companyAId,
      name: TEST_PREFIX + 'Site',
      state: 'ACTIVE',
    },
  });
  siteAId = site.id;

  // Assignment placing workerA at siteA, ACTIVE, open-ended validity.
  await prismaRaw.assignment.create({
    data: {
      companyId: companyAId,
      workerId: workerAId,
      siteId: siteAId,
      shiftStart: '09:00',
      shiftEnd: '18:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date('2026-01-01'),
      state: 'ACTIVE',
    },
  });

  // PERMANENT binding: supervisorId owns siteA from 2026-01-01.
  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId: companyAId,
      siteId: siteAId,
      userId: supervisorId,
      effectiveFrom: new Date('2026-01-01'),
      reason: 'test seed — PERMANENT binding for mark-absent happy path',
      createdBy: supervisorId,
    },
  });

  // SupervisorB in CoA — same tenant as workerA, but NOT bound to siteA.
  // Used for Q2=B cross-supervisor-within-same-tenant rejection.
  const supB = await prismaRaw.user.create({
    data: { phone: SUP_B_PHONE, name: 'Test Supervisor B', locale: 'en' },
  });
  supervisorBId = supB.id;
  await prismaRaw.membership.create({
    data: { companyId: companyAId, userId: supB.id, role: 'SUPERVISOR' },
  });

  // Worker in CoA with NO Assignment — used for "no derivable primary site" rejection.
  const wUnUser = await prismaRaw.user.create({
    data: { phone: WORKER_PHONE_UNASSIGNED, locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: {
      companyId: companyAId,
      userId: wUnUser.id,
      role: 'WORKER',
      baseSalaryPaise: 1300000,
    },
  });
  const wUnassigned = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      userId: wUnUser.id,
      name: 'Unassigned Worker',
      phone: WORKER_PHONE_UNASSIGNED,
      state: 'ACTIVE',
    },
  });
  workerUnassignedId = wUnassigned.id;

  accessToken = await issueAccessToken({
    userId: supervisorId,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  accessTokenB = await issueAccessToken({
    userId: supervisorBId,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await app.close();
  // Cascade delete: Company → Attendance / AuditEvent / Outbox / Worker / Assignment / Binding / Site
  await prismaRaw.attendance.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.auditEvent.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.outbox.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.siteSupervisorBinding.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.assignment.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.site.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.membership.deleteMany({
    where: { company: { slug: { startsWith: TEST_PREFIX } } },
  });
  await prismaRaw.worker.deleteMany({
    where: { company: { slug: { startsWith: TEST_PREFIX } } },
  });
  await prismaRaw.user.deleteMany({
    where: {
      phone: {
        in: [
          SUP_PHONE,
          SUP_B_PHONE,
          WORKER_PHONE_A,
          WORKER_PHONE_OTHER_TENANT,
          WORKER_PHONE_UNASSIGNED,
        ],
      },
    },
  });
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
const authHeaderB = () => ({ authorization: `Bearer ${accessTokenB}` });

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
    // Assert the rows were ENQUEUED (existence), not that they remain unprocessed —
    // the in-process dispatcher races to mark stub rows processedAt (flaky filter).
    const outboxRows = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId },
    });
    const topics = outboxRows.map((r) => r.topic);
    expect(topics).toContain('hr.worker_absent');
    expect(topics).toContain('payroll.recompute');
  });

  it('Q2=B: rejects with 403 when caller is in same tenant but not the responsible supervisor for the worker', async () => {
    // SupB is a SUPERVISOR in CoA but has no binding to workerA's site.
    // workerA's site is bound to SupA (the existing happy-path supervisor).
    // Expect: 403 NOT_SUPERVISOR + NO Attendance row written.
    const date = '2026-05-10';
    const res = await inject(
      'POST',
      `/workers/${workerAId}/mark-absent`,
      { date, status: 'ABSENT_NO_CALL', reason: 'not your worker' },
      authHeaderB(),
    );
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('NOT_SUPERVISOR');

    // No Attendance row written despite the call.
    const att = await prismaRaw.attendance.findUnique({
      where: { workerId_date: { workerId: workerAId, date: new Date(date) } },
    });
    expect(att).toBeNull();
  });

  it('Q2=B: rejects with 403 when worker has no derivable primary site (no Assignment)', async () => {
    // workerUnassigned has no Assignment row → deriveWorkerPrimarySiteId returns null.
    // Even SupA (a real supervisor in the tenant) cannot mark them absent —
    // there is no site, therefore no binding, therefore no responsible supervisor.
    const date = '2026-05-11';
    const res = await inject(
      'POST',
      `/workers/${workerUnassignedId}/mark-absent`,
      { date, status: 'ABSENT_NO_CALL' },
      authHeader(),
    );
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('NOT_SUPERVISOR');

    const att = await prismaRaw.attendance.findUnique({
      where: { workerId_date: { workerId: workerUnassignedId, date: new Date(date) } },
    });
    expect(att).toBeNull();
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
