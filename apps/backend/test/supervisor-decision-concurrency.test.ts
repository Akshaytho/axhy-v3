/**
 * Real-DB integration test: concurrent lifecycle transitions.
 *
 * F-002.7 — friend's required addition 1. Exercises the race-safety of the
 * conditional updateMany pattern in supervisor-decision-writer.ts (P2) AND
 * the DB CHECK constraint added in migration 20260518 (P1).
 *
 * Success conditions per friend's directive:
 *   - exactly one transition wins
 *   - the other returns 409
 *   - DB state stays valid (CHECK constraint never violated)
 *   - audit state matches the winner only
 *
 * Three cases:
 *   1. apply vs apply in parallel (same row, two callers) — one wins APPLIED,
 *      the other returns 409 ALREADY_APPLIED, only one DWI_APPLIED audit.
 *   2. apply vs dismiss in parallel — one wins APPLIED or DISMISSED depending
 *      on which UPDATE landed first; the other returns 409. Audit only
 *      contains the winner's lifecycle entry.
 *   3. DB CHECK constraint rejects the impossible (both-set) state if an
 *      app-layer guard is ever bypassed (we simulate this with a raw SQL
 *      UPDATE that tries to set both columns directly).
 *
 * @derives(F-002.7 — concurrency + DB invariant tests)
 * @derives(production-grade-rulebook P1 + P2 + P6)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import {
  applyProposedDecision,
  dismissProposedDecision,
  LifecycleError,
} from '../src/lib/supervisor-decision-writer.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-concurrency-${Date.now()}-`;

let companyId: string;
let userA: string;
let workerOnSiteA: string;
let siteA: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999925001',
      ownerName: 'O',
    },
  });
  companyId = co.id;

  const sup = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 1).slice(-7),
      name: 'A',
      locale: 'en',
      companyId,
    },
  });
  userA = sup.id;

  const w = await prisma.worker.create({
    data: {
      companyId,
      name: 'W',
      phone: '+919999' + String(Date.now() + 2).slice(-7),
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
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

async function seedProposed(): Promise<string> {
  const decisionId = randomUUID();
  await prisma.supervisorDecision.create({
    data: {
      id: decisionId,
      companyId,
      supervisorId: userA,
      kind: 'MARK_ABSENT',
      tier: 'OPERATIONAL',
      targetId: workerOnSiteA,
      payload: {},
    },
  });
  return decisionId;
}

describe('SupervisorDecision concurrent transitions — F-002.7', () => {
  it('apply vs apply: exactly one wins APPLIED, the other gets ALREADY_APPLIED', async () => {
    const decisionId = await seedProposed();

    // Fire both in parallel via Promise.allSettled.
    const [r1, r2] = await Promise.allSettled([
      withTenantContext(prisma, companyId, async (tx) =>
        applyProposedDecision(tx, {
          companyId,
          decisionId,
          actorUserId: userA,
        }),
      ),
      withTenantContext(prisma, companyId, async (tx) =>
        applyProposedDecision(tx, {
          companyId,
          decisionId,
          actorUserId: userA,
        }),
      ),
    ]);

    const winners = [r1, r2].filter((r) => r.status === 'fulfilled');
    const losers = [r1, r2].filter((r) => r.status === 'rejected');
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);

    const loserErr = (losers[0] as PromiseRejectedResult).reason;
    expect(loserErr).toBeInstanceOf(LifecycleError);
    expect((loserErr as LifecycleError).code).toBe('ALREADY_APPLIED');

    // Row is APPLIED + not DISMISSED.
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).not.toBeNull();
    expect(row!.dismissedAt).toBeNull();

    // Exactly one DWI_APPLIED audit emitted.
    const applieds = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    expect(applieds.length).toBe(1);
  });

  it('apply vs dismiss: exactly one wins, the other gets ALREADY_*, audit matches winner only', async () => {
    const decisionId = await seedProposed();

    const [r1, r2] = await Promise.allSettled([
      withTenantContext(prisma, companyId, async (tx) =>
        applyProposedDecision(tx, {
          companyId,
          decisionId,
          actorUserId: userA,
        }),
      ),
      withTenantContext(prisma, companyId, async (tx) =>
        dismissProposedDecision(tx, {
          companyId,
          decisionId,
          actorUserId: userA,
          reason: 'concurrent dismiss',
        }),
      ),
    ]);

    const winners = [r1, r2].filter((r) => r.status === 'fulfilled');
    const losers = [r1, r2].filter((r) => r.status === 'rejected');
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);

    const loserErr = (losers[0] as PromiseRejectedResult).reason;
    expect(loserErr).toBeInstanceOf(LifecycleError);
    // The loser sees whatever the winner set: if apply won, dismiss loses with
    // ALREADY_APPLIED; if dismiss won, apply loses with ALREADY_DISMISSED.
    expect(['ALREADY_APPLIED', 'ALREADY_DISMISSED']).toContain((loserErr as LifecycleError).code);

    // DB state: row is in exactly one terminal state. CHECK constraint
    // enforces this independently of the app.
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    const isApplied = row!.appliedAt !== null;
    const isDismissed = row!.dismissedAt !== null;
    expect(isApplied !== isDismissed).toBe(true); // exactly one
    expect(isApplied && isDismissed).toBe(false); // impossible state

    // Audit matches winner ONLY. If apply won, exactly one DWI_APPLIED and
    // zero DWI_DISMISSED. If dismiss won, vice versa.
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

  it('DB CHECK constraint rejects raw UPDATE that tries to set both appliedAt + dismissedAt', async () => {
    const decisionId = await seedProposed();

    // Direct raw SQL bypassing the app-layer writer — this is the
    // defence-in-depth case. The CHECK constraint from migration 20260518
    // must reject any UPDATE that would produce both-set state.
    await expect(
      prisma.$executeRaw`
        UPDATE "axhy"."SupervisorDecision"
        SET "appliedAt" = NOW(),
            "dismissedAt" = NOW(),
            "dismissedReason" = 'attempt impossible state'
        WHERE "id" = ${decisionId}::uuid
      `,
    ).rejects.toThrow(/SupervisorDecision_apply_dismiss_exclusive/);

    // Row should still be in PROPOSED state (raw UPDATE rejected, no partial
    // mutation since CHECK is per-statement).
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();
    expect(row!.dismissedAt).toBeNull();
  });

  it('CHECK constraint allows the normal terminal states (PROPOSED, APPLIED, DISMISSED separately)', async () => {
    // Sanity test: confirm the CHECK doesn't reject the valid states. If this
    // failed it would mean the CHECK predicate was inverted.
    const appliedRow = await seedProposed();
    await prisma.supervisorDecision.update({
      where: { id: appliedRow },
      data: { appliedAt: new Date() },
    });
    const a = await prisma.supervisorDecision.findUnique({ where: { id: appliedRow } });
    expect(a!.appliedAt).not.toBeNull();

    const dismissedRow = await seedProposed();
    await prisma.supervisorDecision.update({
      where: { id: dismissedRow },
      data: { dismissedAt: new Date(), dismissedReason: 'normal dismiss' },
    });
    const d = await prisma.supervisorDecision.findUnique({ where: { id: dismissedRow } });
    expect(d!.dismissedAt).not.toBeNull();
  });
});
