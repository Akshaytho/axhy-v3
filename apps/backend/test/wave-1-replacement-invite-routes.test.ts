/**
 * Wave 1 — ReplacementInvite (F28) end-to-end + cross-tenant tests.
 *
 * Single-recipient design (per `feedback_replacement_invite_single_recipient.md`,
 * locked 2026-05-18): supervisor sends ONE invite to ONE worker, 2-min TTL,
 * on terminal state may re-send to same or different worker.
 *
 * One comprehensive integration test exercises the full lifecycle across
 * supervisor + worker surfaces, plus cross-tenant isolation. Runs against
 * the Railway sandbox; cleanup is handled by `withMultipleTenants`'s
 * finally block.
 *
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(feedback_replacement_invite_single_recipient.md)
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
  test('full lifecycle + re-send after decline/expiry + cross-tenant isolation', async () => {
    await withMultipleTenants(
      { count: 2, supervisorsPerTenant: 1, prisma, prefix: `wave1-${Date.now()}-` },
      async ({ tenants, app }) => {
        const tenantA = tenants[0]!;
        const tenantB = tenants[1]!;
        const supA = tenantA.supervisors[0]!;
        const supB = tenantB.supervisors[0]!;

        // ── Seed: 2 workers on Tenant A, 1 on Tenant B (User + Membership + Worker) ─
        const seedWorker = async (
          companyId: string,
          tag: string,
        ): Promise<{ userId: string; workerId: string }> => {
          const phone = `+9188${String(Date.now() + Math.floor(Math.random() * 1_000_000)).slice(-8)}`;
          const user = await prisma.user.create({
            data: { phone, name: `${tag}-worker`, locale: 'en' },
          });
          await prisma.membership.create({
            data: { companyId, userId: user.id, role: 'WORKER', status: 'ACTIVE' },
          });
          const worker = await prisma.worker.create({
            data: { companyId, userId: user.id, name: `${tag}-worker`, phone, state: 'ACTIVE' },
          });
          return { userId: user.id, workerId: worker.id };
        };

        const workerA1 = await seedWorker(tenantA.companyId, 'A1');
        const workerA2 = await seedWorker(tenantA.companyId, 'A2');
        const workerB = await seedWorker(tenantB.companyId, 'B');

        const siteA = await prisma.site.create({
          data: {
            companyId: tenantA.companyId,
            name: 'Aparna Sarovar Grande',
            address: 'Kondapur, Hyderabad',
          },
        });
        await prisma.site.create({
          data: { companyId: tenantB.companyId, name: 'Tenant B Site', address: 'BLR' },
        });

        const { issueAccessToken } = await import('../src/lib/jwt.js');
        const tokenFor = async (userId: string, companyId: string): Promise<string> =>
          issueAccessToken({
            userId,
            companyId,
            role: 'WORKER',
            availableRoles: ['WORKER'],
            locale: 'en',
          });

        // ── 1. Supervisor A sends an invite to Worker A1 ──────────────────
        const scheduledStart = new Date(Date.now() + 60 * 60 * 1000);
        const create1 = await app.inject({
          method: 'POST',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {
            siteId: siteA.id,
            scheduledStart: scheduledStart.toISOString(),
            candidateUserId: workerA1.userId,
            expiresInSec: 60,
          },
        });
        expect(create1.statusCode).toBe(201);
        const invite1 = (create1.json() as { ok: true; invite: { id: string; status: string } })
          .invite;
        expect(invite1.status).toBe('PENDING');

        // ── 2. Cross-tenant negative — Sup B can't see Sup A's invite ─────
        const listB = await app.inject({
          method: 'GET',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supB.accessToken}` },
        });
        expect(listB.statusCode).toBe(200);
        expect((listB.json() as { invites: unknown[] }).invites).toHaveLength(0);

        // Sup B can't cancel Sup A's invite either.
        const cancelB = await app.inject({
          method: 'POST',
          url: `/supervisor/replacement-invites/${invite1.id}/cancel`,
          headers: { authorization: `Bearer ${supB.accessToken}` },
        });
        expect(cancelB.statusCode).toBe(404);

        // ── 3. Cross-tenant negative — Worker B can't accept A's invite ──
        const workerBToken = await tokenFor(workerB.userId, tenantB.companyId);
        const wrongAccept = await app.inject({
          method: 'POST',
          url: `/worker/replacement-invites/${invite1.id}/accept`,
          headers: { authorization: `Bearer ${workerBToken}` },
        });
        expect(wrongAccept.statusCode).toBe(404);

        // ── 4. Worker A1 declines the invite ──────────────────────────────
        const workerA1Token = await tokenFor(workerA1.userId, tenantA.companyId);
        const decline1 = await app.inject({
          method: 'POST',
          url: `/worker/replacement-invites/${invite1.id}/decline`,
          headers: { authorization: `Bearer ${workerA1Token}` },
          payload: { reason: 'cannot make it today' },
        });
        expect(decline1.statusCode).toBe(200);

        // Idempotency / double-decline → 409 ALREADY_DECIDED.
        const decline1Again = await app.inject({
          method: 'POST',
          url: `/worker/replacement-invites/${invite1.id}/decline`,
          headers: { authorization: `Bearer ${workerA1Token}` },
        });
        expect(decline1Again.statusCode).toBe(409);

        // ── 5. After decline, supervisor sends a fresh invite to Worker A2 ─
        const create2 = await app.inject({
          method: 'POST',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {
            siteId: siteA.id,
            scheduledStart: scheduledStart.toISOString(),
            candidateUserId: workerA2.userId,
            expiresInSec: 60,
          },
        });
        expect(create2.statusCode).toBe(201);
        const invite2 = (create2.json() as { ok: true; invite: { id: string } }).invite;

        // ── 6. Worker A2 accepts → Assignment auto-created ────────────────
        const workerA2Token = await tokenFor(workerA2.userId, tenantA.companyId);
        const accept2 = await app.inject({
          method: 'POST',
          url: `/worker/replacement-invites/${invite2.id}/accept`,
          headers: { authorization: `Bearer ${workerA2Token}` },
        });
        expect(accept2.statusCode).toBe(200);
        const accept2Body = accept2.json() as {
          ok: true;
          invite: { status: string };
          assignmentId: string;
        };
        expect(accept2Body.invite.status).toBe('ACCEPTED');
        expect(accept2Body.assignmentId).toBeTruthy();

        const assignment = await prisma.assignment.findFirst({
          where: { id: accept2Body.assignmentId, companyId: tenantA.companyId },
        });
        expect(assignment).not.toBeNull();
        expect(assignment!.workerId).toBe(workerA2.workerId);
        expect(assignment!.state).toBe('ACTIVE');

        // ── 7. Idempotent re-accept on the same invite → 409 ──────────────
        const reAccept = await app.inject({
          method: 'POST',
          url: `/worker/replacement-invites/${invite2.id}/accept`,
          headers: { authorization: `Bearer ${workerA2Token}` },
        });
        expect(reAccept.statusCode).toBe(409);

        // ── 8. Cancel flow — supervisor sends a 3rd invite and cancels it ─
        const create3 = await app.inject({
          method: 'POST',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {
            siteId: siteA.id,
            scheduledStart: scheduledStart.toISOString(),
            candidateUserId: workerA1.userId,
            expiresInSec: 60,
          },
        });
        expect(create3.statusCode).toBe(201);
        const invite3 = (create3.json() as { ok: true; invite: { id: string } }).invite;

        const cancelOk = await app.inject({
          method: 'POST',
          url: `/supervisor/replacement-invites/${invite3.id}/cancel`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
        });
        expect(cancelOk.statusCode).toBe(200);
        const cancelledRow = await prisma.replacementInvite.findFirstOrThrow({
          where: { id: invite3.id, companyId: tenantA.companyId },
        });
        expect(cancelledRow.status).toBe('CANCELLED');
        expect(cancelledRow.respondReason).toBe('supervisor_cancelled');

        // Cancel a terminal-state invite → 409.
        const cancelAgain = await app.inject({
          method: 'POST',
          url: `/supervisor/replacement-invites/${invite3.id}/cancel`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
        });
        expect(cancelAgain.statusCode).toBe(409);

        // ── 9. Expiry sweep — create + force-expire + run sweep ───────────
        const create4 = await app.inject({
          method: 'POST',
          url: '/supervisor/replacement-invites',
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {
            siteId: siteA.id,
            scheduledStart: scheduledStart.toISOString(),
            candidateUserId: workerA1.userId,
            expiresInSec: 30,
          },
        });
        expect(create4.statusCode).toBe(201);
        const invite4 = (create4.json() as { ok: true; invite: { id: string } }).invite;
        await prisma.replacementInvite.update({
          where: { id: invite4.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });

        const sweep = await sweepExpiredReplacementInvites(prisma);
        expect(sweep.expiredCount).toBeGreaterThanOrEqual(1);
        expect(sweep.outcomeDecisionsEmitted).toBeGreaterThanOrEqual(1);

        const outcome = await prisma.supervisorDecision.findFirst({
          where: {
            companyId: tenantA.companyId,
            kind: 'REPLACEMENT_INVITE_OUTCOME',
            targetId: invite4.id,
          },
        });
        expect(outcome).not.toBeNull();
        expect(outcome!.tier).toBe('OPERATIONAL');

        // ── 10. Cadence gate — first-boot returns ran:false ───────────────
        _resetSweepMarkerForTesting();
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
        const firstBoot = await maybeRunReplacementInviteExpirySweep(prisma, log);
        expect(firstBoot.ran).toBe(false);
        const inWindow = await maybeRunReplacementInviteExpirySweep(prisma, log);
        expect(inWindow.ran).toBe(false);

        // ── 11. Audit chain integrity ─────────────────────────────────────
        const audits = await prisma.auditEvent.findMany({
          where: {
            companyId: tenantA.companyId,
            kind: {
              in: [
                'REPLACEMENT_INVITE_SENT',
                'REPLACEMENT_INVITE_ACCEPTED',
                'REPLACEMENT_INVITE_DECLINED',
                'REPLACEMENT_INVITE_CANCELLED',
                'REPLACEMENT_INVITE_OUTCOME_DECISION_EMITTED',
              ],
            },
          },
          orderBy: { createdAt: 'asc' },
        });
        // 4 sends + 1 accept + 1 decline + 1 cancel + 1 outcome = 8 events.
        expect(audits.length).toBeGreaterThanOrEqual(8);
      },
    );
  }, 90000);
});
