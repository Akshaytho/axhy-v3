/**
 * Real-DB integration test: SiteSupervisorBinding — acting binding creation.
 *
 * P1.5. Covers:
 *   1. Insert acting binding (actingForUserId + effectiveUntil both set);
 *      emit BINDING_CREATED with kind='ACTING'.
 *   2. DB CHECK rejects an acting binding with effectiveUntil = NULL.
 *   3. DB CHECK rejects an acting binding where actingForUserId = userId
 *      (no self-acting).
 *
 * @derives(supervisor-responsibility-model §7 + §9 pick 5)
 * @derives(workflow-design-closure §9)
 * @derives(panel-2026-05-15) — P1.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { recordBindingCreated } from '../src/lib/site-supervisor-binding.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `bind-act-${Date.now()}-`;

let companyId: string;
let siteId: string;
let permSupervisorUserId: string;
let actingSupervisorUserId: string;
let hrUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999810001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const site = await prisma.site.create({
    data: { companyId, name: 'Main Site' },
  });
  siteId = site.id;

  const perm = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 750).slice(-7),
      name: 'Permanent Supervisor',
      locale: 'en',
      companyId,
    },
  });
  permSupervisorUserId = perm.id;

  const acting = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 751).slice(-7),
      name: 'Acting Supervisor',
      locale: 'en',
      companyId,
    },
  });
  actingSupervisorUserId = acting.id;

  const hr = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 752).slice(-7),
      name: 'HR User',
      locale: 'en',
      companyId,
    },
  });
  hrUserId = hr.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('SiteSupervisorBinding — acting creation', () => {
  it('inserts an acting binding (actingForUserId + effectiveUntil set) + emits BINDING_CREATED kind=ACTING', async () => {
    const effectiveFrom = new Date();
    const effectiveUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days

    const bindingId = await withTenantContext(prisma, companyId, async (tx) => {
      const b = await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId,
          userId: actingSupervisorUserId,
          actingForUserId: permSupervisorUserId,
          effectiveFrom,
          effectiveUntil,
          reason: 'Permanent supervisor on sick leave',
          createdBy: hrUserId,
        },
      });
      await recordBindingCreated(tx, {
        companyId,
        actorId: hrUserId,
        payload: {
          bindingId: b.id,
          siteId,
          userId: actingSupervisorUserId,
          actingForUserId: permSupervisorUserId,
          kind: 'ACTING',
          effectiveFrom: effectiveFrom.toISOString(),
          effectiveUntil: effectiveUntil.toISOString(),
          reason: 'Permanent supervisor on sick leave',
          createdBy: hrUserId,
        },
      });
      return b.id;
    });

    const stored = await prisma.siteSupervisorBinding.findUnique({ where: { id: bindingId } });
    expect(stored!.actingForUserId).toBe(permSupervisorUserId);
    expect(stored!.effectiveUntil).not.toBeNull();

    const events = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_CREATED', targetId: bindingId },
    });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.kind).toBe('ACTING');
    expect(payload.actingForUserId).toBe(permSupervisorUserId);
  });

  it('DB CHECK rejects an acting binding with effectiveUntil = NULL', async () => {
    const site2 = await prisma.site.create({ data: { companyId, name: 'Site CHK 1' } });

    await expect(
      prisma.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site2.id,
          userId: actingSupervisorUserId,
          actingForUserId: permSupervisorUserId,
          effectiveFrom: new Date(),
          effectiveUntil: null,
          reason: 'Bad — acting without an end',
          createdBy: hrUserId,
        },
      }),
    ).rejects.toThrow(/SiteSupervisorBinding_acting_requires_until_chk|check constraint/i);
  });

  it('DB CHECK rejects an acting binding where actingForUserId equals userId (self-acting)', async () => {
    const site3 = await prisma.site.create({ data: { companyId, name: 'Site CHK 2' } });

    await expect(
      prisma.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site3.id,
          userId: actingSupervisorUserId,
          actingForUserId: actingSupervisorUserId,
          effectiveFrom: new Date(),
          effectiveUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
          reason: 'Self-acting (should be rejected)',
          createdBy: hrUserId,
        },
      }),
    ).rejects.toThrow(/no_self_acting_chk|check constraint/i);
  });
});
