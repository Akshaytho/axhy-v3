/**
 * Real-DB integration test: POST /visits/:id/end
 *
 * Exercises:
 *   1. 401 unauth, 400 malformed
 *   2. 404 not-found / cross-tenant
 *   3. 409 from invalid prior state (SCHEDULED, COMPLETED, etc.)
 *   4. Happy path STARTED → ENDED + AuditEvent + Outbox(ai.verify)
 *   5. Happy path IN_PROGRESS → ENDED
 *
 * Uses real Railway Postgres.
 *
 * @derives(ADR-0007)
 * @derives(data-flow §5)
 * @derives(panel-2026-05-08) — Phase B.5
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

const TEST_PREFIX = `endvisit-${Date.now()}-`;
const SUP_PHONE = `+9199${String(Date.now()).slice(-8)}`;
const WORKER_PHONE = `+9199${String(Date.now() + 1).slice(-8)}`;
const WORKER_OTHER_PHONE = `+9199${String(Date.now() + 2).slice(-8)}`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let supervisorId: string;
let workerId: string;
let siteAId: string;
let visitStartedId: string;
let visitInProgressId: string;
let visitScheduledId: string;
let visitEndedAlreadyId: string;
let visitOtherTenantId: string;
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
      ownerPhone: '+919900000097',
      ownerName: 'Owner A',
    },
  });
  companyAId = a.id;
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'co-b',
      ownerPhone: '+919900000098',
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

  const w = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      name: 'End-Visit Worker',
      phone: WORKER_PHONE,
      state: 'ACTIVE',
      baseSalaryPaise: 1300000,
    },
  });
  workerId = w.id;
  const wOther = await prismaRaw.worker.create({
    data: {
      companyId: companyBId,
      name: 'Other Tenant Worker',
      phone: WORKER_OTHER_PHONE,
      state: 'ACTIVE',
      baseSalaryPaise: 1200000,
    },
  });

  const sA = await prismaRaw.site.create({
    data: { companyId: companyAId, name: 'IT Park C', state: 'ACTIVE' },
  });
  siteAId = sA.id;
  const sOther = await prismaRaw.site.create({
    data: { companyId: companyBId, name: 'Other Tenant Mall', state: 'ACTIVE' },
  });

  const startedAt = new Date(Date.now() - 60 * 60_000);
  const scheduledFor = new Date(Date.now() - 90 * 60_000);

  const vStarted = await prismaRaw.visit.create({
    data: {
      companyId: companyAId,
      workerId,
      siteId: siteAId,
      state: 'STARTED',
      scheduledFor,
      startedAt,
    },
  });
  visitStartedId = vStarted.id;

  const vInProgress = await prismaRaw.visit.create({
    data: {
      companyId: companyAId,
      workerId,
      siteId: siteAId,
      state: 'IN_PROGRESS',
      scheduledFor,
      startedAt,
    },
  });
  visitInProgressId = vInProgress.id;

  const vScheduled = await prismaRaw.visit.create({
    data: {
      companyId: companyAId,
      workerId,
      siteId: siteAId,
      state: 'SCHEDULED',
      scheduledFor,
    },
  });
  visitScheduledId = vScheduled.id;

  const vEnded = await prismaRaw.visit.create({
    data: {
      companyId: companyAId,
      workerId,
      siteId: siteAId,
      state: 'ENDED',
      scheduledFor,
      startedAt,
      completedAt: new Date(),
    },
  });
  visitEndedAlreadyId = vEnded.id;

  const vOther = await prismaRaw.visit.create({
    data: {
      companyId: companyBId,
      workerId: wOther.id,
      siteId: sOther.id,
      state: 'STARTED',
      scheduledFor,
      startedAt,
    },
  });
  visitOtherTenantId = vOther.id;

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
  await prismaRaw.visit.deleteMany({
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

describe('POST /visits/:id/end', () => {
  it('rejects unauthenticated with 401', async () => {
    const res = await inject('POST', `/visits/${visitStartedId}/end`, {});
    expect(res.statusCode).toBe(401);
  });

  it('rejects oversized note with 400', async () => {
    const res = await inject(
      'POST',
      `/visits/${visitStartedId}/end`,
      { note: 'x'.repeat(600) },
      authHeader(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for cross-tenant visit', async () => {
    const res = await inject('POST', `/visits/${visitOtherTenantId}/end`, {}, authHeader());
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when visit is in SCHEDULED state', async () => {
    const res = await inject('POST', `/visits/${visitScheduledId}/end`, {}, authHeader());
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string; state: string };
    expect(body.error).toBe('INVALID_STATE');
    expect(body.state).toBe('SCHEDULED');
  });

  it('returns 409 when visit is already ENDED', async () => {
    const res = await inject('POST', `/visits/${visitEndedAlreadyId}/end`, {}, authHeader());
    expect(res.statusCode).toBe(409);
    const body = res.json() as { state: string };
    expect(body.state).toBe('ENDED');
  });

  it('happy path: STARTED → ENDED + AuditEvent + Outbox(ai.verify)', async () => {
    const res = await inject(
      'POST',
      `/visits/${visitStartedId}/end`,
      { note: 'site clean, client happy' },
      authHeader(),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: true; visitId: string; state: string; endedAt: string };
    expect(body.state).toBe('ENDED');
    expect(body.visitId).toBe(visitStartedId);

    const updated = await prismaRaw.visit.findUnique({ where: { id: visitStartedId } });
    expect(updated!.state).toBe('ENDED');
    expect(updated!.completedAt).not.toBeNull();

    const audits = await prismaRaw.auditEvent.findMany({
      where: { companyId: companyAId, kind: 'VISIT_ENDED', targetId: visitStartedId },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0]!.actorId).toBe(supervisorId);

    const outbox = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId, topic: 'ai.verify', processedAt: null },
    });
    const ours = outbox.find(
      (row) => (row.payload as { visitId?: string }).visitId === visitStartedId,
    );
    expect(ours).toBeDefined();
  });

  it('happy path: IN_PROGRESS → ENDED', async () => {
    const res = await inject('POST', `/visits/${visitInProgressId}/end`, {}, authHeader());
    expect(res.statusCode).toBe(200);
    const body = res.json() as { state: string };
    expect(body.state).toBe('ENDED');

    const updated = await prismaRaw.visit.findUnique({ where: { id: visitInProgressId } });
    expect(updated!.state).toBe('ENDED');
  });
});
