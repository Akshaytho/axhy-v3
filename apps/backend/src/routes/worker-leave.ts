/**
 * /worker/leave-requests route — the worker's OWN leave list.
 *
 *   GET /worker/leave-requests — last 10 leave requests for the calling
 *   worker, newest first. Backs the "My leave" section on the worker
 *   profile so the leave-success promise ("You'll see the result on your
 *   profile") is TRUE.
 *
 * Read-only. Auth + role: requireWorkerRole. The workerId is derived
 * ONLY from resolveWorkerFromAuth (Worker.userId is globally @unique —
 * see middleware/tenant-context.ts:199-263); no client input scopes the
 * query, so cross-worker leakage is structurally impossible.
 *
 * RLS-correct from day one: the LeaveRequest read runs inside
 * withTenantRead (company GUC) so this route keeps working when the API
 * switches to the axhy_app role (unlike the older bare-tx worker reads —
 * findings doc 2026-06-10 §1).
 *
 * @derives(walk worker-screens 2026-06-10-2345 bug #2 / RCA C-A part 2)
 * @derives(master-plan §G) — worker surface
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import {
  requireWorkerRole,
  resolveWorkerFromAuth,
  withTenantRead,
} from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';

const MAX_ROWS = 10;

/** @derives(master-plan §G) */
export async function registerWorkerLeaveRoutes(app: FastifyInstance): Promise<void> {
  app.get('/worker/leave-requests', { preHandler: requireWorkerRole }, async (req, reply) => {
    try {
      const auth = req.auth!;

      const rl = await consumeWorkerRateLimit('leaveList', auth.userId);
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

      const worker = await resolveWorkerFromAuth(prisma, auth);
      if (worker.kind === 'NO_WORKER') {
        // Same shape as /worker/today — signed-in user without a worker profile.
        reply.code(404).send({
          error: 'NO_WORKER_PROFILE',
          message: 'This user has no worker profile. Contact HR.',
        });
        return;
      }

      const rows = await withTenantRead(prisma, worker.companyId, (tx) =>
        tx.leaveRequest.findMany({
          where: { workerId: worker.workerId, companyId: worker.companyId },
          orderBy: { createdAt: 'desc' },
          take: MAX_ROWS,
          select: {
            id: true,
            fromDate: true,
            toDate: true,
            reason: true,
            state: true,
            decisionNote: true,
            decidedAt: true,
            createdAt: true,
          },
        }),
      );

      reply.send({
        items: rows.map((r) => ({
          id: r.id,
          fromDate: r.fromDate.toISOString().slice(0, 10),
          toDate: r.toDate.toISOString().slice(0, 10),
          reason: r.reason,
          state: r.state,
          decisionNote: r.decisionNote,
          decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      req.log.error({ err }, 'worker leave-list endpoint failed');
      reply.code(500).send({ error: 'LEAVE_LIST_FAILED', message: 'Could not load your leave.' });
    }
  });
}
