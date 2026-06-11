/**
 * Swap-request supervisor routes.
 *
 * POST /swap-requests   (OPERATIONAL tier, single-tap confirm)
 *   Supervisor swaps fromWorker off siteId in favor of toWorker, effective
 *   at a future time. Inside one Prisma transaction:
 *     1. Verify both workers + site belong to caller's company
 *     2. Reject same-worker swap (parser already checks; double-check at DB)
 *     3. Reject past effectiveAt
 *     4. Create SwapRequest row in SENT state
 *     5. Record AuditEvent (kind = SWAP_REQUEST_SENT)
 *     6. Enqueue Outbox topics — gupshup.send for each affected worker
 *
 *   Both workers get a WhatsApp notification (Phase C real send; today the
 *   dispatcher logs). Acceptance/decline by workers transitions the row to
 *   ACCEPTED/DECLINED in a future route (Phase D worker mobile).
 *
 * @derives(data-flow §5 — swap worker OPERATIONAL tier)
 * @derives(panel-2026-05-08) — Phase B.5
 */

import type { FastifyInstance } from 'fastify';
import {
  CreateSwapRequestInput,
  SwapDecisionInput,
  type SwapDecisionOutputT,
} from '@axhy/shared-schema';
import type { CreateSwapRequestOutput } from '@axhy/shared-schema';
import { swapRequest as swapRequestMachine, type SwapRequestState } from '@axhy/state-machines';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { createSwapRequestService } from '../lib/services/swap-request-service.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import { enqueueOutbox } from '../lib/outbox.js';
import { getSitesSupervisedByUser } from '../lib/effective-responsibility.js';

/**
 * Register swap-request supervisor routes.
 *
 * @derives(ADR-0007) — JWT + tenant-context middleware
 * @derives(data-flow §5 — swap worker OPERATIONAL tier)
 */
