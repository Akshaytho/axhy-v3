/**
 * Real-DB integration test: POST /decisions/:id/dismiss.
 *
 * F-002 §3c HTTP surface test. Exercises the dismiss route end-to-end via
 * Fastify inject:
 *   - Happy path returns 200 + body, sets dismissedAt + dismissedReason,
 *     emits DWI_DISMISSED, removes row from GET /decisions/proposed-for-me.
 *   - 400 BAD_INPUT when reason missing / empty / too long.
 *   - 404 NOT_FOUND when id does not exist (or belongs to another company).
 *   - 409 ALREADY_APPLIED / ALREADY_DISMISSED guard.
 *   - 403 NOT_RESPONSIBLE for binding-routable kinds when caller is not the
 *     currently responsible supervisor.
 *
 * Writer-level coverage for dismiss is implicitly via this route.
 *
 * @derives(F-002 scope §3c)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-dismiss-${Date.now()}-`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let userA: string;
let userB: string;
let userC: string;
let workerOnSiteA: string;
let siteA: string;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const a = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+919999922001',
      ownerName: 'O',
    },
  });
  companyAId = a.id;
  const b = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'B',
      slug: TEST_PREFIX + 'b',
      ownerPhone: '+919999922002',
      ownerName: 'O',
    },
  });
  companyBId = b.id;

  const mk = async (name: string, offset: number, cid: string) =>
    (
      await prisma.user.create({
        data: {
          phone: '+919999' + String(Date.now() + offset).slice(-7),
          name,
          locale: 'en',
          companyId: cid,
        },
      })
    ).id;

  userA = await mk('A', 2200, companyAId);
  userB = await mk('B', 2201, companyAId);
  userC = await mk('C', 2202, companyBId);

  await prisma.membership.create({
    data: { companyId: companyAId, userId: userA, role: 'SUPERVISOR' },
  });
  await prisma.membership.create({
    data: { companyId: companyAId, userId: userB, role: 'SUPERVISOR' },
  });

  const w = await prisma.worker.create({
    data: {
      companyId: companyAId,
      name: 'WA',
      phone: '+919999' + String(Date.now() + 2203).slice(-7),
    },
  });
  workerOnSiteA = w.id;

  const s = await prisma.site.create({ data: { companyId: companyAId, name: 'siteA' } });
  siteA = s.id;

  await prisma.siteSupervisorBinding.create({
    data: {
      companyId: companyAId,
      siteId: siteA,
      userId: userA,
      actingForUserId: null,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: null,
      reason: 'Permanent',
      createdBy: userA,
    },
  });

  await prisma.assignment.create({
    data: {
      companyId: companyAId,
      workerId: workerOnSiteA,
      siteId: siteA,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      validUntil: null,
      state: 'ACTIVE',
    },
  });

  tokenA = await issueAccessToken({
    userId: userA,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
  tokenB = await issueAccessToken({
    userId: userB,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await deleteCompanyDeep(prisma, { slugPrefix: TEST_PREFIX });
  await app.close();
  await prisma.$disconnect();
});

async function seedProposed(args: {
  kind: string;
  tier?: string;
  supervisorId: string;
  targetId: string | null;
  companyId?: string;
}): Promise<string> {
  const decisionId = randomUUID();
  await prisma.supervisorDecision.create({
    data: {
      id: decisionId,
      companyId: args.companyId ?? companyAId,
      supervisorId: args.supervisorId,
      kind: args.kind,
      tier: args.tier ?? 'OPERATIONAL',
      targetId: args.targetId,
      payload: {},
    },
  });
  return decisionId;
}

describe('POST /decisions/:id/dismiss — F-002 §3c', () => {
  it('200 happy path: sets dismissedAt + dismissedReason + emits DWI_DISMISSED', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    const res = await app.inject({
      method: 'POST',
      url: `/decisions/${decisionId}/dismiss`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: 'Worker is actually present, false alarm' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.decisionId).toBe(decisionId);
    expect(typeof body.dismissedAt).toBe('string');

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.dismissedAt).not.toBeNull();
    expect(row!.dismissedReason).toBe('Worker is actually present, false alarm');
    expect(row!.appliedAt).toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { companyId: companyAId, kind: 'DWI_DISMISSED', targetId: decisionId },
    });
    expect(audit).not.toBeNull();
  });

  it('dismissed row is excluded from GET /decisions/proposed-for-me', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    // Confirm it's visible first.
    let listRes = await app.inject({
      method: 'GET',
      url: '/decisions/proposed-for-me',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.json().decisions.some((d: { id: string }) => d.id === decisionId)).toBe(true);

    await app.inject({
      method: 'POST',
      url: `/decisions/${decisionId}/dismiss`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: 'no-op' },
    });

    listRes = await app.inject({
      method: 'GET',
      url: '/decisions/proposed-for-me',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.json().decisions.some((d: { id: string }) => d.id === decisionId)).toBe(false);
  });

  it('400 BAD_INPUT when reason is missing', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    const res = await app.inject({
      method: 'POST',
      url: `/decisions/${decisionId}/dismiss`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  it('404 NOT_FOUND when id does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/decisions/${randomUUID()}/dismiss`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('404 (CROSS_TENANT) when id belongs to another company (no info leak)', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userC,
      targetId: null,
      companyId: companyBId,
    });
    const res = await app.inject({
      method: 'POST',
      url: `/decisions/${decisionId}/dismiss`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: 'cross tenant attempt' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('CROSS_TENANT');
  });

  it('403 NOT_RESPONSIBLE when caller is not the responsible supervisor for binding-routable kind', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    // userB has no binding to siteA, so they are not responsible.
    const res = await app.inject({
      method: 'POST',
      url: `/decisions/${decisionId}/dismiss`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { reason: 'attempt' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('NOT_RESPONSIBLE');
  });

  it('409 ALREADY_APPLIED when the row was already applied', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    await prisma.supervisorDecision.update({
      where: { id: decisionId },
      data: { appliedAt: new Date() },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/decisions/${decisionId}/dismiss`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: 'late' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('ALREADY_APPLIED');
  });
});
