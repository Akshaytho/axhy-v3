/**
 * Real-DB integration test: POST /sites/:id/complaints
 *
 * Exercises:
 *   1. 401 unauth, 400 malformed
 *   2. Cross-tenant 404 (site belongs to another company)
 *   3. Happy path: writes Complaint + AuditEvent + Outbox row
 *   4. Severity defaults to LOW when omitted
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

const TEST_PREFIX = `complaint-${Date.now()}-`;
const SUP_PHONE = `+9199${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let supervisorId: string;
let siteAId: string;
let siteOtherTenantId: string;
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
      ownerPhone: '+919900000093',
      ownerName: 'Owner A',
    },
  });
  companyAId = a.id;
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'co-b',
      ownerPhone: '+919900000094',
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

  const sA = await prismaRaw.site.create({
    data: { companyId: companyAId, name: 'IT Park C', state: 'ACTIVE' },
  });
  siteAId = sA.id;
  const sOther = await prismaRaw.site.create({
    data: { companyId: companyBId, name: 'Other Tenant Mall', state: 'ACTIVE' },
  });
  siteOtherTenantId = sOther.id;

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
  await prismaRaw.complaint.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.site.deleteMany({
    where: { OR: [{ companyId: companyAId }, { companyId: companyBId }] },
  });
  await prismaRaw.membership.deleteMany({
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

describe('POST /sites/:id/complaints', () => {
  it('rejects unauthenticated with 401', async () => {
    const res = await inject('POST', `/sites/${siteAId}/complaints`, { text: 'lobby unclean' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects empty text with 400', async () => {
    const res = await inject('POST', `/sites/${siteAId}/complaints`, { text: '   ' }, authHeader());
    expect(res.statusCode).toBe(400);
  });

  it('rejects oversized text with 400', async () => {
    const res = await inject(
      'POST',
      `/sites/${siteAId}/complaints`,
      { text: 'x'.repeat(2100) },
      authHeader(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects bad severity with 400', async () => {
    const res = await inject(
      'POST',
      `/sites/${siteAId}/complaints`,
      { text: 'lobby unclean', severity: 'CRITICAL' },
      authHeader(),
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for cross-tenant site', async () => {
    const res = await inject(
      'POST',
      `/sites/${siteOtherTenantId}/complaints`,
      { text: 'should not reach' },
      authHeader(),
    );
    expect(res.statusCode).toBe(404);
  });

  it('happy path: writes Complaint + AuditEvent + Outbox', async () => {
    const res = await inject(
      'POST',
      `/sites/${siteAId}/complaints`,
      { text: 'lobby floor still wet at 9am, client complained', severity: 'HIGH' },
      authHeader(),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: true;
      complaintId: string;
      siteId: string;
      severity: string;
      loggedBy: string;
    };
    expect(body.ok).toBe(true);
    expect(body.siteId).toBe(siteAId);
    expect(body.severity).toBe('HIGH');
    expect(body.loggedBy).toBe(supervisorId);

    const complaint = await prismaRaw.complaint.findUnique({ where: { id: body.complaintId } });
    expect(complaint).not.toBeNull();
    expect(complaint!.companyId).toBe(companyAId);
    expect(complaint!.siteId).toBe(siteAId);
    expect(complaint!.supervisorId).toBe(supervisorId);
    expect(complaint!.severity).toBe('HIGH');
    expect(complaint!.text).toContain('lobby floor');
    expect(complaint!.resolvedAt).toBeNull();

    const audits = await prismaRaw.auditEvent.findMany({
      where: { companyId: companyAId, kind: 'SITE_COMPLAINT_LOGGED', targetId: body.complaintId },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0]!.actorId).toBe(supervisorId);

    // Existence, not processedAt:null — the in-process dispatcher races to process it.
    const outbox = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId, topic: 'hr.site_complaint' },
    });
    expect(outbox.length).toBeGreaterThan(0);
    const ours = outbox.find(
      (row) => (row.payload as { complaintId?: string }).complaintId === body.complaintId,
    );
    expect(ours).toBeDefined();
  });

  it('defaults severity to LOW when omitted', async () => {
    const res = await inject(
      'POST',
      `/sites/${siteAId}/complaints`,
      { text: 'minor: bins not labeled' },
      authHeader(),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as { severity: string };
    expect(body.severity).toBe('LOW');
  });
});
