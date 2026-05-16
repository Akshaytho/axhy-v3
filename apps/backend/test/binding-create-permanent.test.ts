/**
 * Real-DB integration test: SiteSupervisorBinding — permanent binding creation.
 *
 * P1.5. Covers:
 *   1. Insert open-ended permanent binding (effectiveUntil = NULL)
 *   2. Insert future-bounded permanent binding (effectiveUntil = future date)
 *   3. recordBindingCreated emits BINDING_CREATED with correct payload
 *   4. Helper rejects malformed payloads at the Zod boundary
 *
 * @derives(supervisor-responsibility-model §7 + §9 pick 6)
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

const TEST_PREFIX = `bind-perm-${Date.now()}-`;

let companyId: string;
let siteId: string;
let supervisorUserId: string;
let hrUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999800001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const site = await prisma.site.create({
    data: { companyId, name: 'Main Site' },
  });
  siteId = site.id;

  const sup = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 700).slice(-7),
      name: 'Supervisor A',
      locale: 'en',
      companyId,
    },
  });
  supervisorUserId = sup.id;

  const hr = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 701).slice(-7),
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

describe('SiteSupervisorBinding — permanent creation', () => {
  it('inserts an open-ended permanent binding (effectiveUntil = NULL) and emits BINDING_CREATED', async () => {
    const effectiveFrom = new Date();

    const bindingId = await withTenantContext(prisma, companyId, async (tx) => {
      const b = await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId,
          userId: supervisorUserId,
          actingForUserId: null,
          effectiveFrom,
          effectiveUntil: null,
          reason: 'Initial portfolio assignment',
          createdBy: hrUserId,
        },
      });
      await recordBindingCreated(tx, {
        companyId,
        actorId: hrUserId,
        payload: {
          bindingId: b.id,
          siteId,
          userId: supervisorUserId,
          actingForUserId: null,
          kind: 'PERMANENT',
          effectiveFrom: effectiveFrom.toISOString(),
          effectiveUntil: null,
          reason: 'Initial portfolio assignment',
          createdBy: hrUserId,
        },
      });
      return b.id;
    });

    const stored = await prisma.siteSupervisorBinding.findUnique({ where: { id: bindingId } });
    expect(stored).not.toBeNull();
    expect(stored!.actingForUserId).toBeNull();
    expect(stored!.effectiveUntil).toBeNull();
    expect(stored!.endedAt).toBeNull();
    expect(stored!.reason).toBe('Initial portfolio assignment');

    const events = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_CREATED', targetId: bindingId },
    });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.kind).toBe('PERMANENT');
    expect(payload.actingForUserId).toBeNull();
    expect(payload.effectiveUntil).toBeNull();
  });

  it('inserts a future-bounded permanent binding (effectiveUntil set to a planned-switch date)', async () => {
    const effectiveFrom = new Date();
    const effectiveUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // Use a fresh site to avoid no-overlap collision with the previous test
    const site2 = await prisma.site.create({
      data: { companyId, name: 'Site Two' },
    });

    const b = await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId: site2.id,
        userId: supervisorUserId,
        actingForUserId: null,
        effectiveFrom,
        effectiveUntil,
        reason: 'Bounded permanent (planned hand-off in 30 days)',
        createdBy: hrUserId,
      },
    });

    expect(b.effectiveUntil).toBeInstanceOf(Date);
    expect(b.effectiveUntil!.getTime()).toBe(effectiveUntil.getTime());
    expect(b.actingForUserId).toBeNull(); // still permanent
    expect(b.endedAt).toBeNull();
  });

  it('rejects malformed payloads at the helper Zod boundary', async () => {
    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await recordBindingCreated(tx, {
          companyId,
          actorId: hrUserId,
          payload: {
            bindingId: 'not-a-uuid',
            siteId,
            userId: supervisorUserId,
            actingForUserId: null,
            kind: 'PERMANENT',
            effectiveFrom: new Date().toISOString(),
            effectiveUntil: null,
            reason: 'Bad payload',
            createdBy: hrUserId,
          },
        });
      }),
    ).rejects.toThrow();

    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await recordBindingCreated(tx, {
          companyId,
          actorId: hrUserId,
          payload: {
            bindingId: '00000000-0000-0000-0000-000000000000',
            siteId,
            userId: supervisorUserId,
            actingForUserId: null,
            // 'INVALID' is not in BindingKindSchema
            kind: 'INVALID' as never,
            effectiveFrom: new Date().toISOString(),
            effectiveUntil: null,
            reason: 'Bad kind',
            createdBy: hrUserId,
          },
        });
      }),
    ).rejects.toThrow();
  });
});
