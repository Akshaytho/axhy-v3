/**
 * HRUpdateAck integration test — company-wide who-acked report (feature 2).
 *
 * Real-DB test (no mocks) for the HRUpdateAck join table + the supervisor
 * ack-write and HR who-acked read wired in migration 032 / commits d6bf1d2 +
 * 2ab8ebc. Mirrors the hr-water-flow harness (withMultipleTenants + issued
 * JWTs + app.inject + direct Prisma assertions).
 *
 * Flow (all real routes, real DB):
 *   POST /hr/updates                              — HR publishes a company-wide
 *                                                   update requiring ack
 *   POST /supervisor/updates/:id/acknowledge ×2   — two supervisors ack (own words)
 *   GET  /hr/updates                              — HR reads the who-acked report
 *
 * Contracts proven:
 *   - A company-wide update is acked by MANY supervisors (one HRUpdateAck row
 *     per update × supervisor), not the single legacy acknowledgedBy.
 *   - GET /hr/updates returns real acks[] + ackCount + expectedAcks, where
 *     expectedAcks = active SUPERVISOR count in the tenant.
 *   - Re-acking is idempotent on (hrUpdateId, supervisorUserId): the row's
 *     ackText/ackedAt update in place, no duplicate row, ackCount stays stable.
 *
 * NOTE: requires migration 032 (axhy.HRUpdateAck) applied to the target DB.
 *
 * @derives(workflow-design-closure §7 — HR updates ack)
 * @derives(feedback_persona_graph_route_audit.md — real-DB cross-route test)
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('HRUpdateAck — company-wide who-acked report, real DB', () => {
  test('publish company-wide update → 2 supervisors ack → who-acked report is real + idempotent', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 3, prisma, prefix: `hr-ack-${Date.now()}-` },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const hrSeat = tenant.supervisors[0]!; // promoted to HR (authors + reads)
        const sup1 = tenant.supervisors[1]!;
        const sup2 = tenant.supervisors[2]!;

        // Promote one seat to HR so it can author + read the who-acked report.
        await prisma.membership.update({
          where: { id: hrSeat.membershipId },
          data: { role: 'HR' },
        });

        const { issueAccessToken } = await import('../src/lib/jwt.js');
        const hrToken = await issueAccessToken({
          userId: hrSeat.userId,
          companyId: tenant.companyId,
          role: 'HR',
          availableRoles: ['HR'],
          locale: 'en',
        });

        // ── Step 1: HR publishes a company-wide update requiring ack ──────
        const createRes = await app.inject({
          method: 'POST',
          url: '/hr/updates',
          headers: { authorization: `Bearer ${hrToken}`, 'content-type': 'application/json' },
          payload: {
            kind: 'POLICY_CHANGE',
            content: 'New weekend shift policy effective next month — please brief your teams.',
            audience: 'all',
            acknowledgmentRequired: true,
          },
        });
        expect(createRes.statusCode).toBe(201);
        const { id: updateId } = createRes.json() as { id: string };
        expect(updateId).toBeTruthy();

        // ── Step 2: two supervisors acknowledge in their own words (≥5) ───
        const ackText1 = 'Understood, I will brief my weekend team today';
        const ackText2 = 'Got it, will update the roster accordingly this week';
        for (const [sup, text] of [
          [sup1, ackText1],
          [sup2, ackText2],
        ] as const) {
          const ackRes = await app.inject({
            method: 'POST',
            url: `/supervisor/updates/${updateId}/acknowledge`,
            headers: {
              authorization: `Bearer ${sup.accessToken}`,
              'content-type': 'application/json',
            },
            payload: { text },
          });
          expect(ackRes.statusCode).toBe(200);
        }

        // ── DB layer: exactly 2 HRUpdateAck rows for this update ──────────
        const ackRows = await prisma.hRUpdateAck.findMany({
          where: { hrUpdateId: updateId },
          orderBy: { ackedAt: 'asc' },
        });
        expect(ackRows).toHaveLength(2);
        expect(new Set(ackRows.map((r) => r.supervisorUserId))).toEqual(
          new Set([sup1.userId, sup2.userId]),
        );
        expect(ackRows.every((r) => r.companyId === tenant.companyId)).toBe(true);

        // ── Step 3: HR reads the who-acked report (real acks + counts) ────
        const reportRes = await app.inject({
          method: 'GET',
          url: '/hr/updates',
          headers: { authorization: `Bearer ${hrToken}` },
        });
        expect(reportRes.statusCode).toBe(200);
        const { updates } = reportRes.json() as {
          updates: Array<{
            id: string;
            ackCount: number;
            expectedAcks: number;
            acks: Array<{ supervisorUserId: string; supervisorName: string; ackText: string }>;
          }>;
        };
        const row = updates.find((u) => u.id === updateId);
        expect(row).toBeTruthy();
        // Real who-acked: 2 of the 2 active supervisors (3rd seat is HR now).
        expect(row!.ackCount).toBe(2);
        expect(row!.expectedAcks).toBe(2);
        expect(row!.acks).toHaveLength(2);
        // Each ack carries the supervisor's name + own-words text.
        const byUser = new Map(row!.acks.map((a) => [a.supervisorUserId, a]));
        expect(byUser.get(sup1.userId)?.ackText).toBe(ackText1);
        expect(byUser.get(sup2.userId)?.ackText).toBe(ackText2);
        expect(byUser.get(sup1.userId)?.supervisorName).toBe(sup1.name);

        // ── Step 4: re-ack is idempotent (no duplicate row, text updates) ─
        const newText = 'Re-confirming, briefed the team and updated the board';
        const reackRes = await app.inject({
          method: 'POST',
          url: `/supervisor/updates/${updateId}/acknowledge`,
          headers: {
            authorization: `Bearer ${sup1.accessToken}`,
            'content-type': 'application/json',
          },
          payload: { text: newText },
        });
        expect(reackRes.statusCode).toBe(200);

        const ackRowsAfter = await prisma.hRUpdateAck.findMany({
          where: { hrUpdateId: updateId },
        });
        expect(ackRowsAfter).toHaveLength(2); // still 2 — unique(hrUpdateId, supervisorUserId)
        const sup1Row = ackRowsAfter.find((r) => r.supervisorUserId === sup1.userId);
        expect(sup1Row?.ackText).toBe(newText); // text updated in place

        // ── Cleanup (best-effort; company-delete cascades HRUpdate→Ack) ───
        try {
          await prisma.hRUpdateAck.deleteMany({ where: { hrUpdateId: updateId } });
          await prisma.hRUpdate.deleteMany({ where: { id: updateId } });
        } catch {
          // best-effort
        }
      },
    );
  }, 120_000);
});
