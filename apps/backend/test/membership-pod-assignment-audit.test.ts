/**
 * Real-DB integration test: Membership.podId + pod-assignment audit helpers.
 *
 * Layer 1 PR 2. Exercises the new Membership.podId column plus the two typed
 * audit-emit helpers:
 *   1. recordMembershipPodAssigned — first-time pod assignment, podId was null
 *   2. recordMembershipPodReassigned — pod change, fromPodId + toPodId both set
 *
 * Also verifies:
 *   - Membership.podId FK to HRPod
 *   - AuditEvent payload contents match what the helper accepted
 *   - Payload Zod boundary rejects malformed inputs
 *
 * @derives(workflow-design-closure §4 — HR pod model + Decision 1)
 * @derives(workflow-design-closure §9 — MEMBERSHIP_POD_ASSIGNED/REASSIGNED)
 * @derives(panel-2026-05-15) — Layer 1 PR 2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import {
  recordMembershipPodAssigned,
  recordMembershipPodReassigned,
} from '../src/lib/audit-event.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `pod-assign-${Date.now()}-`;

let companyId: string;
let actorUserId: string;
let podAId: string;
let podBId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999300001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const owner = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 200).slice(-7),
      name: 'Pod Owner',
      locale: 'en',
      companyId,
    },
  });
  actorUserId = owner.id;

  const podA = await prisma.hRPod.create({
    data: { companyId, name: 'PodA', primaryOwnerUserId: owner.id },
  });
  podAId = podA.id;
  const podB = await prisma.hRPod.create({
    data: { companyId, name: 'PodB', primaryOwnerUserId: owner.id },
  });
  podBId = podB.id;
});

afterAll(async () => {
  await deleteCompanyDeep(prisma, { slugPrefix: TEST_PREFIX });
  await prisma.$disconnect();
});

describe('Membership.podId + audit helpers', () => {
  it('assigns a pod to a previously-null Membership and emits MEMBERSHIP_POD_ASSIGNED', async () => {
    // Create HR member with no pod
    const user = await prisma.user.create({
      data: {
        phone: '+919999' + String(Date.now() + 201).slice(-7),
        name: 'HR User',
        locale: 'en',
        companyId,
      },
    });
    const m = await prisma.membership.create({
      data: { companyId, userId: user.id, role: 'HR', podId: null },
    });
    expect(m.podId).toBeNull();

    await withTenantContext(prisma, companyId, async (tx) => {
      await tx.membership.update({ where: { id: m.id }, data: { podId: podAId } });
      await recordMembershipPodAssigned(tx, {
        companyId,
        actorId: actorUserId,
        payload: {
          membershipId: m.id,
          userId: user.id,
          podId: podAId,
          assignedBy: actorUserId,
        },
      });
    });

    const after = await prisma.membership.findUnique({ where: { id: m.id } });
    expect(after!.podId).toBe(podAId);

    const events = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'MEMBERSHIP_POD_ASSIGNED', targetId: m.id },
    });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.membershipId).toBe(m.id);
    expect(payload.userId).toBe(user.id);
    expect(payload.podId).toBe(podAId);
    expect(payload.assignedBy).toBe(actorUserId);
  });

  it('reassigns a pod and emits MEMBERSHIP_POD_REASSIGNED with from + to', async () => {
    const user = await prisma.user.create({
      data: {
        phone: '+919999' + String(Date.now() + 202).slice(-7),
        name: 'HR User Reassign',
        locale: 'en',
        companyId,
      },
    });
    const m = await prisma.membership.create({
      data: { companyId, userId: user.id, role: 'HR', podId: podAId },
    });

    await withTenantContext(prisma, companyId, async (tx) => {
      await tx.membership.update({ where: { id: m.id }, data: { podId: podBId } });
      await recordMembershipPodReassigned(tx, {
        companyId,
        actorId: actorUserId,
        payload: {
          membershipId: m.id,
          userId: user.id,
          fromPodId: podAId,
          toPodId: podBId,
          reassignedBy: actorUserId,
          reason: 'Rebalance Q3',
        },
      });
    });

    const after = await prisma.membership.findUnique({ where: { id: m.id } });
    expect(after!.podId).toBe(podBId);

    const events = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'MEMBERSHIP_POD_REASSIGNED', targetId: m.id },
    });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.fromPodId).toBe(podAId);
    expect(payload.toPodId).toBe(podBId);
    expect(payload.reason).toBe('Rebalance Q3');
  });

  it('rejects malformed payloads at the helper Zod boundary', async () => {
    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await recordMembershipPodAssigned(tx, {
          companyId,
          actorId: actorUserId,
          payload: {
            membershipId: 'not-a-uuid',
            userId: actorUserId,
            podId: podAId,
            assignedBy: actorUserId,
          },
        });
      }),
    ).rejects.toThrow();

    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await recordMembershipPodReassigned(tx, {
          companyId,
          actorId: actorUserId,
          payload: {
            membershipId: '00000000-0000-0000-0000-000000000000',
            userId: actorUserId,
            fromPodId: podAId,
            toPodId: podBId,
            reassignedBy: actorUserId,
            // Empty reason violates min(1). nullable means null is allowed; '' is not.
            reason: '',
          },
        });
      }),
    ).rejects.toThrow();
  });
});
