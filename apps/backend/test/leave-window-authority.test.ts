/**
 * #22 — SUPERVISOR leave-decision authority is anchored to the LEAVE WINDOW, not "now".
 *
 * Scenario: worker W's leave was for a window ~10 days ago, when W was assigned to
 * Site A (supervised by U). W has since been reassigned to Site B. U is still bound
 * to Site A only.
 *
 *   - Authority anchored to leave.fromDate (the fix): W's primary site at that time
 *     is A, which IS in U's portfolio → U is RESPONSIBLE (can decide). Correct.
 *   - Authority anchored to now (the old bug): W's primary site now is B, NOT in U's
 *     portfolio → U would be wrongly blocked.
 *
 * This proves the composite decision (deriveWorkerPrimarySiteId(at) ∈
 * getSitesSupervisedByUser(at)) flips with the anchor — exactly the leave-requests.ts
 * gates' behavior, which now pass at=leave.fromDate.
 *
 * Run on the lab:
 *   cd apps/backend && DATABASE_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/leave-window-authority.test.ts
 *
 * @derives(PRODUCTION_BUG_LEDGER.md #22)
 * @derives(supervisor-responsibility-model §5.9)
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  deriveWorkerPrimarySiteId,
  getSitesSupervisedByUser,
} from '../src/lib/effective-responsibility.js';
import { prisma } from '../src/lib/prisma.js';

const DAY = 86_400_000;
const companyId = crypto.randomUUID();
const supervisorId = crypto.randomUUID();
const workerId = crypto.randomUUID();
const siteA = crypto.randomUUID(); // leave-window site (U supervises this)
const siteB = crypto.randomUUID(); // current site (after reassignment)
const sfx = crypto.randomBytes(4).toString('hex');

const now = new Date();
const leaveFromDate = new Date(now.getTime() - 10 * DAY); // leave window: ~10 days ago

/** Whether `userId` is the responsible supervisor for `workerId` at instant `at`. */
async function isResponsibleAt(at: Date): Promise<boolean> {
  const primarySiteId = await deriveWorkerPrimarySiteId(prisma, { companyId, workerId, at });
  const portfolio = await getSitesSupervisedByUser(prisma, { companyId, userId: supervisorId, at });
  const portfolioSiteIds = new Set(portfolio.map((p) => p.siteId));
  return primarySiteId !== null && portfolioSiteIds.has(primarySiteId);
}

describe('#22 — leave-decision authority anchored to the leave window', () => {
  beforeAll(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `lw-${sfx}`,
        slug: `lw-${sfx}`,
        ownerPhone: `+9197${sfx.slice(0, 4)}`,
        ownerName: 'LW',
      },
    });
    await prisma.user.create({
      data: { id: supervisorId, phone: `+9198${sfx.slice(0, 4)}`, name: 'Sup' },
    });
    await prisma.site.create({ data: { id: siteA, companyId, name: `A-${sfx}`, state: 'ACTIVE' } });
    await prisma.site.create({ data: { id: siteB, companyId, name: `B-${sfx}`, state: 'ACTIVE' } });
    await prisma.worker.create({
      data: { id: workerId, companyId, name: `wk-${sfx}`, phone: `+9199${sfx.slice(0, 4)}` },
    });

    // U supervises Site A only (open-ended binding, still active today).
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId: siteA,
        userId: supervisorId,
        effectiveFrom: new Date(now.getTime() - 30 * DAY),
        reason: 'seed',
        createdBy: supervisorId,
      },
    });

    // A1: W → Site A, covered the leave window (valid 20d ago .. 5d ago).
    await prisma.assignment.create({
      data: {
        companyId,
        workerId,
        siteId: siteA,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        state: 'ACTIVE',
        validFrom: new Date(now.getTime() - 20 * DAY),
        validUntil: new Date(now.getTime() - 5 * DAY),
      },
    });
    // A2: W → Site B, current (valid from 4d ago, open-ended).
    await prisma.assignment.create({
      data: {
        companyId,
        workerId,
        siteId: siteB,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        state: 'ACTIVE',
        validFrom: new Date(now.getTime() - 4 * DAY),
        validUntil: null,
      },
    });
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: { companyId } });
    await prisma.siteSupervisorBinding.deleteMany({ where: { companyId } });
    await prisma.worker.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { id: supervisorId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('worker primary site differs by instant: Site A during the leave window, Site B now', async () => {
    expect(
      await deriveWorkerPrimarySiteId(prisma, { companyId, workerId, at: leaveFromDate }),
    ).toBe(siteA);
    expect(await deriveWorkerPrimarySiteId(prisma, { companyId, workerId, at: now })).toBe(siteB);
  });

  it('supervisor IS responsible when anchored to leave.fromDate (the #22 fix)', async () => {
    expect(await isResponsibleAt(leaveFromDate)).toBe(true);
  });

  it('supervisor would be WRONGLY blocked when anchored to now (the old bug)', async () => {
    expect(await isResponsibleAt(now)).toBe(false);
  });
});
