/**
 * #13 — mark-absent outbox idempotency. Real-DB lab test.
 *
 * Proves markAbsentService only fires hr.worker_absent + payroll.recompute when the mark
 * actually CHANGES the attendance: a repeated identical mark enqueues nothing new; a status
 * change re-enqueues. Seeds the full authz chain (ACTIVE Assignment + PERMANENT binding) so
 * assertCallerSupervisesWorker passes.
 *
 * Run on the lab:
 *   cd apps/backend && DATABASE_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/mark-absent-idempotency.test.ts
 *
 * @derives(PRODUCTION_BUG_LEDGER.md #13)
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';
import { markAbsentService } from '../src/lib/services/attendance-service.js';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

const uid = (): string => crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

const companyId = uid();
const siteId = uid();
const workerId = uid();
const supervisorUserId = uid();
const date = '2026-06-09';

const countOutbox = (topic: string): Promise<number> =>
  prisma.outbox.count({ where: { companyId, topic } });

describe('#13 — mark-absent outbox idempotency', () => {
  beforeAll(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `ma-${sfx}`,
        slug: `ma-${sfx}`,
        ownerPhone: `+9196${sfx.slice(0, 4)}`,
        ownerName: 'MA',
      },
    });
    await prisma.site.create({ data: { id: siteId, companyId, name: `ma-site-${sfx}` } });
    await prisma.worker.create({
      data: { id: workerId, companyId, name: `ma-wkr-${sfx}`, phone: `+9195${sfx.slice(0, 4)}` },
    });
    await prisma.assignment.create({
      data: {
        companyId,
        workerId,
        siteId,
        shiftStart: '09:00',
        shiftEnd: '18:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date('2026-01-01'),
        state: 'ACTIVE',
      },
    });
    // SiteSupervisorBinding.userId FKs to User — seed the supervisor user.
    await prisma.user.create({
      data: { id: supervisorUserId, phone: `+9194${sfx.slice(0, 4)}` },
    });
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: supervisorUserId,
        effectiveFrom: new Date('2026-01-01'),
        reason: 'test binding',
        createdBy: supervisorUserId,
      },
    });
  });

  afterAll(async () => {
    await prisma.outbox.deleteMany({ where: { companyId } });
    await prisma.attendance.deleteMany({ where: { companyId } });
    await prisma.siteSupervisorBinding.deleteMany({ where: { companyId } });
    await prisma.assignment.deleteMany({ where: { companyId } });
    await prisma.worker.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await deleteCompanyDeep(prisma, { ids: [companyId] });
    await prisma.user.deleteMany({ where: { id: supervisorUserId } });
    await prisma.$disconnect();
  });

  const mark = (status: string) =>
    withTenantContext(prisma, companyId, (tx) =>
      markAbsentService(
        tx,
        { workerId, date, status, reason: 'test' },
        { companyId, userId: supervisorUserId },
      ),
    );

  it('first mark enqueues hr.worker_absent + payroll.recompute once', async () => {
    const r = await mark('ABSENT_NO_CALL');
    expect(r.kind).toBe('OK');
    expect(await countOutbox('hr.worker_absent')).toBe(1);
    expect(await countOutbox('payroll.recompute')).toBe(1);
  });

  it('an identical re-mark enqueues NOTHING new (idempotent)', async () => {
    const r = await mark('ABSENT_NO_CALL');
    expect(r.kind).toBe('OK');
    expect(await countOutbox('hr.worker_absent')).toBe(1);
    expect(await countOutbox('payroll.recompute')).toBe(1);
  });

  it('a status change re-enqueues (correction must recompute)', async () => {
    const r = await mark('ABSENT_APPROVED_LEAVE');
    expect(r.kind).toBe('OK');
    expect(await countOutbox('hr.worker_absent')).toBe(2);
    expect(await countOutbox('payroll.recompute')).toBe(2);
  });
});
