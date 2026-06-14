/**
 * Real-DB integration test: SiteSupervisorBinding acting-window basics.
 *
 * P1.5. Covers:
 *   1. Future-dated acting binding accepted (effectiveFrom > now is allowed by
 *      schema; HR app-layer policy may further restrict, but the DB does not).
 *   2. recordBindingEndedManual emits BINDING_ENDED_MANUAL with the right payload.
 *   3. After endedAt is set, the same (site, kind) accepts a new acting window.
 *
 * @derives(supervisor-responsibility-model §5.8 + §9 pick 5)
 * @derives(workflow-design-closure §9)
 * @derives(panel-2026-05-15) — P1.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { recordBindingEndedManual } from '../src/lib/site-supervisor-binding.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `bind-actwin-${Date.now()}-`;

let companyId: string;
let permId: string;
let actingId: string;
let acting2Id: string;
let hrUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999830001',
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

  permId = await mk('Permanent Sup', 900);
  actingId = await mk('Acting Sup', 901);
  acting2Id = await mk('Second Acting', 902);
  hrUserId = await mk('HR', 903);
});

afterAll(async () => {
  await deleteCompanyDeep(prisma, { slugPrefix: TEST_PREFIX });
  await prisma.$disconnect();
});

async function freshSite(name: string): Promise<string> {
  const s = await prisma.site.create({ data: { companyId, name } });
  return s.id;
}

describe('SiteSupervisorBinding — acting window basics', () => {
  it('accepts a future-dated acting binding (effectiveFrom > now)', async () => {
    const siteId = await freshSite('ActWin-Future');
    const from = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
    const until = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // +5 days

    const b = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: actingId,
        actingForUserId: permId,
        effectiveFrom: from,
        effectiveUntil: until,
        reason: 'Pre-scheduled coverage for next-week trip',
        createdBy: hrUserId,
      },
    });

    expect(b.effectiveFrom.getTime()).toBeGreaterThan(Date.now());
    expect(b.endedAt).toBeNull();
  });

  it('recordBindingEndedManual emits BINDING_ENDED_MANUAL with correct payload', async () => {
    const siteId = await freshSite('ActWin-Manual-End');
    const from = new Date();
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const b = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: actingId,
        actingForUserId: permId,
        effectiveFrom: from,
        effectiveUntil: until,
        reason: 'Original acting window',
        createdBy: hrUserId,
      },
    });

    const endedAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1 day (early end)

    await withTenantContext(prisma, companyId, async (tx) => {
      await tx.siteSupervisorBinding.update({
        where: { id: b.id },
        data: { endedAt, endedReason: 'Returned early from leave' },
      });
      await recordBindingEndedManual(tx, {
        companyId,
        actorId: hrUserId,
        payload: {
          bindingId: b.id,
          siteId,
          userId: actingId,
          endedAt: endedAt.toISOString(),
          endedReason: 'Returned early from leave',
          endedBy: hrUserId,
        },
      });
    });

    const stored = await prisma.siteSupervisorBinding.findUnique({ where: { id: b.id } });
    expect(stored!.endedAt).not.toBeNull();
    expect(stored!.endedReason).toBe('Returned early from leave');

    const events = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_MANUAL', targetId: b.id },
    });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.endedReason).toBe('Returned early from leave');
    expect(payload.endedBy).toBe(hrUserId);
  });

  it('accepts a new acting window for the same site after the first is endedAt-marked', async () => {
    const siteId = await freshSite('ActWin-Reuse');
    const from = new Date();
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const first = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: actingId,
        actingForUserId: permId,
        effectiveFrom: from,
        effectiveUntil: until,
        reason: 'First acting',
        createdBy: hrUserId,
      },
    });
    await prisma.siteSupervisorBinding.update({
      where: { id: first.id },
      data: { endedAt: new Date(), endedReason: 'Early end' },
    });

    const second = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: acting2Id,
        actingForUserId: permId,
        effectiveFrom: new Date(),
        effectiveUntil: until,
        reason: 'Second acting after end',
        createdBy: hrUserId,
      },
    });

    expect(second.id).toBeTruthy();
    expect(second.userId).toBe(acting2Id);
  });
});
