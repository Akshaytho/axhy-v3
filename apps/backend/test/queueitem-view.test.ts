/**
 * Real-DB integration test: axhy.QueueItem view.
 *
 * Layer 1 PR 2. Verifies the read-only QueueItem view is queryable and
 * produces the expected UNION ALL projection over (PROPOSED SupervisorDecision
 * rows + REQUESTED LeaveRequest rows). The view has no priority/lock columns —
 * those land in a later layer when QueueItem becomes a physical table per
 * closure §3.3.
 *
 * The view is queried via raw SQL because Prisma's client doesn't generate
 * accessors for plain CREATE VIEW objects.
 *
 * @derives(workflow-design-closure §3.3 — QueueItem primitive)
 * @derives(panel-2026-05-15) — Layer 1 PR 2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `queueitem-${Date.now()}-`;

type QueueRow = {
  sourceEntity: 'dwi' | 'leave_request';
  sourceId: string;
  companyId: string;
  audienceUserId: string | null;
  audiencePodId: string | null;
  audienceRole: 'supervisor' | 'hr';
  kindHint: string;
  createdAt: Date;
};

let companyId: string;
let supervisorUserId: string;
let workerId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999700001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const sup = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 600).slice(-7),
      name: 'Supervisor',
      locale: 'en',
      companyId,
    },
  });
  supervisorUserId = sup.id;

  const w = await prisma.worker.create({
    data: {
      companyId,
      name: 'Suresh',
      phone: '+919999' + String(Date.now() + 601).slice(-7),
    },
  });
  workerId = w.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('QueueItem view (read-only UNION over DWI + LeaveRequest)', () => {
  it('surfaces PROPOSED SupervisorDecision rows as supervisor-audience', async () => {
    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: supervisorUserId,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: workerId,
        payload: {},
        // appliedAt left null — this row is PROPOSED
      },
    });

    const rows = await prisma.$queryRaw<QueueRow[]>`
      SELECT * FROM axhy."QueueItem"
      WHERE "companyId" = ${companyId}::uuid AND "sourceId" = ${dwi.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceEntity).toBe('dwi');
    expect(rows[0].audienceRole).toBe('supervisor');
    expect(rows[0].audienceUserId).toBe(supervisorUserId);
    expect(rows[0].audiencePodId).toBeNull();
    expect(rows[0].kindHint).toBe('OPERATIONAL');

    await prisma.supervisorDecision.delete({ where: { id: dwi.id } });
  });

  it('does NOT surface APPLIED SupervisorDecision rows', async () => {
    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: supervisorUserId,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: workerId,
        payload: {},
        appliedAt: new Date(),
      },
    });

    const rows = await prisma.$queryRaw<QueueRow[]>`
      SELECT * FROM axhy."QueueItem"
      WHERE "companyId" = ${companyId}::uuid AND "sourceId" = ${dwi.id}
    `;
    expect(rows).toHaveLength(0);

    await prisma.supervisorDecision.delete({ where: { id: dwi.id } });
  });

  it('surfaces REQUESTED LeaveRequest rows as hr-audience', async () => {
    const lr = await prisma.leaveRequest.create({
      data: {
        companyId,
        workerId,
        fromDate: new Date('2026-06-01'),
        toDate: new Date('2026-06-03'),
        reason: 'family wedding',
        state: 'REQUESTED',
      },
    });

    const rows = await prisma.$queryRaw<QueueRow[]>`
      SELECT * FROM axhy."QueueItem"
      WHERE "companyId" = ${companyId}::uuid AND "sourceId" = ${lr.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceEntity).toBe('leave_request');
    expect(rows[0].audienceRole).toBe('hr');
    expect(rows[0].audienceUserId).toBeNull();
    expect(rows[0].kindHint).toBe('REQUESTED');

    await prisma.leaveRequest.delete({ where: { id: lr.id } });
  });

  it('does NOT surface APPROVED LeaveRequest rows', async () => {
    const lr = await prisma.leaveRequest.create({
      data: {
        companyId,
        workerId,
        fromDate: new Date('2026-07-01'),
        toDate: new Date('2026-07-02'),
        reason: 'medical',
        state: 'APPROVED',
      },
    });

    const rows = await prisma.$queryRaw<QueueRow[]>`
      SELECT * FROM axhy."QueueItem"
      WHERE "companyId" = ${companyId}::uuid AND "sourceId" = ${lr.id}
    `;
    expect(rows).toHaveLength(0);

    await prisma.leaveRequest.delete({ where: { id: lr.id } });
  });

  it('UNION ALL covers both source types in the same companyId scope', async () => {
    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: supervisorUserId,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: workerId,
        payload: {},
      },
    });
    const lr = await prisma.leaveRequest.create({
      data: {
        companyId,
        workerId,
        fromDate: new Date('2026-08-01'),
        toDate: new Date('2026-08-02'),
        reason: 'rest',
        state: 'REQUESTED',
      },
    });

    const rows = await prisma.$queryRaw<QueueRow[]>`
      SELECT "sourceEntity", "audienceRole" FROM axhy."QueueItem"
      WHERE "companyId" = ${companyId}::uuid
      ORDER BY "sourceEntity"
    `;
    // May include leftovers from other tests' tenants — filter by what we just inserted
    const entities = rows.map((r) => r.sourceEntity);
    expect(entities).toContain('dwi');
    expect(entities).toContain('leave_request');

    await prisma.supervisorDecision.delete({ where: { id: dwi.id } });
    await prisma.leaveRequest.delete({ where: { id: lr.id } });
  });
});
