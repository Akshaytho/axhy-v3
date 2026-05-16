/**
 * S-001 same-day supervisor-freeze policy — 4 test cases per the active slice plan.
 *
 * Policy (locked 2026-05-16):
 *   "Once the day has started in the tenant's local timezone, no supervisor
 *    responsibility change may take effect for that site until the next
 *    tenant-local midnight."
 *
 * The 4 cases are framed by the business outcome, not by one field:
 *
 *   1. HR cannot create a same-day acting binding (rejected with 400 / throws
 *      SameDayFreezeError). Exercised at the helper level since the HR
 *      binding-create HTTP route is deferred to F-005 (admin-web HR portal).
 *      Proves the shared guard is correctly reusable for that future route.
 *
 *   2. HR cannot end the current responsible binding effective today (rejected
 *      with 400 / throws SameDayFreezeError). Also exercised at the helper
 *      level for the same F-005 deferral reason — proves the guard covers
 *      effectiveUntil-only mutations.
 *
 *   3. reassignPermanentBinding with a same-day boundary is rejected. Real-DB
 *      test against the service helper.
 *
 *   4. Supervisor-app routing behavior is unchanged for permanent + future-
 *      dated bindings. Seeds bindings via direct Prisma (the seed/migration
 *      path bypasses the API-layer guard by design — F-002 baseline pattern)
 *      and verifies `getEffectiveBinding` still returns the right binding at
 *      now AND at a post-cutover instant.
 *
 * @derives(supervisor-responsibility-model §"2026-05-16 Update")
 * @derives(workflow-design-closure §"2026-05-16 Update")
 * @derives(production-grade-rulebook rule 25)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import {
  assertNotChangingTodaysResponsibility,
  SameDayFreezeError,
  tomorrowMidnightInTimeZone,
  DEFAULT_TENANT_TIME_ZONE,
} from '../src/lib/same-day-freeze.js';
import { reassignPermanentBinding } from '../src/lib/site-supervisor-binding.js';
import { getEffectiveBinding } from '../src/lib/effective-responsibility.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `s001-freeze-${Date.now()}-`;

let companyId: string;
let userA: string;
let userB: string;
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

  userA = await mk('User A', 9000);
  userB = await mk('User B', 9001);
  hrUserId = await mk('HR', 9002);
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('S-001 same-day supervisor-freeze policy', () => {
  it('1. HR cannot create a same-day acting binding — helper throws SameDayFreezeError on same-day effectiveFrom', () => {
    // Today in tenant tz — effectiveFrom = now() is by definition before
    // tomorrow's tenant-local midnight, so the guard MUST reject.
    expect(() =>
      assertNotChangingTodaysResponsibility({
        effectiveFrom: new Date(),
      }),
    ).toThrowError(SameDayFreezeError);

    // Sanity: a clearly-tomorrow date (+36h) is accepted.
    expect(() =>
      assertNotChangingTodaysResponsibility({
        effectiveFrom: new Date(Date.now() + 36 * 60 * 60 * 1000),
      }),
    ).not.toThrow();

    // The error has the right code so HTTP routes can map to 400.
    try {
      assertNotChangingTodaysResponsibility({ effectiveFrom: new Date() });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SameDayFreezeError);
      expect((err as SameDayFreezeError).code).toBe('SAME_DAY_FREEZE');
    }
  });

  it('2. HR cannot end a binding effective today — helper throws SameDayFreezeError on same-day effectiveUntil', () => {
    // effectiveUntil = now() means "end this binding immediately" — under
    // S-001 that is a same-day responsibility change and must be rejected.
    expect(() =>
      assertNotChangingTodaysResponsibility({
        effectiveUntil: new Date(),
      }),
    ).toThrowError(SameDayFreezeError);

    // Sanity: ending the binding tomorrow-or-later is accepted.
    expect(() =>
      assertNotChangingTodaysResponsibility({
        effectiveUntil: new Date(Date.now() + 36 * 60 * 60 * 1000),
      }),
    ).not.toThrow();
  });

  it('3. reassignPermanentBinding rejects a same-day boundary', async () => {
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-3' } });

    // Seed an existing permanent binding via Prisma (seed path — bypasses the
    // API-layer guard by design, F-002 baseline pattern).
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId: site.id,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        effectiveUntil: null,
        reason: 'Seed',
        createdBy: hrUserId,
      },
    });

    // Same-day cutover — must be rejected.
    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await reassignPermanentBinding(tx, {
          companyId,
          siteId: site.id,
          newUserId: userB,
          effectiveFrom: new Date(),
          effectiveUntil: null,
          reason: 'S-001 violation',
          reassignedBy: hrUserId,
        });
      }),
    ).rejects.toThrowError(SameDayFreezeError);

    // The seed remained intact — no audit emitted for the rejected call.
    const bindings = await prisma.siteSupervisorBinding.findMany({
      where: { companyId, siteId: site.id },
    });
    expect(bindings).toHaveLength(1);
    expect(bindings[0].userId).toBe(userA);

    const audits = await prisma.auditEvent.findMany({
      where: {
        companyId,
        kind: { in: ['BINDING_CREATED', 'BINDING_ENDED_SUPERSEDED_BY_PERMANENT'] },
        targetId: { not: '' },
      },
    });
    // No event for the rejected reassignment on this site.
    const siteAudits = audits.filter((a) => {
      const p = a.payload as Record<string, unknown> | null;
      return p && p.siteId === site.id;
    });
    expect(siteAudits).toHaveLength(0);
  });

  it('4. supervisor-app routing is unchanged for permanent + future-dated bindings', async () => {
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-4' } });

    // Seed a baseline permanent binding for userA (started 30 days ago).
    // Direct-Prisma seeding bypasses the API-layer S-001 guard by design.
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId: site.id,
        userId: userA,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        effectiveUntil: null,
        reason: 'Seed',
        createdBy: hrUserId,
      },
    });

    // Schedule a future-dated reassignment to userB at +36h (past tomorrow
    // IST midnight). The S-001 guard passes; the reassign service runs.
    const cutover = new Date(Date.now() + 36 * 60 * 60 * 1000);
    await withTenantContext(prisma, companyId, async (tx) => {
      await reassignPermanentBinding(tx, {
        companyId,
        siteId: site.id,
        newUserId: userB,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'Scheduled handoff',
        reassignedBy: hrUserId,
      });
    });

    // RIGHT NOW: routing still returns userA (cutover is in the future).
    const nowResult = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, { companyId, siteId: site.id, at: new Date() }),
    );
    expect(nowResult).not.toBeNull();
    expect(nowResult!.userId).toBe(userA);
    expect(nowResult!.kind).toBe('PERMANENT');

    // AT A POST-CUTOVER INSTANT: routing returns userB.
    const afterCutover = new Date(cutover.getTime() + 60_000);
    const afterResult = await withTenantContext(prisma, companyId, async (tx) =>
      getEffectiveBinding(tx, { companyId, siteId: site.id, at: afterCutover }),
    );
    expect(afterResult).not.toBeNull();
    expect(afterResult!.userId).toBe(userB);
    expect(afterResult!.kind).toBe('PERMANENT');
  });

  it('helper sanity: tomorrowMidnightInTimeZone respects the requested IANA tz', () => {
    // Asia/Kolkata: tomorrow midnight IST = tomorrow_local_00:00 IST.
    // In UTC that is tomorrow_local_00:00 - 5:30. Verify the helper returns
    // an instant in the future and that re-formatting it in IST yields 00:00.
    const now = new Date();
    const cutoff = tomorrowMidnightInTimeZone(now, DEFAULT_TENANT_TIME_ZONE);
    expect(cutoff.getTime()).toBeGreaterThan(now.getTime());

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TENANT_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(cutoff);
    const hh = Number(parts.find((p) => p.type === 'hour')!.value);
    const mm = Number(parts.find((p) => p.type === 'minute')!.value);
    expect(hh).toBe(0);
    expect(mm).toBe(0);
  });
});
