/**
 * Worker Submit routes.
 *
 *   POST /worker/visits/:visitId/submit
 *     Body: { photos: WorkerSubmitPhoto[] }
 *     Writes VisitPhoto rows + transitions visit to AWAITING_VERIFICATION.
 *     Role-gated: WORKER only.
 *
 *   GET /worker/visits/:visitId/verify-status
 *     Returns visit state + per-photo AI verification status.
 *     Mobile polls this until visitState leaves AWAITING_VERIFICATION.
 *     Role-gated: WORKER only.
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T4)
 */

import type { FastifyInstance } from 'fastify';
import { RoleSchema, WorkerSubmitRequestSchema } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/tenant-context.js';
import { withTenantContext } from '../middleware/tenant-context.js';
import { submitVisit } from '../lib/services/worker-submit-service.js';

/** @derives(master-plan §G) */
export async function registerWorkerSubmitRoutes(app: FastifyInstance): Promise<void> {
  app.post('/worker/visits/:visitId/submit', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      if (auth.role !== RoleSchema.enum.WORKER) {
        reply.code(403).send({
          error: 'WRONG_ROLE',
          message: 'Only worker accounts can submit photos.',
        });
        return;
      }

      const { visitId } = req.params as { visitId: string };

      const parsed = WorkerSubmitRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const result = await withTenantContext(prisma, auth.companyId, (tx) =>
        submitVisit(tx, {
          workerId: auth.userId,
          visitId,
          companyId: auth.companyId,
          photos: parsed.data.photos,
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
          message: `Visit is in ${result.currentState}, not PHOTOS_PENDING.`,
          currentState: result.currentState,
        });
        return;
      }

      req.log.info(
        {
          workerId: auth.userId,
          visitId,
          photosBefore: result.photosBefore,
          photosAfter: result.photosAfter,
        },
        'worker submit accepted',
      );

      reply.send({
        visitId: result.visitId,
        visitState: result.visitState,
        photosBefore: result.photosBefore,
        photosAfter: result.photosAfter,
      });
    } catch (err) {
      req.log.error({ err }, 'worker submit endpoint failed');
      reply.code(500).send({ error: 'SUBMIT_FAILED', message: 'Could not submit photos.' });
    }
  });

  app.get(
    '/worker/visits/:visitId/verify-status',
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
            message: 'Only worker accounts can check verify status.',
          });
          return;
        }

        const { visitId } = req.params as { visitId: string };

        const visit = await prisma.visit.findUnique({
          where: { id: visitId },
          select: { id: true, workerId: true, companyId: true, state: true },
        });

        if (!visit || visit.companyId !== auth.companyId) {
          reply.code(404).send({ error: 'VISIT_NOT_FOUND', message: 'Visit not found.' });
          return;
        }
        if (visit.workerId !== auth.userId) {
          reply.code(403).send({
            error: 'WRONG_WORKER',
            message: 'This visit belongs to a different worker.',
          });
          return;
        }

        const photos = await prisma.visitPhoto.findMany({
          where: { visitId, companyId: auth.companyId },
          select: { id: true, side: true, aiVerifyStatus: true },
          orderBy: { createdAt: 'asc' },
        });

        reply.send({
          visitId,
          visitState: visit.state,
          photos: photos.map((p) => ({
            id: p.id,
            side: p.side,
            aiVerifyStatus: p.aiVerifyStatus,
          })),
        });
      } catch (err) {
        req.log.error({ err }, 'worker verify-status endpoint failed');
        reply.code(500).send({ error: 'VERIFY_STATUS_FAILED', message: 'Could not fetch status.' });
      }
    },
  );
}
