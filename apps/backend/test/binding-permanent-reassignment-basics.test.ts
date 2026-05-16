/**
 * Real-DB integration test: SiteSupervisorBinding permanent-reassignment basics.
 *
 * P1.5. Covers the service helper `reassignPermanentBinding`. Supersession is
 * modelled via `effectiveUntil` (planned end), NOT via `endedAt` — endedAt is
 * reserved for manual early termination / correction. The old row stays
 * "active" (endedAt IS NULL) until the cutover instant, supporting future-
 * dated handoffs.
 *
 *   1. Cutover-now reassignment: ends old row's planned period at cutover and
 *      creates new row at cutover; both audit events emitted atomically.
 *   2. Final state at-the-cutover-moment: exactly one currently-effective
 *      permanent binding per site (computed against now + the effective window,
 *      not just endedAt IS NULL).
 *   3. Throws when no permanent binding is effective at the requested cutover.
 *   4. Future-dated reassignment: BEFORE the cutover instant, the old row
 *      remains the effective active permanent binding; AFTER cutover, the
 *      new row takes over.
 *
 * @derives(supervisor-responsibility-model §5.8 + §7)
 * @derives(workflow-design-closure §9)
 * @derives(panel-2026-05-15) — P1.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { reassignPermanentBinding } from '../src/lib/site-supervisor-binding.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `bind-reassign-${Date.now()}-`;

let companyId: string;
let userA: string;
let userB: string;
let hrUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999840001',
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

  userA = await mk('User A', 1000);
  userB = await mk('User B', 1001);
  hrUserId = await mk('HR', 1002);
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('SiteSupervisorBinding — permanent reassignment', () => {
  it('reassigns a permanent binding: ends old + creates new + emits both audit events', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'Reassign-1' } });

    // First permanent binding to user A
    const firstId = await withTenantContext(prisma, companyId, async (tx) => {
      const b = await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site.id,
          userId: userA,
          actingForUserId: null,
          effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // -30d
          effectiveUntil: null,
          reason: 'Initial portfolio assignment',
          createdBy: hrUserId,
        },
      });
      return b.id;
    });

    // S-001 same-day-freeze: cutover must be tomorrow-or-later in tenant tz.
    // +36h is safely past tomorrow IST midnight regardless of when the test runs.
    const handoffAt = new Date(Date.now() + 36 * 60 * 60 * 1000);

    // Reassign to user B
    const result = await withTenantContext(prisma, companyId, async (tx) => {
      return reassignPermanentBinding(tx, {
        companyId,
        siteId: site.id,
        newUserId: userB,
        effectiveFrom: handoffAt,
        effectiveUntil: null,
        reason: 'Q3 portfolio rebalance',
        reassignedBy: hrUserId,
      });
    });

    expect(result.endedBindingId).toBe(firstId);
    expect(result.newBindingId).not.toBe(firstId);

    // Old row: effectiveUntil = cutover; endedAt + endedReason remain NULL
    // (endedAt is reserved for manual early termination / correction).
    const oldRow = await prisma.siteSupervisorBinding.findUnique({ where: { id: firstId } });
    expect(oldRow!.effectiveUntil).not.toBeNull();
    expect(oldRow!.effectiveUntil!.getTime()).toBe(handoffAt.getTime());
    expect(oldRow!.endedAt).toBeNull();
    expect(oldRow!.endedReason).toBeNull();

    // New row: effectiveFrom = cutover, open-ended, userId = B
    const newRow = await prisma.siteSupervisorBinding.findUnique({
      where: { id: result.newBindingId },
    });
    expect(newRow!.userId).toBe(userB);
    expect(newRow!.actingForUserId).toBeNull();
    expect(newRow!.endedAt).toBeNull();
    expect(newRow!.effectiveFrom.getTime()).toBe(handoffAt.getTime());
    expect(newRow!.effectiveUntil).toBeNull();

    // Two audit events emitted
    const supersededEvents = await prisma.auditEvent.findMany({
      where: {
        companyId,
        kind: 'BINDING_ENDED_SUPERSEDED_BY_PERMANENT',
        targetId: firstId,
      },
    });
    expect(supersededEvents).toHaveLength(1);
    const supersededPayload = supersededEvents[0].payload as Record<string, unknown>;
    expect(supersededPayload.previousUserId).toBe(userA);
    expect(supersededPayload.newUserId).toBe(userB);
    expect(supersededPayload.newBindingId).toBe(result.newBindingId);
    expect(supersededPayload.supersededAt).toBe(handoffAt.toISOString());

    const createdEvents = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_CREATED', targetId: result.newBindingId },
    });
    expect(createdEvents).toHaveLength(1);
    const createdPayload = createdEvents[0].payload as Record<string, unknown>;
    expect(createdPayload.kind).toBe('PERMANENT');
    expect(createdPayload.userId).toBe(userB);
  });

  it('after a tomorrow-effective reassignment, exactly one permanent binding is effective at the post-cutover moment', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'Reassign-2' } });

    await withTenantContext(prisma, companyId, async (tx) => {
      await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site.id,
          userId: userA,
          actingForUserId: null,
          effectiveFrom: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          effectiveUntil: null,
          reason: 'Initial',
          createdBy: hrUserId,
        },
      });
    });

    // S-001 same-day-freeze: cutover must be tomorrow-or-later. +36h is safely
    // past tomorrow IST midnight regardless of when the test runs.
    const cutover = new Date(Date.now() + 36 * 60 * 60 * 1000);

    await withTenantContext(prisma, companyId, async (tx) => {
      await reassignPermanentBinding(tx, {
        companyId,
        siteId: site.id,
        newUserId: userB,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'Reassign',
        reassignedBy: hrUserId,
      });
    });

    // "Currently effective at instant X" = endedAt IS NULL AND effectiveFrom <= X
    // AND (effectiveUntil IS NULL OR effectiveUntil > X). At a post-cutover
    // instant the new row owns the site; userA's row is no longer effective.
    const afterCutover = new Date(cutover.getTime() + 60_000);
    const currentlyEffective = await prisma.siteSupervisorBinding.findMany({
      where: {
        companyId,
        siteId: site.id,
        actingForUserId: null,
        endedAt: null,
        effectiveFrom: { lte: afterCutover },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: afterCutover } }],
      },
    });
    expect(currentlyEffective).toHaveLength(1);
    expect(currentlyEffective[0].userId).toBe(userB);
  });

  it('throws when no permanent binding is effective at the requested cutover', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'Reassign-Empty' } });

    // S-001 same-day-freeze: cutover must be tomorrow-or-later. Use +36h so
    // the freeze check passes and the prior-find runs (which is the throw
    // path this test is verifying).
    const cutover = new Date(Date.now() + 36 * 60 * 60 * 1000);

    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await reassignPermanentBinding(tx, {
          companyId,
          siteId: site.id,
          newUserId: userA,
          effectiveFrom: cutover,
          effectiveUntil: null,
          reason: 'Should fail — no prior',
          reassignedBy: hrUserId,
        });
      }),
    ).rejects.toThrow(/no permanent binding is effective/i);
  });

  it('future-dated reassignment leaves the old row currently-effective until cutover', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'Reassign-Future' } });
    const cutover = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days

    // Initial permanent binding to user A, open-ended, started 10 days ago.
    const oldId = await withTenantContext(prisma, companyId, async (tx) => {
      const b = await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site.id,
          userId: userA,
          actingForUserId: null,
          effectiveFrom: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          effectiveUntil: null,
          reason: 'Initial portfolio assignment',
          createdBy: hrUserId,
        },
      });
      return b.id;
    });

    // Schedule a future-dated reassignment to user B at the cutover instant.
    const result = await withTenantContext(prisma, companyId, async (tx) => {
      return reassignPermanentBinding(tx, {
        companyId,
        siteId: site.id,
        newUserId: userB,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'Scheduled handoff in 7 days',
        reassignedBy: hrUserId,
      });
    });

    // BEFORE cutover (i.e., right now): old row is still the currently
    // effective permanent binding.
    const now = new Date();
    const effectiveNow = await prisma.siteSupervisorBinding.findMany({
      where: {
        companyId,
        siteId: site.id,
        actingForUserId: null,
        endedAt: null,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
      },
    });
    expect(effectiveNow).toHaveLength(1);
    expect(effectiveNow[0].id).toBe(oldId);
    expect(effectiveNow[0].userId).toBe(userA);

    // Old row's endedAt is still NULL — supersession used effectiveUntil,
    // not endedAt. effectiveUntil is bounded at the cutover instant.
    const oldRow = await prisma.siteSupervisorBinding.findUnique({ where: { id: oldId } });
    expect(oldRow!.endedAt).toBeNull();
    expect(oldRow!.endedReason).toBeNull();
    expect(oldRow!.effectiveUntil).not.toBeNull();
    expect(oldRow!.effectiveUntil!.getTime()).toBe(cutover.getTime());

    // New row exists but is not yet effective (effectiveFrom is in the future).
    const newRow = await prisma.siteSupervisorBinding.findUnique({
      where: { id: result.newBindingId },
    });
    expect(newRow!.effectiveFrom.getTime()).toBe(cutover.getTime());
    expect(newRow!.endedAt).toBeNull();
    expect(newRow!.effectiveFrom.getTime()).toBeGreaterThan(Date.now());

    // AFTER cutover (simulated by querying with future "now"): new row takes over.
    const future = new Date(cutover.getTime() + 60_000); // 1 min past cutover
    const effectiveAfter = await prisma.siteSupervisorBinding.findMany({
      where: {
        companyId,
        siteId: site.id,
        actingForUserId: null,
        endedAt: null,
        effectiveFrom: { lte: future },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: future } }],
      },
    });
    expect(effectiveAfter).toHaveLength(1);
    expect(effectiveAfter[0].id).toBe(result.newBindingId);
    expect(effectiveAfter[0].userId).toBe(userB);

    // Both audit events emitted at scheduling time (not at cutover time).
    const supersededEvents = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_SUPERSEDED_BY_PERMANENT', targetId: oldId },
    });
    expect(supersededEvents).toHaveLength(1);
    const payload = supersededEvents[0].payload as Record<string, unknown>;
    expect(payload.supersededAt).toBe(cutover.toISOString());
  });
});
