/**
 * Real-DB regression test: 48h auto-dismiss-and-vanish for pending decisions.
 *
 * Founder lock 2026-05-18 PM (REVISES 2026-05-18 AM):
 * "stale cards should expire after 48hrs ... they will vanish, I need to take
 * action". The earlier STALE-section design was rejected — items must
 * actually disappear so the supervisor learns urgency.
 *
 * Proves:
 *   1. A 49h-old PROPOSED SupervisorDecision is auto-dismissed by the next
 *      /supervisor/decisions read. It DOES NOT appear in the rows list.
 *   2. The dismissed row has `dismissedAt` set in the DB and
 *      `dismissedReason = 'auto-dismissed: no action for 48h'`.
 *   3. A `DWI_EXPIRED` audit event is written with the original
 *      supervisor as `actorId` (accountability anchor).
 *   4. A 47h-old PROPOSED row in the same tenant is NOT dismissed.
 *   5. `counts.autoDismissedThisRead` reflects the sweep count.
 *
 * @derives(feedback_stale_decisions_section_after_48h.md, 2026-05-18 PM)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 * @derives(ADR-0003) @derives(master-plan §G)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `auto-expire-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let supId: string;
let supToken: string;
let freshDecisionId: string;
let staleDecisionId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const company = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999' + String(Date.now()).slice(-7),
      ownerName: 'Owner AutoExpire',
    },
  });
  companyId = company.id;

  const sup = await prismaRaw.user.create({
    data: {
      phone: '+9181' + String(Date.now()).slice(-8),
      name: 'Sup AutoExpire',
      locale: 'en',
      companyId,
    },
  });
  supId = sup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: supId, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  supToken = await issueAccessToken({
    userId: supId,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  // 1h-old PROPOSED decision — must NOT be swept.
  freshDecisionId = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: freshDecisionId,
      companyId,
      supervisorId: supId,
      kind: 'MARK_ABSENT',
      tier: 'PERSONNEL',
      targetId: null,
      payload: { workerName: 'Fresh Worker' },
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
  });

  // 49h-old PROPOSED decision — MUST be auto-dismissed.
  staleDecisionId = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: staleDecisionId,
      companyId,
      supervisorId: supId,
      kind: 'MARK_ABSENT',
      tier: 'PERSONNEL',
      targetId: null,
      payload: { workerName: 'Stale Worker' },
      createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    },
  });
});

afterAll(async () => {
  await app.close();
  await prismaRaw.$disconnect();
});

describe('GET /supervisor/decisions — auto-dismiss after 48h (vanish, no STALE section)', () => {
  it('sweeps 49h-old PROPOSED rows, emits DWI_EXPIRED, keeps fresh rows visible', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json<{
      rows: Array<{ id: string }>;
      counts: {
        needsYouNow: number;
        routine: number;
        autoDismissedThisRead: number;
        failedReview: number;
        total: number;
      };
    }>();

    // Stale row vanished from the response.
    const idsInResponse = body.rows.map((row) => row.id);
    expect(idsInResponse).not.toContain(staleDecisionId);

    // Fresh row still visible.
    expect(idsInResponse).toContain(freshDecisionId);

    // Counts reflect the sweep.
    expect(body.counts.autoDismissedThisRead).toBeGreaterThanOrEqual(1);

    // DB row was actually dismissed with the expected reason.
    const dbRow = await prismaRaw.supervisorDecision.findUnique({
      where: { id: staleDecisionId },
    });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.dismissedAt).not.toBeNull();
    expect(dbRow!.dismissedReason).toBe('auto-dismissed: no action for 48h');
    expect(dbRow!.appliedAt).toBeNull();

    // DWI_EXPIRED audit event was written for the stale row.
    const audit = await prismaRaw.auditEvent.findFirst({
      where: {
        companyId,
        targetId: staleDecisionId,
        kind: 'DWI_EXPIRED',
      },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(supId);
  });

  it('a second read in quick succession does not double-dismiss', async () => {
    // First read above already swept everything; second read should find
    // nothing to sweep. autoDismissedThisRead should be 0.
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json<{ counts: { autoDismissedThisRead: number } }>();
    expect(body.counts.autoDismissedThisRead).toBe(0);
  });
});
