/**
 * /worker/history route — recent multi-day worker visit history.
 *
 * GET /worker/history — returns recent completed / closed visits for the
 * authenticated worker across multiple days so the history screen is backed by
 * real data.
 *
 * Auth + role: requireWorkerRole preHandler (auth + WORKER role gate).
 *
 * @derives(master-plan §G)
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireWorkerRole } from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';
import { getWorkerHistory } from '../lib/services/worker-today-service.js';

/** @derives(master-plan §G) */
export async function registerWorkerHistoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/worker/history', { preHandler: requireWorkerRole }, async (req, reply) => {
    try {
      const auth = req.auth!;

      const rl = await consumeWorkerRateLimit('history', auth.userId);
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

      const windowDaysRaw = (req.query as { windowDays?: string } | undefined)?.windowDays;
      const windowDays =
        typeof windowDaysRaw === 'string' && Number.isFinite(Number(windowDaysRaw))
          ? Number(windowDaysRaw)
          : undefined;

      const result = await prisma.$transaction(
        (tx) => getWorkerHistory(tx, { userId: auth.userId, windowDays }),
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
      req.log.error({ err }, 'worker history endpoint failed');
      reply.code(500).send({ error: 'HISTORY_FAILED', message: 'Could not load history.' });
    }
  });
}
