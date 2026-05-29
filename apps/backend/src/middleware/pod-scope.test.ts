// [ORCHESTRATOR_EXCEPTION] Task 2 is itself a delegated subagent run from the parent plan executor; spawning further subagents to write 2 small files would be wasteful overhead. Keeping in-context.
import { afterEach, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { getMyPodIds, PodOwnershipError, requirePodOwnership } from './pod-scope.js';

const prisma = new PrismaClient();

describe('pod-scope helpers', () => {
  // NOTE: Plan listed UUIDs containing non-hex chars ("p01"). Postgres rejects
  // those at parse time, so we substitute hex digits (b01/b02/b03) while
  // preserving the plan's intent (two pods in tenant1, one in tenant2).
  const companyId = '00000000-0000-0000-0000-00000000c001';
  const otherCompanyId = '00000000-0000-0000-0000-00000000c002';
  const hrA = '00000000-0000-0000-0000-0000000000a1';
  const hrB = '00000000-0000-0000-0000-0000000000a2';
  const podA = '00000000-0000-0000-0000-000000000b01';
  const podB = '00000000-0000-0000-0000-000000000b02';
  const podOther = '00000000-0000-0000-0000-000000000b03';

  beforeEach(async () => {
    // Cleanup any leftover state from a prior aborted run before seeding.
    await prisma.hRPod.deleteMany({ where: { id: { in: [podA, podB, podOther] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });

    // HRPod.companyId FK requires Company rows to exist first.
    await prisma.company.create({
      data: {
        id: companyId,
        name: 'Pod Scope Test Tenant 1',
        slug: `pod-scope-test-tenant-1-${companyId}`,
        ownerPhone: '+910000000001',
        ownerName: 'Test Owner 1',
      },
    });
    await prisma.company.create({
      data: {
        id: otherCompanyId,
        name: 'Pod Scope Test Tenant 2',
        slug: `pod-scope-test-tenant-2-${otherCompanyId}`,
        ownerPhone: '+910000000002',
        ownerName: 'Test Owner 2',
      },
    });

    await prisma.hRPod.create({
      data: { id: podA, companyId, name: 'Pod A', primaryOwnerUserId: hrA },
    });
    await prisma.hRPod.create({
      data: { id: podB, companyId, name: 'Pod B', primaryOwnerUserId: hrB, backupOwnerUserId: hrA },
    });
    await prisma.hRPod.create({
      data: {
        id: podOther,
        companyId: otherCompanyId,
        name: 'Other tenant',
        primaryOwnerUserId: hrA,
      },
    });
  });

  afterEach(async () => {
    // HRPod.companyId has onDelete: Cascade, but we delete pods explicitly
    // first to keep the cleanup intent obvious.
    await prisma.hRPod.deleteMany({ where: { id: { in: [podA, podB, podOther] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns primary + backup pods within the caller company', async () => {
    const ids = await getMyPodIds(prisma, hrA, companyId);
    expect(new Set(ids)).toEqual(new Set([podA, podB]));
  });

  it('does not return pods from another tenant', async () => {
    const ids = await getMyPodIds(prisma, hrA, companyId);
    expect(ids).not.toContain(podOther);
  });

  it('returns empty for a user who owns no pods', async () => {
    const stranger = '00000000-0000-0000-0000-0000000000a9';
    const ids = await getMyPodIds(prisma, stranger, companyId);
    expect(ids).toEqual([]);
  });

  it('requirePodOwnership throws PodOwnershipError when not owner', async () => {
    const stranger = '00000000-0000-0000-0000-0000000000a9';
    await expect(requirePodOwnership(prisma, podA, stranger, companyId)).rejects.toBeInstanceOf(
      PodOwnershipError,
    );
  });

  it('requirePodOwnership resolves when caller is primary owner', async () => {
    await expect(requirePodOwnership(prisma, podA, hrA, companyId)).resolves.toBeUndefined();
  });

  it('requirePodOwnership resolves when caller is backup owner', async () => {
    await expect(requirePodOwnership(prisma, podB, hrA, companyId)).resolves.toBeUndefined();
  });
});
