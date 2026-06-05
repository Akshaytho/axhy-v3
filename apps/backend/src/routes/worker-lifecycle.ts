/**
 * Worker lifecycle routes — worker-driven visit state transitions.
 *
 *   POST /worker/visits/:visitId/clock-in
 *     Transitions visit to IN_PROGRESS (legal from SCHEDULED/NOTIFIED/EN_ROUTE/
 *     ON_SITE). Idempotent on already-IN_PROGRESS. Called by the mobile
 *     before-photos step as the worker completes the required BEFORE photos
 *     and enters the cleaning timer.
 *
 *   POST /worker/visits/:visitId/clock-out
 *     Transitions visit IN_PROGRESS → PHOTOS_PENDING. Idempotent on already-
 *     PHOTOS_PENDING. Called by the mobile timer screen as the worker finishes
 *     and proceeds to the AFTER photos step, so the subsequent /submit runs
 *     against PHOTOS_PENDING (its guarded source state).
 *
 * Workers own these transitions per the system intent that supervisors do not
 * mark visits done; the worker's on-device flow is the ground truth that the
 * visit is being worked.
 *
 * Auth + role: requireWorkerRole. Rate limit: per-user, see worker-rate-limits.ts.
 *
 * @derives(master-plan §G)
 * @derives(packages/state-machines/src/visit.ts)
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import {
  requireWorkerRole,
  withTenantContext,
  resolveWorkerFromAuth,
} from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';
import { clockInVisit, clockOutVisit } from '../lib/services/worker-lifecycle-service.js';

const ROUTES = {
  clockIn: '/worker/visits/:visitId/clock-in',
  clockOut: '/worker/visits/:visitId/clock-out',
} as const;

// Delegates to the canonical resolver (tenant-context.ts:211) so every worker
// route shares one Worker.id source of truth (RCA-A). Worker.userId is @unique,
// so the companyId filter the old inline version used was redundant.
async function resolveWorkerRowId(userId: string): Promise<string | null> {
  const r = await resolveWorkerFromAuth(prisma, { userId });
  return r.kind === 'OK' ? r.workerId : null;
}

/** @derives(master-plan §G) */
export async function registerWorkerLifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.post(ROUTES.clockIn, { preHandler: requireWorkerRole }, async (req, reply) => {
    try {
      const auth = req.auth!;

      const rl = await consumeWorkerRateLimit('clockIn', auth.userId);
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

      const { visitId } = req.params as { visitId: string };
      if (!visitId || typeof visitId !== 'string') {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'visit id required' });
        return;
      }

      const workerId = await resolveWorkerRowId(auth.userId);
      if (!workerId) {
        reply.code(404).send({ error: 'VISIT_NOT_FOUND', message: 'Visit not found.' });
        return;
      }

      const result = await withTenantContext(prisma, auth.companyId, (tx) =>
        clockInVisit(tx, {
          workerId,
          visitId,
          companyId: auth.companyId,
          actorUserId: auth.userId,
        }),
      );

      if (result.kind === 'NOT_FOUND') {
        reply.code(404).send({ error: 'VISIT_NOT_FOUND', message: 'Visit not found.' });
        return;
      }
      if (result.kind === 'WRONG_WORKER') {
        reply.code(403).send({
          error: 'WRONG_WORKER',
          message: 'This visit belongs to a different worker.',
        });
        return;
      }
      if (result.kind === 'WRONG_STATE') {
        reply.code(409).send({
          error: 'WRONG_STATE',
          message: `Visit is in ${result.currentState}; cannot clock in.`,
          currentState: result.currentState,
        });
        return;
      }
      if (result.kind === 'ACTIVE_TIMER_EXISTS') {
        reply.code(409).send({
          error: 'ACTIVE_TIMER_EXISTS',
          message:
            'Another visit is already in progress. Finish or pause it before starting this one.',
          activeVisitId: result.activeVisitId,
        });
        return;
      }

      req.log.info(
        { workerId, visitId, alreadyInProgress: result.alreadyInProgress },
        'worker clock-in accepted',
      );

      reply.send({
        visitId: result.visitId,
        visitState: result.visitState,
        alreadyInProgress: result.alreadyInProgress,
      });
    } catch (err) {
      req.log.error({ err }, 'worker clock-in endpoint failed');
      reply.code(500).send({ error: 'CLOCK_IN_FAILED', message: 'Could not start visit.' });
    }
  });

  app.post(ROUTES.clockOut, { preHandler: requireWorkerRole }, async (req, reply) => {
    try {
      const auth = req.auth!;

      const rl = await consumeWorkerRateLimit('clockOut', auth.userId);
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

      const { visitId } = req.params as { visitId: string };
      if (!visitId || typeof visitId !== 'string') {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'visit id required' });
        return;
      }

      const workerId = await resolveWorkerRowId(auth.userId);
      if (!workerId) {
        reply.code(404).send({ error: 'VISIT_NOT_FOUND', message: 'Visit not found.' });
        return;
      }

      const result = await withTenantContext(prisma, auth.companyId, (tx) =>
        clockOutVisit(tx, {
          workerId,
          visitId,
          companyId: auth.companyId,
          actorUserId: auth.userId,
        }),
      );

      if (result.kind === 'NOT_FOUND') {
        reply.code(404).send({ error: 'VISIT_NOT_FOUND', message: 'Visit not found.' });
        return;
      }
      if (result.kind === 'WRONG_WORKER') {
        reply.code(403).send({
          error: 'WRONG_WORKER',
          message: 'This visit belongs to a different worker.',
        });
        return;
      }
      if (result.kind === 'WRONG_STATE') {
        reply.code(409).send({
          error: 'WRONG_STATE',
          message: `Visit is in ${result.currentState}; cannot clock out.`,
          currentState: result.currentState,
        });
        return;
      }

      req.log.info(
        { workerId, visitId, alreadyPending: result.alreadyPending },
        'worker clock-out accepted',
      );

      reply.send({
        visitId: result.visitId,
        visitState: result.visitState,
        alreadyPending: result.alreadyPending,
      });
    } catch (err) {
      req.log.error({ err }, 'worker clock-out endpoint failed');
      reply.code(500).send({ error: 'CLOCK_OUT_FAILED', message: 'Could not finish visit.' });
    }
  });
}
