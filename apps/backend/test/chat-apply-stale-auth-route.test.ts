/**
 * Real-DB integration test: deterministic route-level stale-authority proof.
 *
 * F-002.19 — round-3 R3.2-a verification. Round-2's R2a auth re-check inside
 * commitApply was only proven at the writer level (round-2 F-002.11 directly
 * called preCheckApply + commitApply). Friend's P2 finding: the FULL
 * `/chat/apply` route flow (preCheckApply + service + commitApply, all in one
 * tx) was not directly tested for the stale-auth race.
 *
 * This test closes that gap deterministically using the test-only hook from
 * `__setCommitApplyTestHook`. The hook fires RIGHT BEFORE commitApply's auth
 * re-check, on a side-channel connection that commits a binding change. The
 * route's auth re-check then sees the new binding and throws NOT_RESPONSIBLE
 * → the entire tx rolls back (including the domain service's write).
 *
 * What this test proves:
 *   - Row stays PROPOSED (lifecycle rolled back).
 *   - NO Attendance row was created (domain rolled back).
 *   - NO DWI_APPLIED audit emitted.
 *   - HTTP response is 403 NOT_RESPONSIBLE.
 *
 * The hook is gated on `process.env.NODE_ENV === 'test'`; in production
 * (no NODE_ENV / 'production'), it is never read. Vitest sets NODE_ENV=test
 * automatically.
 *
 * @derives(F-002.19 / R3.2-a)
 * @derives(production-grade-rulebook P2 + P3 + P6 + P8)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

import { __setCommitApplyTestHook } from '../src/lib/supervisor-decision-writer.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-route-staleauth-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let userA: string; // permanent at site at propose-time
let userB: string; // takes over via acting cover during the race
let workerOnSite: string;
let site: string;
let tokenA: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999930001',
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

  userA = await mk('A', 3000);
  userB = await mk('B', 3001);
  await prisma.membership.create({
    data: { companyId, userId: userA, role: 'SUPERVISOR' },
  });
  await prisma.membership.create({
    data: { companyId, userId: userB, role: 'SUPERVISOR' },
  });

  workerOnSite = (
    await prisma.worker.create({
      data: {
        companyId,
        name: 'W',
        state: 'ACTIVE',
        phone: '+919999' + String(Date.now() + 3002).slice(-7),
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
      workerId: workerOnSite,
      siteId: site,
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
});

afterEach(() => {
  // Defensively clear the hook between tests so it can't leak.
  __setCommitApplyTestHook(null);
});

afterAll(async () => {
  __setCommitApplyTestHook(null);
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await app.close();
  await prisma.$disconnect();
});

async function seedProposed(args: { kind: string; targetId: string }): Promise<string> {
  const decisionId = randomUUID();
  await prisma.supervisorDecision.create({
    data: {
      id: decisionId,
      companyId,
      supervisorId: userA,
      kind: args.kind,
      tier: 'OPERATIONAL',
      targetId: args.targetId,
      payload: {},
    },
  });
  return decisionId;
}

describe('/chat/apply route-level stale authority (deterministic via test hook) — F-002.19 / R3.2-a', () => {
  it('binding change between preCheck and commit → 403 + row PROPOSED + no Attendance + no DWI_APPLIED', async () => {
    const date = '2026-04-30';
    const decisionId = await seedProposed({ kind: 'MARK_ABSENT', targetId: workerOnSite });

    let hookFired = false;
    let actingBindingId: string | null = null;

    __setCommitApplyTestHook(async () => {
      hookFired = true;
      // Side-channel connection: commit an ACTING binding that covers userA
      // → userB. This commits BEFORE commitApply's isCallerAuthorized reads
      // the binding (which happens on the next statement inside the route's
      // tx, under READ COMMITTED — sees the latest committed snapshot).
      const acting = await prisma.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site,
          userId: userB,
          actingForUserId: userA,
          effectiveFrom: new Date(Date.now() - 60_000),
          effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          reason: 'R3.2-a deterministic race',
          createdBy: userA,
        },
      });
      actingBindingId = acting.id;
      // Clear immediately so subsequent calls in the same test don't re-fire.
      __setCommitApplyTestHook(null);
    });

    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        toolInput: { workerId: workerOnSite, date },
        decisionId,
      },
    });

    // The hook MUST have fired (proves the route went through commitApply).
    expect(hookFired).toBe(true);

    // Route returns 403 NOT_RESPONSIBLE (R2a re-check caught the stale auth).
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('NOT_RESPONSIBLE');

    // Row stays PROPOSED — the tx rolled back the lifecycle UPDATE attempt.
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();
    expect(row!.dismissedAt).toBeNull();

    // NO Attendance row was created — the tx rolled back the SERVICE write too.
    // This is the load-bearing assertion: the domain effect did NOT leak
    // through the stale-auth window. Friend's P2 concern is closed at the
    // real /chat/apply route level.
    const attendance = await prisma.attendance.findFirst({
      where: { companyId, workerId: workerOnSite, date: new Date(date) },
    });
    expect(attendance).toBeNull();

    // NO DWI_APPLIED audit emitted — only the winner (here: no one) shows in audit.
    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    expect(audits.length).toBe(0);

    // Cleanup: the acting binding was created inside the test; remove it so
    // subsequent test cases (if any) start from a clean baseline.
    if (actingBindingId) {
      await prisma.siteSupervisorBinding.update({
        where: { id: actingBindingId },
        data: { effectiveUntil: new Date(Date.now() - 60_000) },
      });
    }
  });

  it('control: no hook set → same /chat/apply request succeeds (200 + Attendance row + DWI_APPLIED)', async () => {
    // Sanity test: with no race injected, the normal happy path still works.
    // This proves the hook is truly opt-in and doesn't poison the production
    // code path.
    const date = '2026-04-29';
    const decisionId = await seedProposed({ kind: 'MARK_ABSENT', targetId: workerOnSite });
    // Hook is null (afterEach reset). Don't set it.

    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        toolInput: { workerId: workerOnSite, date },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).not.toBeNull();

    const attendance = await prisma.attendance.findFirst({
      where: { companyId, workerId: workerOnSite, date: new Date(date) },
    });
    expect(attendance).not.toBeNull();

    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    expect(audits.length).toBe(1);
  });
});
