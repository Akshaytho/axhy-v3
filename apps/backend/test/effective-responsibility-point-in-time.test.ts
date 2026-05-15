/**
 * Real-DB integration test: point-in-time semantics of getEffectiveBinding.
 *
 * Stresses the `at` parameter across composed binding lifecycles. Three
 * timeline shapes that the other 3 test files in this slice don't exercise:
 *
 *   1. Acting overlap inside a permanent baseline — same `at` parameter walked
 *      forward/backward through the acting window verifies that precedence is
 *      time-aware (not just "is there an acting row anywhere").
 *
 *   2. Sequential permanent reassignments — three bounded permanent windows
 *      stacked back-to-back, each with `effectiveUntil` set to the next one's
 *      `effectiveFrom`. Read-time-routing must return the correct row at any
 *      instant across the timeline without inline predicate drift.
 *
 *   3. Acting active while the permanent baseline gets reassigned mid-window
 *      (permanent A → permanent C cutover happens while acting B is still
 *      effective). At cutover, the acting binding stays the winner regardless
 *      of which permanent is alive; after acting ends, the new permanent C
 *      becomes the answer. This is the case the spec leaves implicit and the
 *      one most likely to surface a drift bug.
 *
 * @derives(supervisor-responsibility-model §5.8 — precedence at a point in time)
 * @derives(supervisor-responsibility-model §5.4 — supersession via effectiveUntil)
 * @derives(panel-2026-05-15) — Layer 1 routing slice (4th test file)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { getEffectiveBinding } from '../src/lib/effective-responsibility.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `eff-resp-pit-${Date.now()}-`;

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
      ownerPhone: '+919999900801',
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

  userA = await mk('User A', 1800);
  userB = await mk('User B', 1801);
  userC = await mk('User C', 1802);
  hrUserId = await mk('HR', 1803);
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

async function freshSite(name: string): Promise<string> {
  const s = await prisma.site.create({ data: { companyId, name } });
  return s.id;
}

describe('getEffectiveBinding — point-in-time semantics', () => {
  it('walks an acting overlap inside a permanent baseline (precedence at three instants)', async () => {
    const siteId = await freshSite('PIT-Acting-Overlap');

    const now = Date.now();
    const permFrom = new Date(now - 30 * 24 * 60 * 60 * 1000); // T-30d
    const actingFrom = new Date(now - 7 * 24 * 60 * 60 * 1000); // T-7d
    const actingUntil = new Date(now + 7 * 24 * 60 * 60 * 1000); // T+7d

    // Baseline permanent: open-ended from T-30d.
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: permFrom,
        effectiveUntil: null,
        reason: 'Baseline permanent',
        createdBy: hrUserId,
      },
    });

    // Acting B for A: bounded window T-7d → T+7d.
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: userA,
        effectiveFrom: actingFrom,
        effectiveUntil: actingUntil,
        reason: 'Acting cover',
        createdBy: hrUserId,
      },
    });

    // Before acting started → permanent A.
    const before = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now - 15 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(before).not.toBeNull();
    expect(before!.kind).toBe('PERMANENT');
    expect(before!.userId).toBe(userA);

    // During acting window → acting B (precedence).
    const during = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now - 2 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(during).not.toBeNull();
    expect(during!.kind).toBe('ACTING');
    expect(during!.userId).toBe(userB);
    expect(during!.actingForUserId).toBe(userA);

    // After acting ends (no manual end; just past effectiveUntil) → permanent A again.
    const after = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now + 10 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(after).not.toBeNull();
    expect(after!.kind).toBe('PERMANENT');
    expect(after!.userId).toBe(userA);
  });

  it('routes correctly across three sequential permanent reassignments', async () => {
    const siteId = await freshSite('PIT-Sequential-Perms');

    const now = Date.now();
    const aFrom = new Date(now - 90 * 24 * 60 * 60 * 1000);
    const aUntil = new Date(now - 30 * 24 * 60 * 60 * 1000); // A ends, B begins
    const bUntil = new Date(now + 30 * 24 * 60 * 60 * 1000); // B ends, C begins
    // C is open-ended.

    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: aFrom,
        effectiveUntil: aUntil,
        reason: 'Original permanent A',
        createdBy: hrUserId,
      },
    });
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: null,
        effectiveFrom: aUntil, // contiguous handoff
        effectiveUntil: bUntil,
        reason: 'Permanent B (Q1 reassignment)',
        createdBy: hrUserId,
      },
    });
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userC,
        actingForUserId: null,
        effectiveFrom: bUntil, // contiguous handoff
        effectiveUntil: null,
        reason: 'Permanent C (Q2 reassignment)',
        createdBy: hrUserId,
      },
    });

    // Deep in A's window → A.
    const inA = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now - 60 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(inA).not.toBeNull();
    expect(inA!.userId).toBe(userA);

    // Inside B's window (current "now-ish") → B.
    const inB = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now - 15 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(inB).not.toBeNull();
    expect(inB!.userId).toBe(userB);

    // Future inside C's window → C.
    const inC = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now + 45 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(inC).not.toBeNull();
    expect(inC!.userId).toBe(userC);

    // Before A even started → null.
    const before = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now - 120 * 24 * 60 * 60 * 1000),
      }),
    );
    expect(before).toBeNull();
  });

  it('keeps acting as the winner across a mid-window permanent reassignment, then yields to the new permanent after acting ends', async () => {
    const siteId = await freshSite('PIT-Acting-Through-Perm-Switch');

    const now = Date.now();
    const oldPermFrom = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const actingFrom = new Date(now - 5 * 24 * 60 * 60 * 1000);
    const actingUntil = new Date(now + 10 * 24 * 60 * 60 * 1000);
    const permCutover = new Date(now + 2 * 24 * 60 * 60 * 1000); // happens DURING acting

    // Old permanent A — initially open-ended.
    const oldPerm = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: oldPermFrom,
        effectiveUntil: null,
        reason: 'Old permanent A',
        createdBy: hrUserId,
      },
    });

    // Acting B for A — runs T-5d to T+10d (straddles the upcoming cutover).
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: userA,
        effectiveFrom: actingFrom,
        effectiveUntil: actingUntil,
        reason: 'Acting cover during sick leave',
        createdBy: hrUserId,
      },
    });

    // Bound the old permanent so the cutover lands cleanly.
    await prisma.siteSupervisorBinding.update({
      where: { id: oldPerm.id },
      data: { effectiveUntil: permCutover },
    });

    // New permanent C — takes over from cutover, open-ended.
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userC,
        actingForUserId: null,
        effectiveFrom: permCutover,
        effectiveUntil: null,
        reason: 'New permanent C (rebalance)',
        createdBy: hrUserId,
      },
    });

    // Before cutover, during acting → acting B wins (precedence) over old perm A.
    const beforeCutover = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now + 24 * 60 * 60 * 1000), // T+1d (after acting started, before cutover)
      }),
    );
    expect(beforeCutover).not.toBeNull();
    expect(beforeCutover!.kind).toBe('ACTING');
    expect(beforeCutover!.userId).toBe(userB);
    expect(beforeCutover!.actingForUserId).toBe(userA);

    // After cutover, still during acting → acting B STILL wins; underlying perm is now C.
    // This is the load-bearing assertion: the acting binding's actingForUserId field is
    // historical metadata; routing decisions follow the predicate, not the actingForUserId.
    const afterCutoverDuringActing = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now + 3 * 24 * 60 * 60 * 1000), // T+3d (post-cutover, still in acting window)
      }),
    );
    expect(afterCutoverDuringActing).not.toBeNull();
    expect(afterCutoverDuringActing!.kind).toBe('ACTING');
    expect(afterCutoverDuringActing!.userId).toBe(userB);

    // After acting ends → new permanent C is the answer.
    const afterActing = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId,
        at: new Date(now + 12 * 24 * 60 * 60 * 1000), // T+12d (past acting effectiveUntil)
      }),
    );
    expect(afterActing).not.toBeNull();
    expect(afterActing!.kind).toBe('PERMANENT');
    expect(afterActing!.userId).toBe(userC);
  });
});
