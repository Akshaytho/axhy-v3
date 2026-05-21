/**
 * /worker/visits/:id route — Assignment Detail data composer.
 *
 *   GET /worker/visits/:id — returns single-visit detail for the worker who
 *                             owns the visit. Includes full site address +
 *                             supervisor phone (tap-to-call data source).
 *
 * Read-only. Authorization gate: caller must be the visit's owner worker
 * (verified via Worker.userId match). Cross-worker access returns 403.
 *
 * Role-gated: WORKER only. SUPERVISOR / HR / OWNER get 403 WRONG_ROLE.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(F-006b worker-shell)
 */

import type { FastifyInstance } from 'fastify';
import { RoleSchema } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
// requireAuth populates req.auth.userId + req.auth.role; the route gates on
// req.auth.role !== WORKER below (handler body) and on visit-ownership via
// the service's Worker.userId === auth.userId check — not a bare-authenticated
// endpoint.
import { requireAuth } from '../middleware/tenant-context.js';
import { getWorkerVisitDetail } from '../lib/services/worker-today-service.js';

/** @derives(master-plan §G) */
export async function registerWorkerVisitRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/worker/visits/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const auth = req.auth;
        if (!auth) {
          reply.code(401).send({ error: 'AUTH_REQUIRED' });
          return;
        }

        if (auth.role !== RoleSchema.enum.WORKER) {
          reply.code(403).send({
            error: 'WRONG_ROLE',
            message: 'Only worker accounts can read worker visit detail. Sign in as a worker.',
          });
          return;
        }

        const visitId = req.params.id;
        if (!visitId || typeof visitId !== 'string') {
          reply.code(400).send({ error: 'BAD_INPUT', message: 'visit id required' });
          return;
        }

        // tenant-exempt: Visit lookup is by id; tenant boundary enforced by the
        // service's caller-owns-visit check (Worker.userId === auth.userId).
        // 15s timeout covers Railway cold-call (~5-8s observed); warm calls < 1s.
        // Same pattern as auth.ts worker OTP_VERIFIED transaction.
        const result = await prisma.$transaction(
          (tx) => getWorkerVisitDetail(tx, { visitId, callerUserId: auth.userId }),
          { timeout: 15_000, maxWait: 10_000 },
        );

        if (result.kind === 'NOT_FOUND') {
          reply.code(404).send({ error: 'VISIT_NOT_FOUND' });
          return;
        }
        if (result.kind === 'FORBIDDEN') {
          // Generic 403 — don't leak whether the visit exists for some other worker.
          reply.code(403).send({ error: 'FORBIDDEN' });
          return;
        }

        reply.send(result.data);
      } catch (err) {
        req.log.error({ err, visitId: req.params.id }, 'worker visit endpoint failed');
        reply.code(500).send({ error: 'VISIT_LOAD_FAILED', message: 'Could not load visit.' });
      }
    },
  );
}
