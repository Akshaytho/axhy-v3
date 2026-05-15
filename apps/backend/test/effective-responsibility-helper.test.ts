/**
 * Real-DB integration test: getEffectiveBinding + deriveWorkerPrimarySiteId.
 *
 * Layer 1 routing slice. Verifies the central read-time-routing helpers
 * directly (route-level coverage comes in the route tests). All tests go
 * through the helpers — no inline re-forming of the active-binding predicate
 * or the worker→primary-site fallback chain (the anti-drift discipline).
 *
 * @derives(supervisor-responsibility-model §5.8 + §5.9)
 * @derives(panel-2026-05-15) — Layer 1 routing slice
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import {
  getEffectiveBinding,
  getEffectiveResponsibleUserId,
  deriveWorkerPrimarySiteId,
} from '../src/lib/effective-responsibility.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `eff-resp-${Date.now()}-`;

let companyId: string;
let userA: string;
let userB: string;
let userC: string;
let hrUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999900001',
      ownerName: 'Owner',
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

  userA = await mk('User A', 1100);
  userB = await mk('User B', 1101);
  userC = await mk('User C', 1102);
  hrUserId = await mk('HR', 1103);
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

async function freshSite(name: string): Promise<string> {
  const s = await prisma.site.create({ data: { companyId, name } });
  return s.id;
}

describe('getEffectiveBinding', () => {
  it('returns the permanent binding when no acting overlap exists', async () => {
    const siteId = await freshSite('Helper-Perm-Only');
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        effectiveUntil: null,
        reason: 'Permanent only',
        createdBy: hrUserId,
      },
    });

    const result = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, { companyId, siteId }),
    );
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('PERMANENT');
    expect(result!.userId).toBe(userA);
    expect(result!.actingForUserId).toBeNull();
  });

  it('applies acting-over-permanent precedence (§5.8 — acting wins)', async () => {
    const siteId = await freshSite('Helper-Acting-Override');
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        effectiveUntil: null,
        reason: 'Baseline permanent',
        createdBy: hrUserId,
      },
    });
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: userA,
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reason: 'Acting cover during sick leave',
        createdBy: hrUserId,
      },
    });

    const result = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, { companyId, siteId }),
    );
    expect(result!.kind).toBe('ACTING');
    expect(result!.userId).toBe(userB);
    expect(result!.actingForUserId).toBe(userA);
  });

  it('returns the new permanent at cutover+1min when a future-dated handoff was scheduled', async () => {
    const siteId = await freshSite('Helper-Future-Handoff');
    const cutover = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        effectiveUntil: cutover, // bounded — the scheduled handoff
        reason: 'Old permanent ending at cutover',
        createdBy: hrUserId,
      },
    });
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: null,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'New permanent starting at cutover',
        createdBy: hrUserId,
      },
    });

    // Now (before cutover): old binding wins
    const nowResult = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, { companyId, siteId, at: new Date() }),
    );
    expect(nowResult!.userId).toBe(userA);

    // Cutover + 1min: new binding wins
    const afterResult = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(cutover.getTime() + 60_000),
      }),
    );
    expect(afterResult!.userId).toBe(userB);
  });

  it('reverts to permanent baseline when acting window has ended manually (endedAt set)', async () => {
    const siteId = await freshSite('Helper-Acting-Ended');
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        effectiveUntil: null,
        reason: 'Permanent baseline',
        createdBy: hrUserId,
      },
    });
    const acting = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: userA,
        effectiveFrom: new Date(Date.now() - 2 * 60 * 60 * 1000),
        effectiveUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        reason: 'Acting cover',
        createdBy: hrUserId,
      },
    });
    // Manually end acting
    await prisma.siteSupervisorBinding.update({
      where: { id: acting.id },
      data: { endedAt: new Date(), endedReason: 'Returned early' },
    });

    const result = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, { companyId, siteId }),
    );
    expect(result!.kind).toBe('PERMANENT');
    expect(result!.userId).toBe(userA);
  });

  it('returns null when no binding is effective', async () => {
    const siteId = await freshSite('Helper-Empty');
    const result = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, { companyId, siteId }),
    );
    expect(result).toBeNull();

    const userIdOnly = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveResponsibleUserId(tx, { companyId, siteId }),
    );
    expect(userIdOnly).toBeNull();
  });
});

describe('deriveWorkerPrimarySiteId', () => {
  it('returns the siteId of the assignment effective at the requested instant', async () => {
    const siteEarly = await freshSite('Worker-PS-Early');
    const siteLate = await freshSite('Worker-PS-Late');

    const worker = await prisma.worker.create({
      data: { companyId, name: 'PS Worker', phone: '+919999' + String(Date.now() + 200).slice(-7) },
    });

    const today = new Date();
    const earlyFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const earlyUntil = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
    const lateFrom = new Date(today.getTime() - 9 * 24 * 60 * 60 * 1000);

    await prisma.assignment.create({
      data: {
        companyId,
        workerId: worker.id,
        siteId: siteEarly,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: earlyFrom,
        validUntil: earlyUntil,
        state: 'ACTIVE',
      },
    });
    await prisma.assignment.create({
      data: {
        companyId,
        workerId: worker.id,
        siteId: siteLate,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: lateFrom,
        validUntil: null,
        state: 'ACTIVE',
      },
    });

    // At "today" → late assignment is effective
    const nowSite = await withTenantContext(prisma, companyId, async (tx) =>
      deriveWorkerPrimarySiteId(tx, { companyId, workerId: worker.id }),
    );
    expect(nowSite).toBe(siteLate);

    // At a past moment in the early window → early assignment is effective
    const pastSite = await withTenantContext(prisma, companyId, async (tx) =>
      deriveWorkerPrimarySiteId(tx, {
        companyId,
        workerId: worker.id,
        at: new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(pastSite).toBe(siteEarly);
  });

  it('falls back to most-recent active assignment if no effective-at-T match', async () => {
    const site = await freshSite('Worker-PS-Fallback-Active');
    const worker = await prisma.worker.create({
      data: {
        companyId,
        name: 'PS Worker 2',
        phone: '+919999' + String(Date.now() + 201).slice(-7),
      },
    });

    // Assignment ending 10 days ago
    await prisma.assignment.create({
      data: {
        companyId,
        workerId: worker.id,
        siteId: site,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        validUntil: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        state: 'ACTIVE',
      },
    });

    // Query at "today": Tier 1 (effective-at-T) misses, Tier 2 returns the past ACTIVE.
    const result = await withTenantContext(prisma, companyId, async (tx) =>
      deriveWorkerPrimarySiteId(tx, { companyId, workerId: worker.id }),
    );
    expect(result).toBe(site);
  });

  it('returns null when the worker has no assignments at all', async () => {
    const worker = await prisma.worker.create({
      data: {
        companyId,
        name: 'Unplaced Worker',
        phone: '+919999' + String(Date.now() + 202).slice(-7),
      },
    });
    const result = await withTenantContext(prisma, companyId, async (tx) =>
      deriveWorkerPrimarySiteId(tx, { companyId, workerId: worker.id }),
    );
    expect(result).toBeNull();
  });
});
