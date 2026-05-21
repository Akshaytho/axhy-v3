/**
 * /worker/today route — Worker Home data composer.
 *
 *   GET /worker/today — returns the worker's today data: today's visits,
 *                        worker state, supervisor phone for tap-to-call,
 *                        resume-capture pointer when a visit is in flight.
 *
 * Read-only. The service composes from existing tables; no state transitions.
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
// req.auth.role !== WORKER below (see handler body) — not a bare-authenticated
// endpoint.
import { requireAuth } from '../middleware/tenant-context.js';
import { getWorkerToday } from '../lib/services/worker-today-service.js';

/** @derives(master-plan §G) */
export async function registerWorkerTodayRoutes(app: FastifyInstance): Promise<void> {
  app.get('/worker/today', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      if (auth.role !== RoleSchema.enum.WORKER) {
        reply.code(403).send({
          error: 'WRONG_ROLE',
          message: 'Only worker accounts can read their today list. Sign in as a worker.',
        });
        return;
      }

      // tenant-exempt: Worker lookup is by userId, then companyId is derived
      // from the worker row. Same cross-tenant pattern as /me + /worker/consent.
      // 15s timeout covers Railway cold-call (~5-8s observed); warm calls < 1s.
      // Same pattern as auth.ts worker OTP_VERIFIED transaction.
      const result = await prisma.$transaction(
        (tx) => getWorkerToday(tx, { userId: auth.userId }),
        { timeout: 15_000, maxWait: 10_000 },
      );

      if (result.kind === 'NO_WORKER') {
        reply.code(404).send({
          error: 'NO_WORKER_PROFILE',
          message: 'This user is signed in but has no worker profile in any company. Contact HR.',
        });
        return;
      }

      reply.send(result.data);
    } catch (err) {
      req.log.error({ err }, 'worker today endpoint failed');
      reply.code(500).send({ error: 'TODAY_FAILED', message: 'Could not load today.' });
    }
  });
}
