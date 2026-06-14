/**
 * Regression guard for the migration-031 test-cleanup fix.
 *
 * Migration 031 made Visit/AuditEvent/Attendance company FKs ON DELETE RESTRICT.
 * This test proves two things on a real database:
 *   1. A bare `company.deleteMany()` THROWS (FK 23503 / P2003) while any of the
 *      three legal-trail tables still reference the company — i.e. the invariant
 *      is real and someone weakening the FK back to CASCADE will fail this test.
 *   2. `deleteCompanyDeep()` tears the tenant down FK-safely, leaving no orphans.
 *
 * @derives(migration 031) @derives(handoff 2026-06-12 "NEW DEBT")
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `dcd-${Date.now()}-`;

/** Seed a full legal-trail tenant: company + user + worker + site + visit + audit + attendance. */
async function seedLegalTrailTenant(slugSuffix: string): Promise<string> {
  const company = await prisma.company.create({
    data: {
      name: `${TEST_PREFIX}Co`,
      slug: `${TEST_PREFIX}${slugSuffix}`,
      ownerPhone: `+9190${String(Date.now()).slice(-8)}`,
      ownerName: `${TEST_PREFIX}Owner`,
    },
  });
  const site = await prisma.site.create({
    data: { companyId: company.id, name: `${TEST_PREFIX}Site` },
  });
  const worker = await prisma.worker.create({
    data: {
      companyId: company.id,
      name: `${TEST_PREFIX}Worker`,
      phone: `+9191${String(Date.now()).slice(-8)}`,
    },
  });
  // The three RESTRICT-protected legal-trail rows.
  await prisma.visit.create({
    data: {
      companyId: company.id,
      workerId: worker.id,
      siteId: site.id,
      scheduledFor: new Date(),
    },
  });
  await prisma.auditEvent.create({
    data: { companyId: company.id, kind: 'TEST_EVENT', actorId: randomUUID() },
  });
  await prisma.attendance.create({
    data: {
      companyId: company.id,
      workerId: worker.id,
      date: new Date(),
      status: 'PRESENT',
      markedBySupervisorId: randomUUID(),
    },
  });
  return company.id;
}

describe('deleteCompanyDeep (migration 031 FK-safe teardown)', () => {
  afterAll(async () => {
    // Guaranteed cleanup even if an assertion above failed.
    await deleteCompanyDeep(prisma, { slugPrefix: TEST_PREFIX });
    await prisma.$disconnect();
  });

  it('bare company.deleteMany() throws FK 23503 while legal-trail rows exist', async () => {
    const companyId = await seedLegalTrailTenant('bare');
    await expect(prisma.company.deleteMany({ where: { id: companyId } })).rejects.toMatchObject({
      code: 'P2003',
    });
    // The company must still exist — the delete was correctly refused.
    expect(await prisma.company.count({ where: { id: companyId } })).toBe(1);
  });

  it('deleteCompanyDeep() removes the company and every FK child, no orphans', async () => {
    const companyId = await seedLegalTrailTenant('deep');
    await deleteCompanyDeep(prisma, { ids: [companyId] });
    const where = { companyId };
    expect(await prisma.company.count({ where: { id: companyId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where })).toBe(0);
    expect(await prisma.visit.count({ where })).toBe(0);
    expect(await prisma.attendance.count({ where })).toBe(0);
    expect(await prisma.worker.count({ where })).toBe(0);
    expect(await prisma.site.count({ where })).toBe(0);
  });
});
