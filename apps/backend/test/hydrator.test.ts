/**
 * @derives(master-plan §G)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;
const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `hydrator-${Date.now()}-`;

let companyId: string;
let entryId: string;

beforeAll(async () => {
  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000062',
      ownerName: 'O',
    },
  });
  companyId = co.id;
  const sup = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  const w = await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'P',
      state: 'ACTIVE',
      phone: `+9199${String(Date.now() + 1).slice(-8)}`,
    },
  });
  const s = await prismaRaw.site.create({ data: { companyId, name: 'A' } });

  const synthId = '00000000-0000-4000-8000-000000000000';
  const e = await prismaRaw.calendarEntry.create({
    data: {
      companyId,
      supervisorId: sup.id,
      date: new Date('2026-05-12'),
      kind: 'TENTATIVE_ASSIGNMENT',
      payload: { workerId: w.id, siteId: s.id, shiftStart: '09:00', shiftEnd: '17:00' },
      editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      promotedToKind: 'ASSIGNMENT',
      promotedToId: synthId,
      promotedAt: new Date(),
      pendingAssignmentPayload: {
        workerId: w.id,
        siteId: s.id,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: '_T_____',
        validFrom: '2026-05-12',
        validUntil: '2026-05-12',
      },
    },
  });
  entryId = e.id;
});

afterAll(async () => {
  await prismaRaw.assignment.deleteMany({ where: { companyId } });
  await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
});

describe('hydrate-deferred-assignments', () => {
  it('converts deferred payload → real Assignment row + nulls payload + updates promotedToId + writes AuditEvent', async () => {
    // Dynamic-import runs the script in-process (VITEST env var suppresses auto-run)
    const { main } = await import('../scripts/hydrate-deferred-assignments.js');
    await main();

    const updated = await prismaRaw.calendarEntry.findUnique({ where: { id: entryId } });
    expect(updated?.pendingAssignmentPayload).toBeNull();
    expect(updated?.promotedToId).toBeTruthy();
    expect(updated?.promotedToId).not.toBe('00000000-0000-4000-8000-000000000000');

    const assignment = await prismaRaw.assignment.findUnique({
      where: { id: updated!.promotedToId! },
    });
    expect(assignment).toBeTruthy();
    expect(assignment?.state).toBe('ACTIVE');

    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId, kind: 'ASSIGNMENT_HYDRATED_FROM_CALENDAR' },
    });
    expect(audit).toBeTruthy();
  }, 30000);

  it('is idempotent — re-running on an empty result set is a no-op', async () => {
    // After the first run, no pendingAssignmentPayload rows remain for this company.
    // Re-importing uses cached module; call main() again — should log 0 and not throw.
    const { main } = await import('../scripts/hydrate-deferred-assignments.js');
    // Should resolve without error (hydrated = 0)
    await expect(main()).resolves.toBeUndefined();
  }, 30000);
});
