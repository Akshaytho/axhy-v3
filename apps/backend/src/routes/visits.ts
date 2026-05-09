/**
 * Visit-scoped supervisor routes.
 *
 * POST /visits/:id/end   (OPERATIONAL tier, single-tap confirm)
 *   Supervisor marks a visit as done. Inside one Prisma transaction:
 *     1. Verify visit belongs to caller's company
 *     2. Reject if visit is not in a valid prior state (must be STARTED
 *        or IN_PROGRESS — anything terminal returns 409)
 *     3. Transition state → ENDED, set completedAt = now()
 *     4. Record AuditEvent (kind = VISIT_ENDED)
 *     5. Enqueue Outbox topic `ai.verify` so the AI verification surface
 *        picks up the photos/voice when the dispatcher dispatches it
 *
 *   AI verification is Phase C. Today the dispatcher logs the topic.
 *
 * @derives(data-flow §5 — supervisor "Mark visit done" action)
 * @derives(panel-2026-05-08) — Phase B.5
 */

import type { FastifyInstance } from 'fastify';
import { EndVisitInput } from '@axhy/shared-schema';
import type { EndVisitOutput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import { enqueueOutbox } from '../lib/outbox.js';

/** Visit states that allow transition into ENDED. */
const ENDABLE_STATES = new Set(['STARTED', 'IN_PROGRESS']);

/**
 * Register visit-scoped supervisor routes.
 *
 * @derives(ADR-0007) — JWT + tenant-context middleware
 * @derives(data-flow §5 — supervisor "Mark visit done" action)
 */
export async function registerVisitRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/visits/:id/end',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      const parsed = EndVisitInput.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const visitId = req.params.id;
      const note = parsed.data.note ?? null;

      try {
        const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
          const visit = await tx.visit.findFirst({
            where: { id: visitId, companyId: auth.companyId },
            include: { worker: true, site: true },
          });
          if (!visit) {
            return { kind: 'NOT_FOUND' as const };
          }
          if (!ENDABLE_STATES.has(visit.state)) {
            return { kind: 'BAD_STATE' as const, state: visit.state };
          }

          const endedAt = new Date();
          const updated = await tx.visit.update({
            where: { id: visit.id },
            data: { state: 'ENDED', completedAt: endedAt },
          });

          await recordAuditEvent(tx, {
            companyId: auth.companyId,
            kind: 'VISIT_ENDED',
            actorId: auth.userId,
            targetId: visit.id,
            payload: {
              workerId: visit.workerId,
              workerName: visit.worker.name,
              siteId: visit.siteId,
              siteName: visit.site.name,
              priorState: visit.state,
              note,
              startedAt: visit.startedAt?.toISOString() ?? null,
              completedAt: endedAt.toISOString(),
            },
          });

          // Queue AI verification (Phase C — stubbed in dispatcher)
          await enqueueOutbox(tx, {
            companyId: auth.companyId,
            topic: 'ai.verify',
            payload: {
              visitId: visit.id,
              workerId: visit.workerId,
              siteId: visit.siteId,
              photosBefore: visit.photosBefore,
              photosAfter: visit.photosAfter,
              voiceKey: visit.voiceKey,
            },
          });

          return { kind: 'OK' as const, visit: updated };
        });

        if (out.kind === 'NOT_FOUND') {
          reply.code(404).send({
            error: 'VISIT_NOT_FOUND',
            message: 'Visit not found in this company',
          });
          return;
        }
        if (out.kind === 'BAD_STATE') {
          reply.code(409).send({
            error: 'INVALID_STATE',
            message: `Visit is in state ${out.state}; can only end from STARTED or IN_PROGRESS`,
            state: out.state,
          });
          return;
        }

        const result: EndVisitOutput = {
          ok: true,
          visitId: out.visit.id,
          state: 'ENDED',
          endedAt: out.visit.completedAt!.toISOString(),
        };
        reply.send(result);
      } catch (err) {
        req.log.error({ err }, 'end-visit failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not end visit' });
      }
    },
  );
}
