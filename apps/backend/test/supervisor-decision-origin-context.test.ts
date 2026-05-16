/**
 * Real-DB integration test: SupervisorDecision.originContext + proposedDuringAbsence.
 *
 * Layer 1 PR 2. Verifies the two new columns on the existing SupervisorDecision
 * table (closure Decision 7):
 *   - originContext (JSONB nullable) — travels with the row across binding changes
 *   - proposedDuringAbsence (boolean default false) — set when originator was
 *     inside an active acting-coverage window
 *
 * Only covers persistence shape, not the population semantics (those are
 * service-layer concerns landing in later PRs).
 *
 * @derives(workflow-design-closure §3.2 + Decision 7)
 * @derives(panel-2026-05-15) — Layer 1 PR 2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `dwi-origin-${Date.now()}-`;

let companyId: string;
let supervisorUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999600001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const sup = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 500).slice(-7),
      name: 'Supervisor',
      locale: 'te',
      companyId,
    },
  });
  supervisorUserId = sup.id;
  await prisma.membership.create({
    data: { companyId, userId: sup.id, role: 'SUPERVISOR' },
  });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('SupervisorDecision.originContext + proposedDuringAbsence', () => {
  it('persists null originContext + false proposedDuringAbsence by default', async () => {
    const d = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: supervisorUserId,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: '00000000-0000-0000-0000-000000000001',
        payload: { reason: 'no_show' },
      },
    });
    expect(d.originContext).toBeNull();
    expect(d.proposedDuringAbsence).toBe(false);

    await prisma.supervisorDecision.delete({ where: { id: d.id } });
  });

  it('persists a full originContext JSONB and proposedDuringAbsence=true', async () => {
    const originContext = {
      authorUserId: supervisorUserId,
      chatExcerpt: 'I would like to propose terminating worker X due to repeated no-shows...',
      recentDecisions: [
        { id: 'd1', kind: 'MARK_ABSENT', date: '2026-05-10' },
        { id: 'd2', kind: 'MARK_ABSENT', date: '2026-05-12' },
      ],
      workerHistory: { joinedAt: '2025-08-01', complaints: 3 },
      capturedAt: '2026-05-15T10:30:00Z',
    };

    const d = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: supervisorUserId,
        kind: 'TERMINATE_WORKER',
        tier: 'EMPLOYMENT',
        targetId: '00000000-0000-0000-0000-000000000002',
        payload: { reason: 'repeated_no_show' },
        ackRequired: true,
        originContext,
        proposedDuringAbsence: true,
      },
    });

    expect(d.proposedDuringAbsence).toBe(true);
    expect(d.originContext).not.toBeNull();
    const ctx = d.originContext as Record<string, unknown>;
    expect(ctx.authorUserId).toBe(supervisorUserId);
    expect(ctx.chatExcerpt).toContain('terminating worker X');
    expect(Array.isArray(ctx.recentDecisions)).toBe(true);
    expect((ctx.recentDecisions as unknown[]).length).toBe(2);

    // Verify the JSONB is queryable as JSON, not stringified
    const rows = await prisma.$queryRaw<Array<{ author: string }>>`
      SELECT "originContext"->>'authorUserId' AS author
      FROM axhy."SupervisorDecision"
      WHERE "id" = ${d.id}::uuid
    `;
    expect(rows[0].author).toBe(supervisorUserId);

    await prisma.supervisorDecision.delete({ where: { id: d.id } });
  });
});
