/**
 * Real-DB integration test: applyProposedDecision lifecycle transition.
 *
 * F-002 §3b apply test. Exercises the PROPOSED → APPLIED path through the
 * writer lib directly:
 *   - Happy path sets appliedAt + emits DWI_APPLIED.
 *   - All 5 LifecycleError codes (NOT_FOUND, CROSS_TENANT, ALREADY_APPLIED,
 *     ALREADY_DISMISSED, NOT_RESPONSIBLE).
 *   - Binding-routable kind authorizes the currently responsible supervisor.
 *   - Non-binding-routable kind authorizes the original supervisor.
 *
 * Route-level coverage (HTTP wiring) is in
 * supervisor-decision-apply-route.test.ts.
 *
 * @derives(F-002 scope §3b)
 * @derives(workflow-design-closure §3.2)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { applyProposedDecision, LifecycleError } from '../src/lib/supervisor-decision-writer.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-apply-${Date.now()}-`;

let companyAId: string;
let companyBId: string;
let userA: string; // permanent supervisor at siteA
let userB: string; // unrelated user (origin tests)
let userC: string; // cross-tenant
let workerOnSiteA: string;
let siteA: string;

beforeAll(async () => {
  const a = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+919999921001',
      ownerName: 'O',
    },
  });
  companyAId = a.id;
  const b = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'B',
      slug: TEST_PREFIX + 'b',
      ownerPhone: '+919999921002',
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

  userA = await mk('A', 2100, companyAId);
  userB = await mk('B', 2101, companyAId);
  userC = await mk('C', 2102, companyBId);

  const w = await prisma.worker.create({
    data: {
      companyId: companyAId,
      name: 'WA',
      phone: '+919999' + String(Date.now() + 2103).slice(-7),
    },
  });
  workerOnSiteA = w.id;

  const s = await prisma.site.create({ data: { companyId: companyAId, name: 'siteA' } });
  siteA = s.id;

  // userA is permanent supervisor at siteA.
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

  // Active assignment so deriveWorkerPrimarySiteId routes to siteA.
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
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
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

describe('applyProposedDecision — F-002 §3b', () => {
  it('happy path: PROPOSED → APPLIED sets appliedAt + emits DWI_APPLIED', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    const result = await withTenantContext(prisma, companyAId, async (tx) =>
      applyProposedDecision(tx, {
        companyId: companyAId,
        decisionId,
        actorUserId: userA,
      }),
    );
    expect(result.appliedAt).toBeInstanceOf(Date);
    expect(result.originalSupervisorId).toBe(userA);

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).not.toBeNull();
    expect(row!.dismissedAt).toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { companyId: companyAId, kind: 'DWI_APPLIED', targetId: decisionId },
    });
    expect(audit).not.toBeNull();
    const ap = audit!.payload as Record<string, unknown>;
    expect(ap.appliedBy).toBe(userA);
    expect(ap.originalSupervisorId).toBe(userA);
  });

  it('NOT_FOUND when decisionId does not exist', async () => {
    await expect(
      withTenantContext(prisma, companyAId, async (tx) =>
        applyProposedDecision(tx, {
          companyId: companyAId,
          decisionId: randomUUID(),
          actorUserId: userA,
        }),
      ),
    ).rejects.toThrow(LifecycleError);
  });

  it('CROSS_TENANT when decisionId belongs to another company', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userC,
      targetId: null,
      companyId: companyBId,
    });
    try {
      await withTenantContext(prisma, companyAId, async (tx) =>
        applyProposedDecision(tx, {
          companyId: companyAId,
          decisionId,
          actorUserId: userA,
        }),
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LifecycleError);
      expect((err as LifecycleError).code).toBe('CROSS_TENANT');
    }
  });

  it('ALREADY_APPLIED when row was previously applied', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    await withTenantContext(prisma, companyAId, async (tx) =>
      applyProposedDecision(tx, {
        companyId: companyAId,
        decisionId,
        actorUserId: userA,
      }),
    );
    try {
      await withTenantContext(prisma, companyAId, async (tx) =>
        applyProposedDecision(tx, {
          companyId: companyAId,
          decisionId,
          actorUserId: userA,
        }),
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LifecycleError);
      expect((err as LifecycleError).code).toBe('ALREADY_APPLIED');
    }
  });

  it('ALREADY_DISMISSED when row was previously dismissed', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    await prisma.supervisorDecision.update({
      where: { id: decisionId },
      data: { dismissedAt: new Date(), dismissedReason: 'test' },
    });
    try {
      await withTenantContext(prisma, companyAId, async (tx) =>
        applyProposedDecision(tx, {
          companyId: companyAId,
          decisionId,
          actorUserId: userA,
        }),
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LifecycleError);
      expect((err as LifecycleError).code).toBe('ALREADY_DISMISSED');
    }
  });

  it('NOT_RESPONSIBLE: userB cannot apply userA-routed MARK_ABSENT (binding routes to userA)', async () => {
    const decisionId = await seedProposed({
      kind: 'MARK_ABSENT',
      supervisorId: userA,
      targetId: workerOnSiteA,
    });
    try {
      await withTenantContext(prisma, companyAId, async (tx) =>
        applyProposedDecision(tx, {
          companyId: companyAId,
          decisionId,
          actorUserId: userB,
        }),
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LifecycleError);
      expect((err as LifecycleError).code).toBe('NOT_RESPONSIBLE');
    }
  });

  it('origin-supervisor fallback: NOTE-tier (LIVING_DOC_RULE) authorizes original supervisor regardless of binding', async () => {
    const decisionId = await seedProposed({
      kind: 'LIVING_DOC_RULE',
      tier: 'NOTE',
      supervisorId: userA,
      targetId: null,
    });
    // userA can apply (origin matches caller).
    await withTenantContext(prisma, companyAId, async (tx) =>
      applyProposedDecision(tx, {
        companyId: companyAId,
        decisionId,
        actorUserId: userA,
      }),
    );
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).not.toBeNull();
  });

  it('origin-supervisor fallback rejects non-origin user (LIVING_DOC_RULE seeded by userA, userB attempt rejected)', async () => {
    const decisionId = await seedProposed({
      kind: 'LIVING_DOC_RULE',
      tier: 'NOTE',
      supervisorId: userA,
      targetId: null,
    });
    try {
      await withTenantContext(prisma, companyAId, async (tx) =>
        applyProposedDecision(tx, {
          companyId: companyAId,
          decisionId,
          actorUserId: userB,
        }),
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LifecycleError);
      expect((err as LifecycleError).code).toBe('NOT_RESPONSIBLE');
    }
  });
});
