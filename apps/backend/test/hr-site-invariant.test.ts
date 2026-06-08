/**
 * One-worker-one-HR invariant (site-anchored HR ownership, doc 15 simplified).
 * Real-DB test (lab) against createAssignmentService + validateWorkerHrInvariant.
 * Proves a worker's sites can never span two HR owners; null-HR sites never conflict.
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';
import { createAssignmentService } from '../src/lib/services/assignment-service.js';
import { getHrSiteIds } from '../src/middleware/hr-site-scope.js';

const uid = (): string => crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

describe('one-worker-one-HR invariant (site-anchored)', () => {
  const companyId = uid();
  const hrA = uid();
  const hrB = uid();
  const workerUserId = uid();
  const workerId = uid();
  const siteA = uid();
  const siteA2 = uid();
  const siteB = uid();
  const siteNull = uid();

  beforeAll(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `inv-${sfx}`,
        slug: `inv-${sfx}`,
        ownerPhone: `+9110${sfx}`,
        ownerName: 'Inv Owner',
      },
    });
    await prisma.user.createMany({
      data: [
        { id: hrA, phone: `+9121${sfx}` },
        { id: hrB, phone: `+9122${sfx}` },
        { id: workerUserId, phone: `+9123${sfx}` },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { id: uid(), companyId, userId: hrA, role: 'HR', status: 'ACTIVE' },
        { id: uid(), companyId, userId: hrB, role: 'HR', status: 'ACTIVE' },
        { id: uid(), companyId, userId: workerUserId, role: 'WORKER', status: 'ACTIVE' },
      ],
    });
    await prisma.worker.create({
      data: {
        id: workerId,
        companyId,
        userId: workerUserId,
        name: 'Inv Worker',
        phone: `+9123${sfx}`,
      },
    });
    await prisma.site.createMany({
      data: [
        { id: siteA, companyId, name: 'A', ownerHrUserId: hrA },
        { id: siteA2, companyId, name: 'A2', ownerHrUserId: hrA },
        { id: siteB, companyId, name: 'B', ownerHrUserId: hrB },
        { id: siteNull, companyId, name: 'N', ownerHrUserId: null },
      ],
    });
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.worker.deleteMany({ where: { companyId } });
    await prisma.membership.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [hrA, hrB, workerUserId] } } });
  });

  const assign = (siteId: string) =>
    withTenantContext(prisma, companyId, (tx) =>
      createAssignmentService(
        tx,
        {
          workerId,
          siteId,
          shiftStart: '09:00',
          shiftEnd: '17:00',
          dayMask: 'MTWTFS',
          validFrom: '2026-06-01',
          validUntil: null,
        },
        { companyId, userId: hrA },
      ),
    );

  it('first assignment to an HR-A site succeeds (establishes the worker HR)', async () => {
    const r = await assign(siteA);
    expect(r.kind).toBe('OK');
  });

  it('a second site under the SAME HR succeeds', async () => {
    const r = await assign(siteA2);
    expect(r.kind).toBe('OK');
  });

  it('a NULL-HR (unassigned) site is allowed (no conflict)', async () => {
    const r = await assign(siteNull);
    expect(r.kind).toBe('OK');
  });

  it('getHrSiteIds returns only the HR-owned sites (read-side scoping)', async () => {
    const a = await getHrSiteIds(prisma, hrA, companyId);
    expect(new Set(a)).toEqual(new Set([siteA, siteA2]));
    const b = await getHrSiteIds(prisma, hrB, companyId);
    expect(new Set(b)).toEqual(new Set([siteB]));
  });

  it('a site under a DIFFERENT HR is rejected (WORKER_DIFFERENT_HR)', async () => {
    const r = await assign(siteB);
    expect(r.kind).toBe('WORKER_DIFFERENT_HR');
    if (r.kind === 'WORKER_DIFFERENT_HR') {
      expect(r.existingHrUserId).toBe(hrA);
      expect(r.newHrUserId).toBe(hrB);
    }
  });
});
