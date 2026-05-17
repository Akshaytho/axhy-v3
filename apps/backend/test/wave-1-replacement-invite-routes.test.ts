/**
 * Wave 1 — ReplacementInvite (F28) end-to-end + race + cross-tenant tests.
 *
 * Single comprehensive integration test that exercises the full lifecycle of
 * a broadcast group across the supervisor + worker surfaces, plus the
 * critical race condition (3 simultaneous accepts → exactly one wins) and
 * cross-tenant isolation (Tenant A supervisor cannot enumerate / cancel /
 * see Tenant B's invites; Tenant B worker cannot accept Tenant A's invite).
 *
 * Runs against the Railway sandbox DB. Test cleanup happens in
 * `withMultipleTenants`'s finally block; no manual teardown required.
 *
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(panel-2026-05-18) — Wave 1 backend
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { sweepExpiredReplacementInvites } from '../src/lib/services/replacement-invite-service.js';
import {
  _resetSweepMarkerForTesting,
  maybeRunReplacementInviteExpirySweep,
} from '../src/jobs/replacement-invite-expiry-sweep.js';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Wave 1 — ReplacementInvite (F28) end-to-end', () => {
  test('full lifecycle + race + cross-tenant isolation', async () => {
    await withMultipleTenants(
      { count: 2, supervisorsPerTenant: 1, prisma, prefix: `wave1-${Date.now()}-` },
      async ({ tenants, app }) => {
        const tenantA = tenants[0]!;
        const tenantB = tenants[1]!;
        const supA = tenantA.supervisors[0]!;
        const supB = tenantB.supervisors[0]!;

        // ── Seed: 3 worker Users + Worker rows + Memberships in Tenant A ───
        // Also seed 1 worker in Tenant B for cross-tenant testing.
        const seedWorkers = async (
          companyId: string,
          count: number,
          tag: string,
        ): Promise<Array<{ userId: string; workerId: string }>> => {
          const out: Array<{ userId: string; workerId: string }> = [];
          const baseTs = Date.now();
          for (let i = 0; i < count; i++) {
            const phone = `+9188${String(baseTs + Math.floor(Math.random() * 1_000_000) + i).slice(-8)}`;
            const user = await prisma.user.create({
              data: { phone, name: `${tag} Worker ${i}`, locale: 'en' },
            });
            await prisma.membership.create({
              data: { companyId, userId: user.id, role: 'WORKER', status: 'ACTIVE' },
            });
            const worker = await prisma.worker.create({
              data: {
                companyId,
                userId: user.id,
                name: `${tag} Worker ${i}`,
                phone,
                state: 'ACTIVE',
              },
            });
            out.push({ userId: user.id, workerId: worker.id });
          }
          return out;
        };

        const workersA = await seedWorkers(tenantA.companyId, 3, 'A');
        const workersB = await seedWorkers(tenantB.companyId, 1, 'B');

        // ── Seed: site on tenant A ─────────────────────────────────────────
        const siteA = await prisma.site.create({
          data: {
            companyId: tenantA.companyId,
            name: 'Aparna Sarovar Grande',
            address: 'Kondapur, Hyderabad',
          },
        });
        // Site on tenant B (for cross-tenant negative test).
        const siteB = await prisma.site.create({
          data: {
            companyId: tenantB.companyId,
            name: 'Tenant B Site',
            address: 'BLR',
          },
        });

        // ── 1. Supervisor A creates a broadcast to all 3 workers ───────────
        const scheduledStart = new Date(Date.now() + 60 * 60 * 1000); // +1h
        const createRes = await app.inject({
          method: 'POST',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {
            siteId: siteA.id,
            scheduledStart: scheduledStart.toISOString(),
            candidateUserIds: workersA.map((w) => w.userId),
            expiresInSec: 60,
          },
        });
        expect(createRes.statusCode).toBe(201);
        const createBody = createRes.json() as {
          ok: true;
          groupId: string;
          invites: Array<{ id: string; toWorkerId: string; status: string }>;
        };
        expect(createBody.ok).toBe(true);
        expect(createBody.invites).toHaveLength(3);
        expect(createBody.invites.every((i) => i.status === 'PENDING')).toBe(true);
        const groupId = createBody.groupId;

        // ── 2. Cross-tenant negative — Sup B should NOT see Sup A's group ──
        const listB = await app.inject({
          method: 'GET',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supB.accessToken}` },
        });
        expect(listB.statusCode).toBe(200);
        const listBBody = listB.json() as { invites: unknown[] };
        expect(listBBody.invites).toHaveLength(0);

        // Sup B cannot cancel Sup A's group either.
        const cancelB = await app.inject({
          method: 'POST',
          url: `/supervisor/replacement-invites/${groupId}/cancel`,
          headers: { authorization: `Bearer ${supB.accessToken}` },
        });
        expect(cancelB.statusCode).toBe(404);

        // ── 3. Cross-tenant negative — Worker on tenant B (with its own ────
        //     access token issued separately) cannot accept tenant A's invite.
        //     We use a worker User from tenant B and craft a JWT for them.
        const { issueAccessToken } = await import('../src/lib/jwt.js');
        const workerBToken = await issueAccessToken({
          userId: workersB[0]!.userId,
          companyId: tenantB.companyId,
          role: 'WORKER',
          availableRoles: ['WORKER'],
          locale: 'en',
        });
        const wrongTenantAccept = await app.inject({
          method: 'POST',
          url: `/worker/replacement-invites/${createBody.invites[0]!.id}/accept`,
          headers: { authorization: `Bearer ${workerBToken}` },
        });
        // The middleware filters by auth.companyId so the lookup is scoped
        // to tenant B; the invite belongs to tenant A → 404 NOT_FOUND.
        expect(wrongTenantAccept.statusCode).toBe(404);

        // ── 4. Race: 3 workers tap accept simultaneously — exactly one wins ─
        const issueWorkerToken = async (userId: string, companyId: string): Promise<string> =>
          issueAccessToken({
            userId,
            companyId,
            role: 'WORKER',
            availableRoles: ['WORKER'],
            locale: 'en',
          });

        const tokens = await Promise.all(
          workersA.map((w) => issueWorkerToken(w.userId, tenantA.companyId)),
        );
        const responses = await Promise.all(
          createBody.invites.map((inv, idx) =>
            app.inject({
              method: 'POST',
              url: `/worker/replacement-invites/${inv.id}/accept`,
              headers: { authorization: `Bearer ${tokens[idx]!}` },
            }),
          ),
        );
        const acceptedResponses = responses.filter((r) => r.statusCode === 200);
        const conflictResponses = responses.filter((r) => r.statusCode === 409);
        expect(acceptedResponses).toHaveLength(1);
        expect(conflictResponses).toHaveLength(2);
        const winnerBody = acceptedResponses[0]!.json() as {
          ok: true;
          invite: { id: string; status: string; groupId: string };
          assignmentId: string;
          expiredSiblingCount: number;
        };
        expect(winnerBody.invite.status).toBe('ACCEPTED');
        expect(winnerBody.expiredSiblingCount).toBe(2);
        expect(winnerBody.assignmentId).toBeTruthy();

        // The two losers should both have status='EXPIRED' + reason='sibling_accepted'
        const losers = await prisma.replacementInvite.findMany({
          where: {
            companyId: tenantA.companyId,
            groupId,
            id: { not: winnerBody.invite.id },
          },
        });
        expect(losers).toHaveLength(2);
        expect(losers.every((l) => l.status === 'EXPIRED')).toBe(true);
        expect(losers.every((l) => l.respondReason === 'sibling_accepted')).toBe(true);

        // ── 5. Idempotent re-accept attempt by winner — 409 ALREADY_DECIDED ─
        const winnerWorkerIdx = createBody.invites.findIndex((i) => i.id === winnerBody.invite.id);
        const reAccept = await app.inject({
          method: 'POST',
          url: `/worker/replacement-invites/${winnerBody.invite.id}/accept`,
          headers: { authorization: `Bearer ${tokens[winnerWorkerIdx]!}` },
        });
        expect(reAccept.statusCode).toBe(409);

        // ── 6. Assignment was created for the winning worker ───────────────
        const winnerWorker = workersA[winnerWorkerIdx]!;
        const assignment = await prisma.assignment.findFirst({
          where: { id: winnerBody.assignmentId, companyId: tenantA.companyId },
        });
        expect(assignment).not.toBeNull();
        expect(assignment!.workerId).toBe(winnerWorker.workerId);
        expect(assignment!.siteId).toBe(siteA.id);
        expect(assignment!.state).toBe('ACTIVE');

        // ── 7. Audit + Notification rows landed ────────────────────────────
        const sentAudits = await prisma.auditEvent.count({
          where: {
            companyId: tenantA.companyId,
            kind: 'REPLACEMENT_INVITE_SENT',
          },
        });
        expect(sentAudits).toBe(3);
        const acceptedAudit = await prisma.auditEvent.findFirst({
          where: { companyId: tenantA.companyId, kind: 'REPLACEMENT_INVITE_ACCEPTED' },
        });
        expect(acceptedAudit).not.toBeNull();
        const winnerPush = await prisma.notification.findFirst({
          where: {
            companyId: tenantA.companyId,
            audienceUserId: supA.userId,
            kind: 'replacement_invite',
          },
        });
        expect(winnerPush).not.toBeNull();

        // ── 8. List on Sup A side — group is visible, scoped to caller ─────
        const listA = await app.inject({
          method: 'GET',
          url: `/supervisor/replacement-invites?groupId=${groupId}`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
        });
        expect(listA.statusCode).toBe(200);
        const listABody = listA.json() as {
          invites: Array<{ status: string }>;
          nextCursor: string | null;
        };
        expect(listABody.invites).toHaveLength(3);
        expect(listABody.invites.filter((i) => i.status === 'ACCEPTED')).toHaveLength(1);
        expect(listABody.invites.filter((i) => i.status === 'EXPIRED')).toHaveLength(2);

        // ── 9. New group + cancel flow ─────────────────────────────────────
        const create2 = await app.inject({
          method: 'POST',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {
            siteId: siteA.id,
            scheduledStart: scheduledStart.toISOString(),
            candidateUserIds: [workersA[0]!.userId, workersA[1]!.userId],
            expiresInSec: 60,
          },
        });
        expect(create2.statusCode).toBe(201);
        const group2 = (create2.json() as { groupId: string }).groupId;

        const cancelOk = await app.inject({
          method: 'POST',
          url: `/supervisor/replacement-invites/${group2}/cancel`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
        });
        expect(cancelOk.statusCode).toBe(200);
        expect((cancelOk.json() as { cancelledCount: number }).cancelledCount).toBe(2);
        const cancelledRows = await prisma.replacementInvite.findMany({
          where: { companyId: tenantA.companyId, groupId: group2 },
        });
        expect(cancelledRows.every((r) => r.status === 'CANCELLED')).toBe(true);

        // ── 10. Expiry sweep — create a group, force expiry, run sweep ────
        const create3 = await app.inject({
          method: 'POST',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {
            siteId: siteA.id,
            scheduledStart: scheduledStart.toISOString(),
            candidateUserIds: [workersA[2]!.userId],
            expiresInSec: 30,
          },
        });
        expect(create3.statusCode).toBe(201);
        const group3Id = (create3.json() as { groupId: string }).groupId;
        // Force expiresAt to the past so the sweep picks it up immediately.
        await prisma.replacementInvite.updateMany({
          where: { companyId: tenantA.companyId, groupId: group3Id, status: 'PENDING' },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });

        const sweepResult = await sweepExpiredReplacementInvites(prisma);
        expect(sweepResult.expiredCount).toBeGreaterThanOrEqual(1);
        expect(sweepResult.outcomeDecisionsEmitted).toBeGreaterThanOrEqual(1);

        // Outcome SupervisorDecision row exists, keyed on groupId.
        const outcomeDecision = await prisma.supervisorDecision.findFirst({
          where: {
            companyId: tenantA.companyId,
            kind: 'REPLACEMENT_INVITE_OUTCOME',
            targetId: group3Id,
          },
        });
        expect(outcomeDecision).not.toBeNull();
        expect(outcomeDecision!.tier).toBe('OPERATIONAL');

        // ── 11. Cadence gate — maybeRunReplacementInviteExpirySweep ────────
        // First call: first-boot marker bumped, no real work.
        _resetSweepMarkerForTesting();
        const { Logger } = await import('../src/lib/log.js').catch(() => ({ Logger: null }));
        // Use a minimal logger stub since we don't need its output here.
        const log = {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
          debug: () => undefined,
          trace: () => undefined,
          fatal: () => undefined,
          child: () => log,
          level: 'info',
        } as unknown as Parameters<typeof maybeRunReplacementInviteExpirySweep>[1];
        void Logger; // suppress unused-import lint if path resolution failed
        const firstBoot = await maybeRunReplacementInviteExpirySweep(prisma, log);
        expect(firstBoot.ran).toBe(false);
        // Second call within the window — still skipped.
        const inWindow = await maybeRunReplacementInviteExpirySweep(prisma, log);
        expect(inWindow.ran).toBe(false);
      },
    );
  }, 90000);
});
