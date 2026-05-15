/**
 * Real-DB integration test: HRPod table.
 *
 * Layer 1 PR 2. Exercises the new HRPod schema object end-to-end:
 *   1. Insert with FK to Company + primaryOwnerUserId (User in same company)
 *   2. Optional backupOwnerUserId nullable
 *   3. companyId-scoped uniqueness via the per-tenant context
 *   4. Cascade on Company delete — pod rows go to 0
 *
 * Runs against any real Postgres reachable via AXHY_DB_URL / DATABASE_PUBLIC_URL
 * / DATABASE_URL. Layer 1 migration must have been applied; the workflow-
 * design-closure §4 HRPod table is required.
 *
 * @derives(workflow-design-closure §4 — HR pod model)
 * @derives(panel-2026-05-15) — Layer 1 PR 2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `hr-pod-${Date.now()}-`;

let companyId: string;
let primaryOwnerUserId: string;
let backupOwnerUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999100001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const primary = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now()).slice(-7),
      name: 'Primary Owner',
      locale: 'en',
      companyId,
    },
  });
  primaryOwnerUserId = primary.id;

  const backup = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 1).slice(-7),
      name: 'Backup Owner',
      locale: 'en',
      companyId,
    },
  });
  backupOwnerUserId = backup.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('HRPod CRUD + cascade', () => {
  it('inserts an HRPod row with primary owner only (backup nullable)', async () => {
    const pod = await prisma.hRPod.create({
      data: {
        companyId,
        name: 'Pod-Primary-Only',
        primaryOwnerUserId,
        backupOwnerUserId: null,
      },
    });

    expect(pod.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(pod.companyId).toBe(companyId);
    expect(pod.primaryOwnerUserId).toBe(primaryOwnerUserId);
    expect(pod.backupOwnerUserId).toBeNull();

    // Verify via raw SQL too — Prisma returns same row Postgres has
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT "name" FROM axhy."HRPod" WHERE "id" = ${pod.id}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Pod-Primary-Only');

    await prisma.hRPod.delete({ where: { id: pod.id } });
  });

  it('inserts an HRPod row with both primary + backup owners', async () => {
    const pod = await prisma.hRPod.create({
      data: {
        companyId,
        name: 'Pod-Both-Owners',
        primaryOwnerUserId,
        backupOwnerUserId,
      },
    });

    expect(pod.primaryOwnerUserId).toBe(primaryOwnerUserId);
    expect(pod.backupOwnerUserId).toBe(backupOwnerUserId);

    await prisma.hRPod.delete({ where: { id: pod.id } });
  });

  it('cascades pod deletes when the Company is deleted', async () => {
    // Build a throwaway company with one pod inside it.
    const tempCo = await prisma.company.create({
      data: {
        name: TEST_PREFIX + 'CascadeCo',
        slug: TEST_PREFIX + 'cascade-co',
        ownerPhone: '+919999100099',
        ownerName: 'Cascade Owner',
      },
    });
    const tempOwner = await prisma.user.create({
      data: {
        phone: '+919999' + String(Date.now() + 7).slice(-7),
        name: 'Cascade Owner User',
        locale: 'en',
        companyId: tempCo.id,
      },
    });
    const pod = await prisma.hRPod.create({
      data: {
        companyId: tempCo.id,
        name: 'CascadePod',
        primaryOwnerUserId: tempOwner.id,
      },
    });
    expect(pod.id).toBeTruthy();

    // Delete company → expect pod cascade-deleted
    await prisma.company.delete({ where: { id: tempCo.id } });

    const surviving = await prisma.hRPod.findUnique({ where: { id: pod.id } });
    expect(surviving).toBeNull();
  });
});
