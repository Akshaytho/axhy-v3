/**
 * Real-DB integration test: POST /swap-requests
 *
 * Exercises:
 *   1. 401 unauth, 400 malformed
 *   2. 400 same-worker swap
 *   3. 400 effectiveAt in the past
 *   4. 404 cross-tenant worker
 *   5. 404 cross-tenant site
 *   6. Happy path: writes SwapRequest + AuditEvent + 2 Outbox rows
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

const TEST_PREFIX = `swap-${Date.now()}-`;
const SUP_PHONE = `+9199${String(Date.now()).slice(-8)}`;
const WORKER_FROM_PHONE = `+9199${String(Date.now() + 1).slice(-8)}`;
const WORKER_TO_PHONE = `+9199${String(Date.now() + 2).slice(-8)}`;
const WORKER_OTHER_PHONE = `+9199${String(Date.now() + 3).slice(-8)}`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let supervisorId: string;
let fromWorkerId: string;
let toWorkerId: string;
let otherTenantWorkerId: string;
let siteAId: string;
let otherTenantSiteId: string;
let accessToken: string;

function inFuture(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const a = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'CoA',
      slug: TEST_PREFIX + 'co-a',
      ownerPhone: '+919900000095',
      ownerName: 'Owner A',
    },
  });
  companyAId = a.id;
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'co-b',
      ownerPhone: '+919900000096',
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

  const wFrom = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      name: 'From Worker',
      phone: WORKER_FROM_PHONE,
      state: 'ACTIVE',
      baseSalaryPaise: 1300000,
    },
  });
  fromWorkerId = wFrom.id;
  const wTo = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      name: 'To Worker',
      phone: WORKER_TO_PHONE,
      state: 'ACTIVE',
      baseSalaryPaise: 1300000,
    },
  });
  toWorkerId = wTo.id;
  const wOther = await prismaRaw.worker.create({
    data: {
      companyId: companyBId,
      name: 'Other Tenant Worker',
      phone: WORKER_OTHER_PHONE,
      state: 'ACTIVE',
      baseSalaryPaise: 1200000,
    },
  });
  otherTenantWorkerId = wOther.id;

  const sA = await prismaRaw.site.create({
    data: { companyId: companyAId, name: 'IT Park C', state: 'ACTIVE' },
  });
  siteAId = sA.id;
  const sOther = await prismaRaw.site.create({
    data: { companyId: companyBId, name: 'Other Tenant Mall', state: 'ACTIVE' },
  });
  otherTenantSiteId = sOther.id;

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
  await prismaRaw.swapRequest.deleteMany({
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

describe('POST /swap-requests', () => {
  it('rejects unauthenticated with 401', async () => {
    const res = await inject('POST', '/swap-requests', {
      fromWorkerId,
      toWorkerId,
      siteId: siteAId,
      effectiveAt: inFuture(60),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed input with 400', async () => {
    const res = await inject(
      'POST',
      '/swap-requests',
      { fromWorkerId: 'not-a-uuid', toWorkerId, siteId: siteAId, effectiveAt: inFuture(60) },
      authHeader(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects same-worker swap with 400', async () => {
    const res = await inject(
      'POST',
      '/swap-requests',
      { fromWorkerId, toWorkerId: fromWorkerId, siteId: siteAId, effectiveAt: inFuture(60) },
      authHeader(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects past effectiveAt with 400', async () => {
    const res = await inject(
      'POST',
      '/swap-requests',
      {
        fromWorkerId,
        toWorkerId,
        siteId: siteAId,
        effectiveAt: new Date(Date.now() - 60_000).toISOString(),
      },
      authHeader(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for cross-tenant fromWorker', async () => {
    const res = await inject(
      'POST',
      '/swap-requests',
      {
        fromWorkerId: otherTenantWorkerId,
        toWorkerId,
        siteId: siteAId,
        effectiveAt: inFuture(60),
      },
      authHeader(),
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for cross-tenant site', async () => {
    const res = await inject(
      'POST',
      '/swap-requests',
      {
        fromWorkerId,
        toWorkerId,
        siteId: otherTenantSiteId,
        effectiveAt: inFuture(60),
      },
      authHeader(),
    );
    expect(res.statusCode).toBe(404);
  });

  it('happy path: writes SwapRequest + AuditEvent + 2 Outbox rows', async () => {
    const effectiveAt = inFuture(120);
    const res = await inject(
      'POST',
      '/swap-requests',
      {
        fromWorkerId,
        toWorkerId,
        siteId: siteAId,
        effectiveAt,
        reason: 'requested by client',
      },
      authHeader(),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: true;
      swapRequestId: string;
      fromWorkerId: string;
      toWorkerId: string;
      siteId: string;
      state: string;
      effectiveAt: string;
    };
    expect(body.ok).toBe(true);
    expect(body.fromWorkerId).toBe(fromWorkerId);
    expect(body.toWorkerId).toBe(toWorkerId);
    expect(body.siteId).toBe(siteAId);
    expect(body.state).toBe('SENT');

    const swap = await prismaRaw.swapRequest.findUnique({ where: { id: body.swapRequestId } });
    expect(swap).not.toBeNull();
    expect(swap!.companyId).toBe(companyAId);
    expect(swap!.supervisorId).toBe(supervisorId);
    expect(swap!.state).toBe('SENT');
    expect(swap!.reason).toBe('requested by client');

    const audits = await prismaRaw.auditEvent.findMany({
      where: { companyId: companyAId, kind: 'SWAP_REQUEST_SENT', targetId: body.swapRequestId },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0]!.actorId).toBe(supervisorId);

    const outbox = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId, topic: 'gupshup.send', processedAt: null },
    });
    const ours = outbox.filter(
      (row) => (row.payload as { swapRequestId?: string }).swapRequestId === body.swapRequestId,
    );
    expect(ours.length).toBe(2); // one notification per worker
    const recipientIds = ours.map(
      (row) => (row.payload as { recipient?: { workerId?: string } }).recipient?.workerId,
    );
    expect(recipientIds).toContain(fromWorkerId);
    expect(recipientIds).toContain(toWorkerId);
  });
});
