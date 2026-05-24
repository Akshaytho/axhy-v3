/**
 * /worker/visits/:id route — Assignment Detail data composer.
 *
 *   GET /worker/visits/:id — returns single-visit detail for the worker who
 *                             owns the visit. Includes full site address +
 *                             supervisor phone (tap-to-call data source).
 *
 * Read-only. Authorization gate: caller must be the visit's owner worker
 * (verified inside the service via Worker.userId match). Cross-worker
 * access returns generic 403 FORBIDDEN — never leaks whether the visit
 * exists for some other worker.
 *
 * Auth + role: requireWorkerRole preHandler (auth + WORKER role gate).
 *
 * Rate limit: per-user 60 req/min (env-tunable via
 *   RATE_LIMIT_WORKER_VISIT_PER_MIN).
 *
 * Tenant safety: the service's caller-owns-visit check relies on the
 * column-level `@unique` index on Worker.userId (schema.prisma:188). At
 * most one active Worker exists per User globally per the anonymization
 * model (founder direction 2026-05-25), so cross-tenant leak is
 * structurally impossible. See worker-today.ts for the full rationale on
 * why `withTenantContext` is NOT used on worker reads.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(F-006b worker-shell)
 * @derives(2026-05-25 founder direction on cluster B — anonymization model)
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireWorkerRole } from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';
import { getWorkerVisitDetail } from '../lib/services/worker-today-service.js';

/** @derives(master-plan §G) */
export async function registerWorkerVisitRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/worker/visits/:id',
    { preHandler: requireWorkerRole },
    async (req, reply) => {
      try {
        const auth = req.auth!;

        const rl = await consumeWorkerRateLimit('visit', auth.userId);
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

        const visitId = req.params.id;
        if (!visitId || typeof visitId !== 'string') {
          reply.code(400).send({ error: 'BAD_INPUT', message: 'visit id required' });
          return;
        }

        // 15s timeout covers Railway cold-call (~5-8s observed); warm calls < 1s.
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
