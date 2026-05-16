/**
 * Real-DB integration test: Notification table persistence shape.
 *
 * Layer 1 PR 2. This test ONLY verifies the persistence-layer guarantees that
 * the migration provides:
 *   - column types
 *   - nullable columns store nulls
 *   - FK to Company + cascade
 *
 * It does NOT — and cannot — assert the audienceUserId XOR audienceWorkerId
 * mutual-exclusion rule, because the rule lives in the Zod schema in
 * @axhy/shared-schema notification.ts (and consumers that use it), NOT as a
 * DB CHECK constraint. The Layer 1 migration creates both columns as nullable
 * UUIDs with no CHECK. See notification-zod-refine.test.ts for that rule's
 * coverage.
 *
 * @derives(workflow-design-closure §3.4 — Notification primitive)
 * @derives(panel-2026-05-15) — Layer 1 PR 2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `notif-${Date.now()}-`;

let companyId: string;
let userId: string;
let workerId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999400001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const u = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 300).slice(-7),
      name: 'Audience User',
      locale: 'en',
      companyId,
    },
  });
  userId = u.id;

  const w = await prisma.worker.create({
    data: {
      companyId,
      name: 'Audience Worker',
      phone: '+919999' + String(Date.now() + 301).slice(-7),
    },
  });
  workerId = w.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('Notification persistence shape (DB layer only)', () => {
  it('inserts a Notification row addressed to a User', async () => {
    const n = await prisma.notification.create({
      data: {
        companyId,
        audienceUserId: userId,
        audienceWorkerId: null,
        kind: 'supervisor_change',
        channel: 'push',
        priority: 'URGENT',
        payload: { message: 'Test push' },
      },
    });

    expect(n.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(n.audienceUserId).toBe(userId);
    expect(n.audienceWorkerId).toBeNull();
    expect(n.kind).toBe('supervisor_change');
    expect(n.channel).toBe('push');
    expect(n.priority).toBe('URGENT');
    expect(n.deliveredAt).toBeNull();
    expect(n.failedAt).toBeNull();
    expect(n.ackedAt).toBeNull();

    await prisma.notification.delete({ where: { id: n.id } });
  });

  it('inserts a Notification row addressed to a Worker', async () => {
    const n = await prisma.notification.create({
      data: {
        companyId,
        audienceUserId: null,
        audienceWorkerId: workerId,
        kind: 'hr_update',
        channel: 'sms',
        priority: 'STANDARD',
        payload: { en: 'Policy updated', hi: 'नीति अपडेट' },
      },
    });

    expect(n.audienceUserId).toBeNull();
    expect(n.audienceWorkerId).toBe(workerId);
    expect(n.channel).toBe('sms');

    await prisma.notification.delete({ where: { id: n.id } });
  });

  it('cascades Notification rows when Company is deleted', async () => {
    const tempCo = await prisma.company.create({
      data: {
        name: TEST_PREFIX + 'CascadeCo',
        slug: TEST_PREFIX + 'cascade-co',
        ownerPhone: '+919999400099',
        ownerName: 'Cascade Owner',
      },
    });
    const tempUser = await prisma.user.create({
      data: {
        phone: '+919999' + String(Date.now() + 399).slice(-7),
        name: 'CascadeUser',
        locale: 'en',
        companyId: tempCo.id,
      },
    });
    const n = await prisma.notification.create({
      data: {
        companyId: tempCo.id,
        audienceUserId: tempUser.id,
        kind: 'leave_status',
        channel: 'in_app_banner',
        priority: 'STANDARD',
        payload: {},
      },
    });

    await prisma.company.delete({ where: { id: tempCo.id } });
    const surviving = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(surviving).toBeNull();
  });
});
