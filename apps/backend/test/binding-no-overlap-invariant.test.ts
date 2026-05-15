/**
 * Real-DB integration test: SiteSupervisorBinding no-overlap invariant.
 *
 * P1.5. Covers the §5.8 hard rule: at most one active binding of each kind
 * per site at any moment. Enforced via the Postgres EXCLUDE USING gist
 * constraint in the migration.
 *
 * Cases:
 *   1. Two overlapping permanent bindings same site → second rejected.
 *   2. Two overlapping acting bindings same site → second rejected.
 *   3. Acting + permanent on same site overlapping → both accepted (different kind).
 *   4. Two permanent bindings same site, non-overlapping time windows → both accepted.
 *   5. After endedAt is set on the first, a new overlapping binding is accepted
 *      (the partial-index WHERE endedAt IS NULL excludes ended rows).
 *
 * @derives(supervisor-responsibility-model §5.8)
 * @derives(workflow-design-closure §3.1)
 * @derives(panel-2026-05-15) — P1.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `bind-overlap-${Date.now()}-`;

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
      ownerPhone: '+919999820001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const mkUser = async (name: string, offset: number) =>
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

  userA = await mkUser('Supervisor A', 800);
  userB = await mkUser('Supervisor B', 801);
  userC = await mkUser('Supervisor C', 802);
  hrUserId = await mkUser('HR User', 803);
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

async function freshSite(name: string): Promise<string> {
  const s = await prisma.site.create({ data: { companyId, name } });
  return s.id;
}

describe('SiteSupervisorBinding — no-overlap invariant (DB EXCLUDE)', () => {
  it('rejects two overlapping permanent bindings on the same site', async () => {
    const siteId = await freshSite('Overlap-1');
    const from = new Date();

    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: from,
        effectiveUntil: null,
        reason: 'First permanent',
        createdBy: hrUserId,
      },
    });

    await expect(
      prisma.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId,
          userId: userB,
          actingForUserId: null,
          effectiveFrom: from,
          effectiveUntil: null,
          reason: 'Second permanent (should be rejected)',
          createdBy: hrUserId,
        },
      }),
    ).rejects.toThrow(/no_overlap_active_excl|exclusion constraint/i);
  });

  it('rejects two overlapping acting bindings on the same site', async () => {
    const siteId = await freshSite('Overlap-2');
    const from = new Date();
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: userA,
        effectiveFrom: from,
        effectiveUntil: until,
        reason: 'First acting',
        createdBy: hrUserId,
      },
    });

    await expect(
      prisma.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId,
          userId: userC,
          actingForUserId: userA,
          effectiveFrom: from,
          effectiveUntil: until,
          reason: 'Second acting (should be rejected)',
          createdBy: hrUserId,
        },
      }),
    ).rejects.toThrow(/no_overlap_active_excl|exclusion constraint/i);
  });

  it('accepts an acting + permanent stacked on the same site (different kind discriminator)', async () => {
    const siteId = await freshSite('Overlap-3');
    const from = new Date();
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const perm = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: from,
        effectiveUntil: null,
        reason: 'Baseline permanent',
        createdBy: hrUserId,
      },
    });
    const acting = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: userA,
        effectiveFrom: from,
        effectiveUntil: until,
        reason: 'Acting cover during sick week',
        createdBy: hrUserId,
      },
    });

    expect(perm.id).toBeTruthy();
    expect(acting.id).toBeTruthy();
    expect(perm.actingForUserId).toBeNull();
    expect(acting.actingForUserId).toBe(userA);
  });

  it('accepts two permanent bindings on the same site with non-overlapping time windows', async () => {
    const siteId = await freshSite('Overlap-4');
    const earlyFrom = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // -10d
    const earlyUntil = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // -5d
    const lateFrom = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // -4d

    const early = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: earlyFrom,
        effectiveUntil: earlyUntil,
        reason: 'Bounded permanent (past)',
        createdBy: hrUserId,
      },
    });
    const late = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: null,
        effectiveFrom: lateFrom,
        effectiveUntil: null,
        reason: 'Open-ended permanent (current)',
        createdBy: hrUserId,
      },
    });

    expect(early.id).toBeTruthy();
    expect(late.id).toBeTruthy();
  });

  it('accepts a new overlapping permanent binding after the first is endedAt-marked', async () => {
    const siteId = await freshSite('Overlap-5');
    const from = new Date();

    const first = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: from,
        effectiveUntil: null,
        reason: 'First permanent',
        createdBy: hrUserId,
      },
    });

    // End it manually
    await prisma.siteSupervisorBinding.update({
      where: { id: first.id },
      data: { endedAt: new Date(), endedReason: 'Test manual end' },
    });

    // Now a new overlapping permanent is accepted (partial index excludes ended rows)
    const replacement = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: userB,
        actingForUserId: null,
        effectiveFrom: new Date(),
        effectiveUntil: null,
        reason: 'Replacement after manual end',
        createdBy: hrUserId,
      },
    });
    expect(replacement.id).toBeTruthy();
  });
});
