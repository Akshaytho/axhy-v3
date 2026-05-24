/**
 * /worker/today route — Worker Home data composer.
 *
 *   GET /worker/today — returns the worker's today data: today's visits,
 *                        worker state, supervisor phone for tap-to-call,
 *                        resume-capture pointer when a visit is in flight.
 *
 * Read-only. The service composes from existing tables; no state transitions.
 *
 * Auth + role: requireWorkerRole preHandler (auth + WORKER role gate).
 *
 * Rate limit: per-user 60 req/min (env-tunable via
 *   RATE_LIMIT_WORKER_TODAY_PER_MIN) — Redis sliding window, same shape as
 *   the canonical chat.ts pattern.
 *
 * Tenant safety: the service composes by reading Worker via the column-level
 * `@unique` index on `userId` (schema.prisma:188). At most one active Worker
 * exists per User globally (anonymization on leave sets `userId` to null —
 * founder-confirmed 2026-05-25), so cross-tenant leak is structurally
 * impossible. `withTenantContext` is NOT used on this read path because
 * Worker / Visit / Site tables do not have RLS enabled today (only
 * `axhy_chat.turn_embeddings` does, per migration 20260527_017), and its
 * `Company.status === 'ACTIVE'` check would conflict with the "no
 * assignments today" UX when a customer's contract ends. New worker routes
 * that need a Worker lookup should use `resolveWorkerFromAuth` in
 * middleware/tenant-context.ts.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(F-006b worker-shell)
 * @derives(2026-05-25 founder direction on cluster B — anonymization model)
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireWorkerRole } from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';
import { getWorkerToday } from '../lib/services/worker-today-service.js';

/** @derives(master-plan §G) */
export async function registerWorkerTodayRoutes(app: FastifyInstance): Promise<void> {
  app.get('/worker/today', { preHandler: requireWorkerRole }, async (req, reply) => {
    try {
      const auth = req.auth!;

      const rl = await consumeWorkerRateLimit('today', auth.userId);
      if (!rl.ok) {
        reply
          .code(429)
          .header('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)))
          .send({
            error: 'RATE_LIMITED',
            message: 'Too many requests. Please wait a moment.',
            retryAfterMs: rl.retryAfterMs,
          });
        return;
      }

      // 15s timeout covers Railway cold-call (~5-8s observed); warm calls < 1s.
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
