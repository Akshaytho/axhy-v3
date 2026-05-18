/**
 * Supervisor Decisions routes.
 *
 * GET /supervisor/decisions
 *   Returns the calling supervisor's pending decision queue, tier-grouped
 *   into sections (NEEDS_YOU_NOW / ROUTINE / FAILED_REVIEW).
 *
 *   JWT-implicit via `requireAuth`; never accepts `companyId` from the
 *   client. Wrapped in `withTenantContext` for RLS.
 *
 * POST /supervisor/decisions/:id/dismiss
 *   Dismisses a PROPOSED decision. Validates body against DismissDecisionInput
 *   (reason is optional, max 500 chars). Uses the existing
 *   `dismissProposedDecision` writer so the race-safe lifecycle and audit
 *   trail are identical to the existing `/decisions/:id/dismiss` route. This
 *   route also records a DWI_DISMISSED AuditEvent (handled inside
 *   dismissProposedDecision → recordDwiDismissed).
 *
 *   Errors:
 *     404 NOT_FOUND — decision not found
 *     409 ALREADY_APPLIED | ALREADY_DISMISSED — not in PROPOSED state
 *     403 NOT_RESPONSIBLE — caller is not the responsible supervisor
 *     400 BAD_INPUT — body validation failed
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import type { FastifyInstance } from 'fastify';
import { DismissDecisionInput, DecisionsQueryInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { buildDecisionsForSupervisor } from '../lib/services/decisions-service.js';
import { dismissProposedDecision, LifecycleError } from '../lib/supervisor-decision-writer.js';

/**
 * Register GET /supervisor/decisions and POST /supervisor/decisions/:id/dismiss.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export async function registerSupervisorDecisionsRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /supervisor/decisions — pending decision queue
  // -------------------------------------------------------------------------
  app.get('/supervisor/decisions', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    // Parse pagination query params. Wave 2: limit 50, cursor-by-(priority,
    // proposedAt, id) — see decisions-service.ts.
    const parsedQuery = DecisionsQueryInput.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsedQuery.error.message });
      return;
    }

    const startedAt = Date.now();
    try {
      // Read-path latency fix (Cluster 1) — bare prisma → parallel queries.
      const out = await buildDecisionsForSupervisor(prisma, {
        companyId: auth.companyId,
        userId: auth.userId,
        cursor: parsedQuery.data.cursor,
        limit: parsedQuery.data.limit,
      });
      req.log.info(
        {
          companyId: auth.companyId,
          userId: auth.userId,
          rows: out.rows.length,
          totalAcrossPages: out.pageInfo.totalAcrossPages,
          hasMore: out.pageInfo.hasMore,
          ms: Date.now() - startedAt,
        },
        'GET /supervisor/decisions ok',
      );
      reply.code(200).send(out);
    } catch (err) {
      req.log.error({ err, ms: Date.now() - startedAt }, 'GET /supervisor/decisions failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not build decisions queue' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /supervisor/decisions/:id/dismiss — dismiss a PROPOSED decision
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/supervisor/decisions/:id/dismiss',
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

      // Body is optional — DismissDecisionInput has reason as optional.
      const parsedBody = DismissDecisionInput.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsedBody.error.message });
        return;
      }

      try {
        const result = await withTenantContext(prisma, auth.companyId, async (tx) =>
          dismissProposedDecision(tx, {
            companyId: auth.companyId,
            decisionId: id,
            actorUserId: auth.userId,
            // dismissProposedDecision expects reason: string (non-optional).
            // DismissDecisionInput.reason is optional — fall back to a canonical
            // non-empty string so DwiDismissedPayloadSchema (min 1) doesn't fail.
            reason: parsedBody.data.reason?.trim() || '(no reason given)',
          }),
        );
        reply.code(200).send({
          ok: true,
          decisionId: result.decisionId,
          dismissedAt: result.dismissedAt.toISOString(),
        });
      } catch (err) {
        if (err instanceof LifecycleError) {
          const httpStatus =
            err.code === 'NOT_FOUND' || err.code === 'CROSS_TENANT'
              ? 404
              : err.code === 'NOT_RESPONSIBLE'
                ? 403
                : 409;
          reply.code(httpStatus).send({ error: err.code });
          return;
        }
        req.log.error({ err }, 'POST /supervisor/decisions/:id/dismiss failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not dismiss decision' });
      }
    },
  );
}
