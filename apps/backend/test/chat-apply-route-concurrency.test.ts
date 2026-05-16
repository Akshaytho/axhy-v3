/**
 * Real-DB integration test: /chat/apply route-level concurrency + stale-auth.
 *
 * F-002.11 — friend's required addition R3. Round-1 concurrency tests called
 * the writer directly; the load-bearing path is the FULL route flow
 * (preCheckApply → service → commitApply for R2b-iii branches, or
 * preCheckApply → atomic-tx for termination). This file exercises that path
 * via `app.inject` parallel calls + binding-change scenarios.
 *
 * Cases:
 *   1. apply vs apply through /chat/apply: exactly one wins 200, the other 409.
 *   2. apply vs dismiss through HTTP routes: exactly one wins, audit matches winner.
 *   3. Stale authority at COMMIT time: directly exercises R2a — preCheck sees
 *      binding A, before commit the binding changes to B, commitApply re-checks
 *      auth and throws NOT_RESPONSIBLE.
 *   4. G1 verification (route-level): termination apply against a worker that's
 *      already TERMINATION_PENDING → 409 + row stays PROPOSED.
 *
 * @derives(F-002.11 — round-2 R3)
 * @derives(production-grade-rulebook P2 + P6 + P8)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

import {
  preCheckApply,
  commitApply,
  LifecycleError,
} from '../src/lib/supervisor-decision-writer.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-route-conc-${Date.now()}-`;

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
      ownerPhone: '+919999927001',
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

  userA = await mk('A', 2700);
  userB = await mk('B', 2701);

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
      phone: '+919999' + String(Date.now() + 2702).slice(-7),
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
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
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

describe('Round-2 route-level concurrency + stale-auth — F-002.11', () => {
  it('apply vs apply through /chat/apply: exactly one returns 200, the other 409', async () => {
    const date = '2026-04-10';
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
      payload: { workerId: workerOnSiteA, date },
    });

    const [r1, r2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/chat/apply',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          chatMessageId: randomUUID(),
          toolName: 'propose_mark_absent',
          toolInput: { workerId: workerOnSiteA, date },
          decisionId,
        },
      }),
      app.inject({
        method: 'POST',
        url: '/chat/apply',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          chatMessageId: randomUUID(),
          toolName: 'propose_mark_absent',
          toolInput: { workerId: workerOnSiteA, date },
          decisionId,
        },
      }),
    ]);

    const codes = [r1.statusCode, r2.statusCode].sort();
    // Acceptable outcomes:
    //   - one 200, one 409 (lifecycle race; one apply won)
    //   - one 200, one 409 with domain-side idempotency on Attendance
    //   - one 200, one 4xx if the second one hit the domain's own
    //     unique-constraint guard before its lifecycle attempt
    // The load-bearing assertion: exactly one 200, AND the row is APPLIED.
    expect(codes.filter((c) => c === 200).length).toBe(1);
    expect(codes.filter((c) => c >= 400).length).toBe(1);

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).not.toBeNull();
    expect(row!.dismissedAt).toBeNull();

    const applieds = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    expect(applieds.length).toBe(1);
  });

  it('apply vs dismiss through HTTP routes: exactly one wins, audit matches winner only', async () => {
    const date = '2026-04-11';
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
      payload: { workerId: workerOnSiteA, date },
    });

    const [applyRes, dismissRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/chat/apply',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          chatMessageId: randomUUID(),
          toolName: 'propose_mark_absent',
          toolInput: { workerId: workerOnSiteA, date },
          decisionId,
        },
      }),
      app.inject({
        method: 'POST',
        url: `/decisions/${decisionId}/dismiss`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { reason: 'concurrent dismiss' },
      }),
    ]);

    // Exactly one 200, one 4xx.
    const successes = [applyRes, dismissRes].filter(
      (r) => r.statusCode >= 200 && r.statusCode < 300,
    );
    const failures = [applyRes, dismissRes].filter((r) => r.statusCode >= 400);
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // DB row in exactly one terminal state. CHECK constraint enforces this
    // independently of the app.
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    const isApplied = row!.appliedAt !== null;
    const isDismissed = row!.dismissedAt !== null;
    expect(isApplied !== isDismissed).toBe(true);

    // Audit ONLY reflects the winner.
    const applieds = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    const dismisseds = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'DWI_DISMISSED', targetId: decisionId },
    });
    if (isApplied) {
      expect(applieds.length).toBe(1);
      expect(dismisseds.length).toBe(0);
    } else {
      expect(applieds.length).toBe(0);
      expect(dismisseds.length).toBe(1);
    }
  });

  it('R2a verification: stale authority between preCheck and commit → commitApply throws NOT_RESPONSIBLE, row stays PROPOSED', async () => {
    // This test exercises R2a directly at the writer level. Round-2 F-002.10
    // added the isCallerAuthorized re-check inside commitApply. The flow:
    //   1. Seed PROPOSED with userA as origin; siteA is bound to userA.
    //   2. preCheckApply → succeeds (userA is responsible).
    //   3. Add an ACTING binding userB → covering userA → effective NOW.
    //   4. commitApply (with the stale preCheck) → re-checks auth → userA is
    //      no longer responsible (userB is acting) → throws NOT_RESPONSIBLE.
    //   5. Row stays PROPOSED. No DWI_APPLIED audit.
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
      payload: { workerId: workerOnSiteA, date: '2026-04-12' },
    });

    // Step 1+2: preCheck succeeds (userA still responsible).
    const preCheck = await withTenantContext(prisma, companyId, async (tx) =>
      preCheckApply(tx, {
        companyId,
        decisionId,
        actorUserId: userA,
      }),
    );
    expect(preCheck.decisionId).toBe(decisionId);

    // Step 3: simulate the binding change (acting cover takes over).
    const actingBinding = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId: siteA,
        userId: userB,
        actingForUserId: userA,
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reason: 'Acting cover (race test)',
        createdBy: userA,
      },
    });

    try {
      // Step 4: commitApply with the stale preCheck. R2a re-checks auth →
      // userA is no longer the effective responsible → throws.
      try {
        await withTenantContext(prisma, companyId, async (tx) =>
          commitApply(tx, {
            companyId,
            decisionId,
            actorUserId: userA,
            preCheck,
          }),
        );
        throw new Error('commitApply should have thrown NOT_RESPONSIBLE');
      } catch (err) {
        expect(err).toBeInstanceOf(LifecycleError);
        expect((err as LifecycleError).code).toBe('NOT_RESPONSIBLE');
      }

      // Step 5: row stays PROPOSED. No DWI_APPLIED audit emitted.
      const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
      expect(row!.appliedAt).toBeNull();
      expect(row!.dismissedAt).toBeNull();

      const audits = await prisma.auditEvent.findMany({
        where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
      });
      expect(audits.length).toBe(0);
    } finally {
      // Clean up the acting binding so it doesn't affect later tests.
      await prisma.siteSupervisorBinding.update({
        where: { id: actingBinding.id },
        data: { effectiveUntil: new Date(Date.now() - 60_000) },
      });
    }
  });

  it('G1 verification: termination apply against a TERMINATION_PENDING worker → 409, row stays PROPOSED', async () => {
    // Seed a worker that's already in TERMINATION_PENDING state.
    const alreadyTerminating = await prisma.worker.create({
      data: {
        companyId,
        name: 'AlreadyTerminating',
        state: 'TERMINATION_PENDING',
        phone: '+919999' + String(Date.now() + 2710).slice(-7),
      },
    });
    const decisionId = await seedProposed({
      kind: 'TERMINATE_WORKER',
      tier: 'EMPLOYMENT',
      supervisorId: userA,
      targetId: alreadyTerminating.id,
      payload: { workerId: alreadyTerminating.id, effectiveDate: '2026-06-01', reason: 'perf' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_termination',
        toolInput: { workerId: alreadyTerminating.id, effectiveDate: '2026-06-01', reason: 'perf' },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('ALREADY_TERMINATING');

    // Row stays PROPOSED. No DWI_APPLIED audit. No worker.update.
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();
    expect(row!.dismissedAt).toBeNull();

    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    expect(audits.length).toBe(0);

    // Worker state unchanged.
    const w = await prisma.worker.findUnique({ where: { id: alreadyTerminating.id } });
    expect(w!.state).toBe('TERMINATION_PENDING');
  });
});
