/**
 * /worker/captures route — Cloudflare R2 presigned-URL batch generator.
 *
 *   POST /worker/captures/upload-urls — returns one signed PUT URL per
 *                                       requested before/after photo slot.
 *
 * Read-only on the backend side: no DB writes happen here. The mobile uploads
 * directly to R2 with the returned URLs; the eventual `VisitPhoto` rows are
 * created in 2b-3 Submit after the worker confirms photo set is complete.
 *
 * Role-gated: WORKER only. SUPERVISOR / HR / OWNER get 403 WRONG_ROLE.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import type { FastifyInstance } from 'fastify';
import { RoleSchema, UploadUrlsRequestSchema } from '@axhy/shared-schema';

import { requireAuth } from '../middleware/tenant-context.js';
import { generateBatchUploadUrls } from '../lib/r2-presign.js';

/** @derives(master-plan §G) */
export async function registerWorkerCapturesRoutes(app: FastifyInstance): Promise<void> {
  app.post('/worker/captures/upload-urls', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      if (auth.role !== RoleSchema.enum.WORKER) {
        reply.code(403).send({
          error: 'WRONG_ROLE',
          message: 'Only worker accounts can request capture upload URLs.',
        });
        return;
      }

      const parseResult = UploadUrlsRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        reply.code(400).send({
          error: 'BAD_INPUT',
          message: parseResult.error.message,
        });
        return;
      }

      const { visitId, files } = parseResult.data;
      // tenant-exempt: presign is keyed by workerId (req.auth.userId), not a
      // tenant-scoped table. Cross-tenant isolation is enforced at the R2
      // object-key level (`v3-captures/{workerId}/...`).
      const result = await generateBatchUploadUrls(auth.userId, visitId, files);

      if (result.kind === 'NOT_CONFIGURED') {
        req.log.warn({ workerId: auth.userId, visitId }, 'R2 not configured — refusing presign');
        reply.code(503).send({
          error: 'R2_NOT_CONFIGURED',
          message: 'Photo upload is temporarily unavailable. Please try again later.',
        });
        return;
      }

      req.log.info(
        {
          workerId: auth.userId,
          visitId,
          urlCount: result.entries.length,
        },
        'worker captures presign batch generated',
      );

      reply.send({ urls: result.entries });
    } catch (err) {
      req.log.error({ err }, 'worker captures presign endpoint failed');
      reply.code(500).send({ error: 'PRESIGN_FAILED', message: 'Could not generate upload URLs.' });
    }
  });
}
