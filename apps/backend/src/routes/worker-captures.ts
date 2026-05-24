/**
 * /worker/captures route — Cloudflare R2 presigned-URL batch generator.
 *
 *   POST /worker/captures/upload-urls — returns one signed PUT URL per
 *                                       requested before/after photo slot.
 *
 * Read-only on the backend side: no DB writes happen here. The mobile uploads
 * directly to R2 with the returned URLs; the eventual `VisitPhoto` rows are
 * created in worker-submit after the worker confirms photo set is complete.
 *
 * Auth + role: requireWorkerRole preHandler (auth + WORKER role gate).
 *
 * Rate limit: per-user 120 req/min (env-tunable via
 *   RATE_LIMIT_WORKER_CAPTURES_PER_MIN). Default accounts for ~6 photos
 *   per visit with a retry budget for flaky uplinks.
 *
 * Tenant safety: the presign key path embeds `auth.userId`. Cross-tenant
 * isolation comes from R2's object-key namespacing (`v3-captures/{userId}/...`)
 * + the requireWorkerRole gate. NOTE: P3.2 in WORKER_CODE_REVIEW_FINDINGS
 * flags a possible Worker.id vs User.id mismatch between presign and submit
 * key reconstruction — out of scope for Cluster B; will be addressed under
 * Cluster C (submit + verify trust gaps).
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 * @derives(2026-05-25 founder direction on cluster B — anonymization model)
 */

import type { FastifyInstance } from 'fastify';
import { UploadUrlsRequestSchema } from '@axhy/shared-schema';

import { requireWorkerRole } from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';
import { generateBatchUploadUrls } from '../lib/r2-presign.js';

/** @derives(master-plan §G) */
export async function registerWorkerCapturesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/worker/captures/upload-urls',
    { preHandler: requireWorkerRole },
    async (req, reply) => {
      try {
        const auth = req.auth!;

        const rl = await consumeWorkerRateLimit('captures', auth.userId);
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

        const parseResult = UploadUrlsRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
          reply.code(400).send({
            error: 'BAD_INPUT',
            message: parseResult.error.message,
          });
          return;
        }

        const { visitId, files } = parseResult.data;
        // tenant-exempt: presign is keyed by userId — no DB writes happen here,
        // so there is no companyId-bound row to GUC-scope. Cross-tenant isolation
        // for the eventual upload lives in the R2 object-key namespace
        // (`v3-captures/{userId}/...`), not in withTenantContext.
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
        reply
          .code(500)
          .send({ error: 'PRESIGN_FAILED', message: 'Could not generate upload URLs.' });
      }
    },
  );
}
