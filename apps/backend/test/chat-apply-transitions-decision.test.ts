/**
 * Real-DB integration test: /chat/apply transitions PROPOSED → APPLIED.
 *
 * F-002 §3b route-level test. Exercises the apply path via Fastify inject
 * without invoking the live OpenAI loop. The test seeds a PROPOSED
 * SupervisorDecision row directly (as chat extractor would have done in
 * persistChatTurn), then calls /chat/apply with decisionId + toolInput.
 *
 * Cases:
 *   1. Happy path: decisionId provided + valid → row's appliedAt set,
 *      DWI_APPLIED emitted, domain effect produced (Attendance row for
 *      MARK_ABSENT via inject to /workers/:id/mark-absent).
 *   2. Back-compat: decisionId omitted → /chat/apply skips lifecycle update,
 *      proceeds with domain write (row stays PROPOSED).
 *   3. Wrong responsible supervisor → 403 NOT_RESPONSIBLE (lifecycle bails
 *      before any domain write).
 *   4. Already-applied row → 409 ALREADY_APPLIED.
 *   5. propose_termination: lifecycle + domain write are atomic in one tx;
 *      row appliedAt set AND worker.state moved to TERMINATION_PENDING.
 *
 * @derives(F-002 scope §3b)
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

const TEST_PREFIX = `f002-applyroute-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let userA: string;
let userB: string;
let workerOnSiteA: string;
let siteA: string;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999924001',
      ownerName: 'O',
    },
  });
  companyId = co.id;

  const mk = async (name: string, offset: number) =>
    (
      await prisma.user.create({
        data: {
          phone: '+919999' + String(Date.now() + offset).slice(-7),
          name,
          locale: 'en',
          companyId,
        },
      })
    ).id;

  userA = await mk('A', 2400);
  userB = await mk('B', 2401);

  await prisma.membership.create({
    data: { companyId, userId: userA, role: 'SUPERVISOR' },
  });
  await prisma.membership.create({
    data: { companyId, userId: userB, role: 'SUPERVISOR' },
  });

  const w = await prisma.worker.create({
    data: {
      companyId,
      name: 'WA',
      state: 'ACTIVE',
      phone: '+919999' + String(Date.now() + 2402).slice(-7),
    },
  });
  workerOnSiteA = w.id;

  const s = await prisma.site.create({ data: { companyId, name: 'siteA' } });
  siteA = s.id;

  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
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
      companyId,
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
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
  tokenB = await issueAccessToken({
    userId: userB,
    companyId,
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
  payload?: Record<string, unknown>;
}): Promise<string> {
  const decisionId = randomUUID();
  await prisma.supervisorDecision.create({
    data: {
      id: decisionId,
      companyId,
      supervisorId: args.supervisorId,
      kind: args.kind,
      tier: args.tier ?? 'OPERATIONAL',
      targetId: args.targetId,
      payload: (args.payload ?? {}) as object,
    },
  });
  return decisionId;
}

describe('POST /chat/apply with decisionId — F-002 §3b', () => {
  it('happy path: applies row + creates Attendance + emits DWI_APPLIED', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
      payload: { workerId: workerOnSiteA, date: '2026-05-14', reason: 'sick' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        toolInput: { workerId: workerOnSiteA, date: '2026-05-14', reason: 'sick' },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).not.toBeNull();
    expect(row!.dismissedAt).toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    expect(audit).not.toBeNull();

    const attendance = await prisma.attendance.findFirst({
      where: { companyId, workerId: workerOnSiteA, date: new Date('2026-05-14') },
    });
    expect(attendance).not.toBeNull();
  });

  // F-002.5 + friend's required addition 2: the prior "decisionId omitted →
  // success path" test would have normalised the stale-client behaviour. After
  // the back-compat path was removed, missing decisionId is a hard 400 — no
  // domain side effect, no lifecycle change.
  it('400 BAD_INPUT when decisionId is omitted (back-compat path removed)', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
      payload: { workerId: workerOnSiteA, date: '2026-05-13' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        toolInput: { workerId: workerOnSiteA, date: '2026-05-13' },
        // intentionally NO decisionId
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');

    // Row stays PROPOSED.
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();
    expect(row!.dismissedAt).toBeNull();

    // NO domain side effect.
    const attendance = await prisma.attendance.findFirst({
      where: { companyId, workerId: workerOnSiteA, date: new Date('2026-05-13') },
    });
    expect(attendance).toBeNull();
  });

  it('403 NOT_RESPONSIBLE: wrong supervisor; no domain side effect', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
      payload: { workerId: workerOnSiteA, date: '2026-05-12' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        toolInput: { workerId: workerOnSiteA, date: '2026-05-12' },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('NOT_RESPONSIBLE');

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();

    // No attendance row should exist for that date.
    const attendance = await prisma.attendance.findFirst({
      where: { companyId, workerId: workerOnSiteA, date: new Date('2026-05-12') },
    });
    expect(attendance).toBeNull();
  });

  it('409 ALREADY_APPLIED: second apply on the same decisionId fails', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
      payload: { workerId: workerOnSiteA, date: '2026-05-11' },
    });
    // First apply.
    const r1 = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        toolInput: { workerId: workerOnSiteA, date: '2026-05-11' },
        decisionId,
      },
    });
    expect(r1.statusCode).toBe(200);

    // Second apply with same decisionId.
    const r2 = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        toolInput: { workerId: workerOnSiteA, date: '2026-05-11' },
        decisionId,
      },
    });
    expect(r2.statusCode).toBe(409);
    expect(r2.json().error).toBe('ALREADY_APPLIED');
  });

  it('propose_termination: lifecycle + worker state change are atomic in one tx', async () => {
    // Fresh worker so termination is allowed.
    const w = await prisma.worker.create({
      data: {
        companyId,
        name: 'TermW',
        state: 'ACTIVE',
        phone: '+919999' + String(Date.now() + 2410).slice(-7),
      },
    });
    const decisionId = await seedProposed({
      kind: 'TERMINATE_WORKER',
      tier: 'EMPLOYMENT',
      supervisorId: userA,
      targetId: w.id,
      payload: { workerId: w.id, effectiveDate: '2026-06-01', reason: 'perf' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_termination',
        toolInput: { workerId: w.id, effectiveDate: '2026-06-01', reason: 'perf' },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).not.toBeNull();

    const updated = await prisma.worker.findUnique({ where: { id: w.id } });
    expect(updated!.state).toBe('TERMINATION_PENDING');
  });
});
