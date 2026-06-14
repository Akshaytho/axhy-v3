/**
 * Real-DB integration test: new SupervisorDecision kinds route via current
 * responsible supervisor after a binding change.
 *
 * F-002.6 + F-002.7. Pre-remediation, SWAP_WORKER / TERMINATE_WORKER /
 * CREATE_ASSIGNMENT had writer mappings but were NOT in the read-side kind
 * sets — they silently fell back to origin-supervisor routing. After binding
 * changes (acting cover, permanent reassignment), the row routed to the wrong
 * person. F-002.1's unified registry fixed this.
 *
 * Each case:
 *   1. Seed PROPOSED row with originator userA (= site's permanent supervisor
 *      at propose-time).
 *   2. Apply an ACTING binding to siteA, covering userA → userB.
 *   3. userA tries to apply → must get 403 NOT_RESPONSIBLE (the binding moved).
 *   4. userB applies → succeeds.
 *
 * Covers each of the three kinds that were silently falling back pre-F-002.6.
 *
 * @derives(F-002.6 — read-side registry wiring)
 * @derives(F-002.7 — friend's required addition 3 verification)
 * @derives(production-grade-rulebook P5 — new kinds wire all 4 layers)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { applyProposedDecision, LifecycleError } from '../src/lib/supervisor-decision-writer.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-newkinds-${Date.now()}-`;

let companyId: string;
let userA: string; // permanent supervisor at propose-time
let userB: string; // acting cover at apply-time
let worker: string;
let site: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999926001',
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

  userA = await mk('A', 2600);
  userB = await mk('B', 2601);

  const w = await prisma.worker.create({
    data: {
      companyId,
      name: 'W',
      phone: '+919999' + String(Date.now() + 2602).slice(-7),
    },
  });
  worker = w.id;

  const s = await prisma.site.create({ data: { companyId, name: 'site' } });
  site = s.id;

  // userA is the permanent supervisor at propose-time.
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
});

afterAll(async () => {
  await deleteCompanyDeep(prisma, { slugPrefix: TEST_PREFIX });
  await prisma.$disconnect();
});

async function seedProposed(args: {
  kind: 'CREATE_ASSIGNMENT' | 'TERMINATE_WORKER' | 'SWAP_WORKER';
  tier: string;
  targetId: string;
}): Promise<string> {
  const decisionId = randomUUID();
  await prisma.supervisorDecision.create({
    data: {
      id: decisionId,
      companyId,
      supervisorId: userA,
      kind: args.kind,
      tier: args.tier,
      targetId: args.targetId,
      payload: {},
    },
  });
  return decisionId;
}

async function applyActingBindingBToA(): Promise<string> {
  const b = await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: site,
      userId: userB,
      actingForUserId: userA,
      effectiveFrom: new Date(Date.now() - 60_000),
      effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reason: 'Acting cover',
      createdBy: userA,
    },
  });
  return b.id;
}

async function endActingBinding(bindingId: string): Promise<void> {
  // End by setting effectiveUntil in the past so the effective predicate no
  // longer matches at "now".
  await prisma.siteSupervisorBinding.update({
    where: { id: bindingId },
    data: { effectiveUntil: new Date(Date.now() - 60_000) },
  });
}

describe('New kinds route via currently responsible supervisor after binding change — F-002.6', () => {
  for (const { kind, tier, targetIdRef } of [
    { kind: 'CREATE_ASSIGNMENT' as const, tier: 'OPERATIONAL', targetIdRef: 'worker' as const },
    { kind: 'TERMINATE_WORKER' as const, tier: 'EMPLOYMENT', targetIdRef: 'worker' as const },
    { kind: 'SWAP_WORKER' as const, tier: 'OPERATIONAL', targetIdRef: 'site' as const },
  ]) {
    it(`${kind}: after acting cover, userA cannot apply (was responsible at propose-time); userB can`, async () => {
      const targetId = targetIdRef === 'worker' ? worker : site;
      const decisionId = await seedProposed({ kind, tier, targetId });
      const bindingId = await applyActingBindingBToA();
      try {
        // userA was the responsible supervisor at propose-time but acting
        // cover moved responsibility to userB. userA must now be rejected.
        try {
          await withTenantContext(prisma, companyId, async (tx) =>
            applyProposedDecision(tx, {
              companyId,
              decisionId,
              actorUserId: userA,
            }),
          );
          throw new Error('userA should not have been authorized after acting cover');
        } catch (err) {
          expect(err).toBeInstanceOf(LifecycleError);
          expect((err as LifecycleError).code).toBe('NOT_RESPONSIBLE');
        }

        // Row stays PROPOSED — userA's attempt didn't transition.
        const stillProposed = await prisma.supervisorDecision.findUnique({
          where: { id: decisionId },
        });
        expect(stillProposed!.appliedAt).toBeNull();
        expect(stillProposed!.dismissedAt).toBeNull();

        // userB IS currently responsible (acting). Apply succeeds.
        await withTenantContext(prisma, companyId, async (tx) =>
          applyProposedDecision(tx, {
            companyId,
            decisionId,
            actorUserId: userB,
          }),
        );

        const applied = await prisma.supervisorDecision.findUnique({
          where: { id: decisionId },
        });
        expect(applied!.appliedAt).not.toBeNull();

        // Audit records userB as appliedBy + userA as originalSupervisorId.
        const audit = await prisma.auditEvent.findFirst({
          where: { companyId, kind: 'DWI_APPLIED', targetId: decisionId },
        });
        expect(audit).not.toBeNull();
        const payload = audit!.payload as Record<string, unknown>;
        expect(payload.appliedBy).toBe(userB);
        expect(payload.originalSupervisorId).toBe(userA);
      } finally {
        // Clean up the acting binding so subsequent test iterations start
        // from the same baseline (userA is the only effective supervisor).
        await endActingBinding(bindingId);
      }
    });
  }
});
