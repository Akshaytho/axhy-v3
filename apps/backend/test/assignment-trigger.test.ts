/**
 * @derives(master-plan §G)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;
const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `assn-trig-${Date.now()}-`;

let companyId: string;
let workerId: string;
let siteId: string;
let pastActiveAssignmentId: string;
let pastTerminatedAssignmentId: string;

beforeAll(async () => {
  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000061',
      ownerName: 'O',
    },
  });
  companyId = co.id;
  const w = await prismaRaw.worker.create({
    data: { companyId, name: 'X', state: 'ACTIVE', phone: `+9199${String(Date.now()).slice(-8)}` },
  });
  workerId = w.id;
  const s = await prismaRaw.site.create({ data: { companyId, name: 'X' } });
  siteId = s.id;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Seed past assignment (validUntil yesterday, state=ACTIVE) — trigger should block edits
  const a = await prismaRaw.assignment.create({
    data: {
      companyId,
      workerId,
      siteId,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      validFrom: thirtyDaysAgo,
      validUntil: yesterday,
      state: 'ACTIVE',
    },
  });
  pastActiveAssignmentId = a.id;

  // Seed past assignment that is already TERMINATED — trigger should allow edits (OLD.state = 'TERMINATED')
  const b = await prismaRaw.assignment.create({
    data: {
      companyId,
      workerId,
      siteId,
      shiftStart: '08:00',
      shiftEnd: '16:00',
      dayMask: 'MTWTF__',
      validFrom: thirtyDaysAgo,
      validUntil: yesterday,
      state: 'TERMINATED',
    },
  });
  pastTerminatedAssignmentId = b.id;
});

afterAll(async () => {
  await prismaRaw.assignment.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
});

describe('block_past_assignment_update trigger', () => {
  it('UPDATE on past Assignment with state=ACTIVE is blocked', async () => {
    await expect(
      prismaRaw.assignment.update({
        where: { id: pastActiveAssignmentId },
        data: { dayMask: 'M______' },
      }),
    ).rejects.toThrow();
  });

  it('UPDATE on already-TERMINATED past Assignment is allowed (cleanup path)', async () => {
    // Trigger checks OLD.state: if OLD.state = 'TERMINATED' the guard is bypassed
    const updated = await prismaRaw.assignment.update({
      where: { id: pastTerminatedAssignmentId },
      data: { shiftStart: '09:00' },
    });
    expect(updated.state).toBe('TERMINATED');
  });
});
