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
import { CreateSwapRequestInput } from '@axhy/shared-schema';
import type { CreateSwapRequestOutput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { createSwapRequestService } from '../lib/services/swap-request-service.js';

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
      // F-002.b (round-2 R2b-iii): route is now a thin wrapper around
      // createSwapRequestService. /chat/apply (F-002.15) calls the same
      // service INSIDE its own withTenantContext for atomic lifecycle +
      // domain.
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        createSwapRequestService(
          tx,
          { fromWorkerId, toWorkerId, siteId, effectiveAt, reason: reason ?? null },
          { companyId: auth.companyId, userId: auth.userId },
        ),
      );

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
}
