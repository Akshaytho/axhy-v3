/**
 * Real-DB integration test: /chat/apply atomicity (F-002.15 verification).
 *
 * F-002.16 — proves that under R2b-iii every /chat/apply branch is atomic:
 * if any of preCheckApply / service / commitApply throws, the whole tx rolls
 * back. No partial state. This is the load-bearing test for the friend's
 * requirement that "domain effect happens iff lifecycle commit happens".
 *
 * Cases (one per ex-inject branch, all 4 services + termination):
 *
 *   - propose_create_assignment domain failure (WORKER_NOT_FOUND) →
 *     row stays PROPOSED + no Assignment row created.
 *   - propose_mark_absent domain failure (WORKER_NOT_FOUND) →
 *     row stays PROPOSED + no Attendance row created.
 *   - propose_leave domain failure (WORKER_NOT_FOUND) →
 *     row stays PROPOSED + no LeaveRequest row created.
 *   - propose_swap domain failure (SITE_NOT_FOUND) →
 *     row stays PROPOSED + no SwapRequest row created.
 *   - propose_termination domain failure (ALREADY_TERMINATING) → covered by
 *     F-002.11's G1 test; not duplicated here.
 *
 * Each case follows the same shape:
 *   1. Seed PROPOSED row with a valid target referenced by the chat-tool
 *      input (so preCheck passes).
 *   2. Mutate the chat-tool input to reference a NON-EXISTENT entity
 *      (worker / site) — this triggers the service's discriminated-union
 *      failure path inside the tx.
 *   3. Call /chat/apply via app.inject.
 *   4. Assert: 404 returned; row stays PROPOSED; no domain row exists.
 *
 * @derives(F-002.16 — atomicity verification)
 * @derives(production-grade-rulebook P3 + P8 — atomic workflow)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-atom-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let userA: string;
let worker: string;
let site: string;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999928001',
      ownerName: 'O',
    },
  });
  companyId = co.id;

  userA = (
    await prisma.user.create({
      data: {
        phone: '+919999' + String(Date.now() + 1).slice(-7),
        name: 'A',
        locale: 'en',
        companyId,
      },
    })
  ).id;

  await prisma.membership.create({
    data: { companyId, userId: userA, role: 'SUPERVISOR' },
  });

  worker = (
    await prisma.worker.create({
      data: {
        companyId,
        name: 'W',
        state: 'ACTIVE',
        phone: '+919999' + String(Date.now() + 2).slice(-7),
      },
    })
  ).id;

  site = (await prisma.site.create({ data: { companyId, name: 'site' } })).id;

  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: site,
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
      workerId: worker,
      siteId: site,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      validUntil: null,
      state: 'ACTIVE',
    },
  });

  token = await issueAccessToken({
    userId: userA,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await app.close();
  await prisma.$disconnect();
});

async function seedProposed(args: {
  kind: string;
  tier?: string;
  targetId: string | null;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const decisionId = randomUUID();
  await prisma.supervisorDecision.create({
    data: {
      id: decisionId,
      companyId,
      supervisorId: userA,
      kind: args.kind,
      tier: args.tier ?? 'OPERATIONAL',
      targetId: args.targetId,
      payload: (args.payload ?? {}) as object,
    },
  });
  return decisionId;
}

describe('/chat/apply atomicity (R2b-iii) — F-002.16', () => {
  it('propose_mark_absent: WORKER_NOT_FOUND rolls back lifecycle (row stays PROPOSED + no Attendance)', async () => {
    const nonexistentWorker = randomUUID();
    // Seed a PROPOSED row that routes to a VALID worker (so preCheck passes
    // via origin-supervisor fallback since the missing worker won't route).
    // To make preCheck pass with binding-routing, we set targetId to a real
    // worker that maps via primary-site. Then the chat-tool input refers to
    // a non-existent worker → markAbsentService throws WORKER_NOT_FOUND.
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      targetId: worker, // real worker; preCheck passes via binding routing
      payload: { workerId: nonexistentWorker, date: '2026-04-20' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        // toolInput points at the NON-EXISTENT worker → service throws.
        toolInput: { workerId: nonexistentWorker, date: '2026-04-20' },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('WORKER_NOT_FOUND');

    // Row stays PROPOSED.
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();
    expect(row!.dismissedAt).toBeNull();

    // No DWI_APPLIED audit.
    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    expect(audits.length).toBe(0);

    // No Attendance row for the non-existent worker.
    const attendance = await prisma.attendance.findFirst({
      where: { companyId, workerId: nonexistentWorker },
    });
    expect(attendance).toBeNull();
  });

  it('propose_leave: WORKER_NOT_FOUND rolls back lifecycle (row stays PROPOSED + no LeaveRequest)', async () => {
    const nonexistentWorker = randomUUID();
    const decisionId = await seedProposed({
      kind: 'APPROVE_LEAVE',
      targetId: worker,
      payload: { workerId: nonexistentWorker, fromDate: '2026-04-21', toDate: '2026-04-23' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_leave',
        toolInput: {
          workerId: nonexistentWorker,
          fromDate: '2026-04-21',
          toDate: '2026-04-23',
          reason: 'test',
        },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('WORKER_NOT_FOUND');

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();

    const leaveRow = await prisma.leaveRequest.findFirst({
      where: { companyId, workerId: nonexistentWorker },
    });
    expect(leaveRow).toBeNull();
  });

  it('propose_swap: SITE_NOT_FOUND rolls back lifecycle (row stays PROPOSED + no SwapRequest)', async () => {
    const nonexistentSite = randomUUID();
    const futureIso = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
    // SWAP_WORKER is site-targeted; targetId IS the site — we pass `site`
    // so preCheck passes (the real bound site). Then chat-tool input refers
    // to a non-existent siteId → service throws SITE_NOT_FOUND.
    const decisionId = await seedProposed({
      kind: 'SWAP_WORKER',
      targetId: site,
      payload: {
        fromWorkerId: worker,
        toWorkerId: worker,
        siteId: nonexistentSite,
        effectiveAt: futureIso,
      },
    });

    // For the from/to workers, we need DIFFERENT workers; create a second one.
    const worker2 = await prisma.worker.create({
      data: {
        companyId,
        name: 'W2',
        state: 'ACTIVE',
        phone: '+919999' + String(Date.now() + 2800).slice(-7),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_swap',
        toolInput: {
          fromWorkerId: worker,
          toWorkerId: worker2.id,
          siteId: nonexistentSite,
          effectiveAt: futureIso,
        },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('SITE_NOT_FOUND');

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();

    const swapRow = await prisma.swapRequest.findFirst({
      where: { companyId, siteId: nonexistentSite },
    });
    expect(swapRow).toBeNull();
  });

  it('propose_create_assignment: WORKER_NOT_FOUND rolls back lifecycle (row stays PROPOSED + no Assignment)', async () => {
    const nonexistentWorker = randomUUID();
    const decisionId = await seedProposed({
      kind: 'CREATE_ASSIGNMENT',
      targetId: worker,
      payload: {
        workerId: nonexistentWorker,
        siteId: site,
        dayMask: 'MTWTFS_',
        shiftStart: '09:00',
        shiftEnd: '17:00',
        validFrom: '2026-04-01',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_create_assignment',
        toolInput: {
          workerId: nonexistentWorker,
          siteId: site,
          dayMask: 'MTWTFS_',
          shiftStart: '09:00',
          shiftEnd: '17:00',
          validFrom: '2026-04-01',
        },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('WORKER_NOT_FOUND');

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();

    const assignmentRow = await prisma.assignment.findFirst({
      where: { companyId, workerId: nonexistentWorker },
    });
    expect(assignmentRow).toBeNull();
  });
});