export async function registerSwapRequestRoutes(app: FastifyInstance): Promise<void> {
  app.post('/swap-requests', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    const parsed = CreateSwapRequestInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    if (auth.role !== 'SUPERVISOR') {
      reply.code(403).send({ error: 'SUPERVISOR_ROLE_REQUIRED' });
      return;
    }

    const { fromWorkerId, toWorkerId, siteId, effectiveAt, reason } = parsed.data;
    const effectiveDate = new Date(effectiveAt);
    if (effectiveDate.getTime() <= Date.now()) {
      reply.code(400).send({
        error: 'BAD_INPUT',
        message: 'effectiveAt must be in the future',
      });
      return;
    }

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const portfolio = await getSitesSupervisedByUser(tx, {
          companyId: auth.companyId,
          userId: auth.userId,
        });
        if (!portfolio.some((p) => p.siteId === siteId)) {
          return { kind: 'NOT_RESPONSIBLE' as const };
        }
        return createSwapRequestService(
          tx,
          { fromWorkerId, toWorkerId, siteId, effectiveAt, reason: reason ?? null },
          { companyId: auth.companyId, userId: auth.userId },
        );
      });

      if (out.kind === 'NOT_RESPONSIBLE') {
        reply
          .code(403)
          .send({ error: 'NOT_RESPONSIBLE', message: 'Site is not in your portfolio' });
        return;
      }
      if (out.kind === 'WORKER_NOT_FOUND') {
        reply.code(404).send({
          error: 'WORKER_NOT_FOUND',
          message: `${out.which} not found in this company`,
        });
        return;
      }
      if (out.kind === 'SITE_NOT_FOUND') {
        reply.code(404).send({
          error: 'SITE_NOT_FOUND',
          message: 'Site not found in this company',
        });
        return;
      }

      const result: CreateSwapRequestOutput = {
        ok: true,
        swapRequestId: out.swap.id,
        fromWorkerId: out.swap.fromWorkerId,
        toWorkerId: out.swap.toWorkerId,
        siteId: out.swap.siteId,
        state: out.swap.state as CreateSwapRequestOutput['state'],
        effectiveAt: out.swap.effectiveAt.toISOString(),
        createdAt: out.swap.createdAt.toISOString(),
      };
      reply.send(result);
    } catch (err) {
      req.log.error({ err }, 'create-swap-request failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not create swap request' });
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // POST /swap-requests/:id/decide  (Wave 2 — Decisions queue accept/reject)
  //
  // A SwapRequest in SENT state is awaiting the receiving supervisor's
  // decision. The receiving supervisor is the one whose portfolio currently
  // contains the swap's `siteId`. The body distinguishes:
  //
  //   - decision='approve'        — Accept; transitions to ACCEPTED.
  //   - decision='reject'         — Reject; transitions to DECLINED. Reason
  //                                  is required (Zod refine).
  //   - decision='approve_anyway' — Skill-mismatch override; transitions to
  //                                  ACCEPTED. Requires `overrideToken === 'OVERRIDE'`
  //                                  (Zod refine). Reserved for the
  //                                  TwoButtonWithWarning card variant.
  //
  // Cross-tenant: the WHERE on `companyId` ensures Tenant A's supervisor
  // cannot decide on Tenant B's swap (404). Within-tenant cross-supervisor
  // isolation: site must be in the caller's portfolio (403).
  //
  // @derives(Wave 2 plan §3E — actions[] must point to a real route)
  // @derives(drawer-redesign §B.4 — SWAP_REQUEST_PENDING card variants)
  // ───────────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/swap-requests/:id/decide',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      const { id } = req.params;
      if (!id) {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'Missing :id route param' });
        return;
      }

      const parsed = SwapDecisionInput.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      try {
        const result = await withTenantContext(prisma, auth.companyId, async (tx) => {
          const swap = await tx.swapRequest.findFirst({
            where: { id, companyId: auth.companyId },
            include: {
              fromWorker: { select: { id: true, name: true, phone: true } },
              toWorker: { select: { id: true, name: true, phone: true } },
              site: { select: { id: true, name: true } },
            },
          });
          if (!swap) return { kind: 'NOT_FOUND' as const };
          // Ledger #20: the SwapRequest machine is the legality authority.
          // SENT is the only non-terminal state, so isTerminal() is equivalent
          // to the prior `state !== 'SENT'` decidability check.
          if (swapRequestMachine.isTerminal(swap.state as SwapRequestState)) {
            return { kind: 'ALREADY_DECIDED' as const, state: swap.state };
          }

          // Authorisation: caller must be the supervisor currently bound to
          // the swap's site (or the original initiator).
          const portfolio = await getSitesSupervisedByUser(tx, {
            companyId: auth.companyId,
            userId: auth.userId,
          });
          const portfolioSiteIds = new Set(portfolio.map((p) => p.siteId));
          const isInitiator = swap.supervisorId === auth.userId;
          const isResponsibleSupervisor = portfolioSiteIds.has(swap.siteId);
          if (!isInitiator && !isResponsibleSupervisor) {
            return { kind: 'NOT_RESPONSIBLE' as const };
          }

          const decidedAt = new Date();
          const isApprove =
            parsed.data.decision === 'approve' || parsed.data.decision === 'approve_anyway';
          const newState: 'ACCEPTED' | 'DECLINED' = isApprove ? 'ACCEPTED' : 'DECLINED';

          // Race-safe conditional transition (mirrors leave-requests.ts:300-317):
          // including state='SENT' in the WHERE means two concurrent deciders
          // cannot both win — PG row-locks the row and re-evaluates the predicate,
          // so exactly one gets count=1; the loser sees count=0 → ALREADY_DECIDED.
          const updateResult = await tx.swapRequest.updateMany({
            where: { id: swap.id, companyId: auth.companyId, state: 'SENT' },
            data: { state: newState, decidedAt },
          });
          if (updateResult.count === 0) {
            const after = await tx.swapRequest.findFirstOrThrow({
              where: { id: swap.id, companyId: auth.companyId },
              select: { state: true },
            });
            return { kind: 'ALREADY_DECIDED' as const, state: after.state };
          }
          const updated = await tx.swapRequest.findFirstOrThrow({
            where: { id: swap.id, companyId: auth.companyId },
          });

          await recordAuditEvent(tx, {
            companyId: auth.companyId,
            kind: isApprove ? 'SWAP_REQUEST_ACCEPTED' : 'SWAP_REQUEST_REJECTED',
            actorId: auth.userId,
            targetId: swap.id,
            payload: {
              decision: parsed.data.decision,
              reason: parsed.data.reason ?? null,
              overrideUsed: parsed.data.decision === 'approve_anyway',
              fromWorkerId: swap.fromWorkerId,
              fromWorkerName: swap.fromWorker.name,
              toWorkerId: swap.toWorkerId,
              toWorkerName: swap.toWorker.name,
              siteId: swap.siteId,
              siteName: swap.site.name,
              effectiveAt: swap.effectiveAt.toISOString(),
            },
          });

          await enqueueOutbox(tx, {
            companyId: auth.companyId,
            topic: isApprove ? 'swap.accepted' : 'swap.rejected',
            payload: {
              swapRequestId: swap.id,
              fromWorker: {
                workerId: swap.fromWorkerId,
                phone: swap.fromWorker.phone,
                name: swap.fromWorker.name,
              },
              toWorker: {
                workerId: swap.toWorkerId,
                phone: swap.toWorker.phone,
                name: swap.toWorker.name,
              },
              site: { id: swap.siteId, name: swap.site.name },
              decidedBy: auth.userId,
              reason: parsed.data.reason ?? null,
            },
          });

          return { kind: 'OK' as const, swap: updated, newState };
        });

        if (result.kind === 'NOT_FOUND') {
          reply.code(404).send({ error: 'SWAP_NOT_FOUND' });
          return;
        }
        if (result.kind === 'ALREADY_DECIDED') {
          reply.code(409).send({
            error: 'ALREADY_DECIDED',
            message: `Swap request is already ${result.state}; cannot decide again`,
            state: result.state,
          });
          return;
        }
        if (result.kind === 'NOT_RESPONSIBLE') {
          reply.code(403).send({
            error: 'NOT_RESPONSIBLE',
            message: 'Caller is not the responsible supervisor for this swap',
          });
          return;
        }

        const body: SwapDecisionOutputT = {
          ok: true,
          swapRequestId: result.swap.id,
          state: result.newState,
          decidedBy: auth.userId,
          decidedAt: result.swap.decidedAt!.toISOString(),
        };
        reply.send(body);
      } catch (err) {
        req.log.error({ err }, 'decide-swap-request failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not decide swap request' });
      }
    },
  );
}
