/**
 * Real-DB integration test: SiteSupervisorBinding permanent-reassignment basics.
 *
 * P1.5. Covers the service helper `reassignPermanentBinding`:
 *   1. Ends the prior permanent row (sets endedAt = new row's effectiveFrom
 *      and a fixed endedReason) and creates the new permanent row atomically.
 *   2. Emits both BINDING_ENDED_SUPERSEDED_BY_PERMANENT (on old) and
 *      BINDING_CREATED (on new) audit events in the same transaction.
 *   3. Final state: exactly one active (endedAt IS NULL) permanent binding per site.
 *   4. Throws when no prior active permanent binding exists for the site
 *      (use the raw create path for the first-ever binding).
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

    const handoffAt = new Date();

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

    // Old row: endedAt set to handoffAt, endedReason set
    const oldRow = await prisma.siteSupervisorBinding.findUnique({ where: { id: firstId } });
    expect(oldRow!.endedAt).not.toBeNull();
    expect(oldRow!.endedAt!.getTime()).toBe(handoffAt.getTime());
    expect(oldRow!.endedReason).toBe('Superseded by permanent reassignment');

    // New row: active, userId = B
    const newRow = await prisma.siteSupervisorBinding.findUnique({
      where: { id: result.newBindingId },
    });
    expect(newRow!.userId).toBe(userB);
    expect(newRow!.actingForUserId).toBeNull();
    expect(newRow!.endedAt).toBeNull();

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

    const createdEvents = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_CREATED', targetId: result.newBindingId },
    });
    expect(createdEvents).toHaveLength(1);
    const createdPayload = createdEvents[0].payload as Record<string, unknown>;
    expect(createdPayload.kind).toBe('PERMANENT');
    expect(createdPayload.userId).toBe(userB);
  });

  it('final state has exactly one active permanent binding per site', async () => {
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

    await withTenantContext(prisma, companyId, async (tx) => {
      await reassignPermanentBinding(tx, {
        companyId,
        siteId: site.id,
        newUserId: userB,
        effectiveFrom: new Date(),
        effectiveUntil: null,
        reason: 'Reassign',
        reassignedBy: hrUserId,
      });
    });

    const activePermanent = await prisma.siteSupervisorBinding.findMany({
      where: {
        companyId,
        siteId: site.id,
        actingForUserId: null,
        endedAt: null,
      },
    });
    expect(activePermanent).toHaveLength(1);
    expect(activePermanent[0].userId).toBe(userB);
  });

  it('throws when no prior active permanent binding exists for the site', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'Reassign-Empty' } });

    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await reassignPermanentBinding(tx, {
          companyId,
          siteId: site.id,
          newUserId: userA,
          effectiveFrom: new Date(),
          effectiveUntil: null,
          reason: 'Should fail — no prior',
          reassignedBy: hrUserId,
        });
      }),
    ).rejects.toThrow(/no active permanent binding/i);
  });
});
