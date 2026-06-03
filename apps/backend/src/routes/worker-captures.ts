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
import { z } from 'zod';

import { requireWorkerRole } from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';
import { generateBatchUploadUrls, uploadCaptureObject } from '../lib/r2-presign.js';

const UploadProxyMetaSchema = z.object({
  visitId: z.string().min(1),
  phase: z.enum(['before', 'after']),
  index: z.coerce.number().int().min(1).max(3),
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp)$/, 'contentType must be image/jpeg, image/png, or image/webp'),
});

/** @derives(master-plan §G) */
export async function registerWorkerCapturesRoutes(app: FastifyInstance): Promise<void> {
  // @fastify/multipart is registered once globally in server.ts (it publishes
  // via fastify-plugin which hoists to root). Re-registering here would throw
  // FST_ERR_DEC_ALREADY_PRESENT at boot.
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

  app.post('/worker/captures/upload', { preHandler: requireWorkerRole }, async (req, reply) => {
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

      let photoPart: import('@fastify/multipart').MultipartFile | undefined;
      const fields: Record<string, string> = {};
      try {
        const parts = req.parts();
        for await (const part of parts) {
          if (part.type === 'file') {
            photoPart = part;
          } else {
            fields[part.fieldname] = String(part.value ?? '');
          }
        }
      } catch {
        reply
          .code(400)
          .send({ error: 'MULTIPART_PARSE_ERROR', message: 'Could not parse multipart body' });
        return;
      }

      if (!photoPart) {
        reply
          .code(400)
          .send({ error: 'PHOTO_REQUIRED', message: 'Multipart field `photo` is required' });
        return;
      }

      if (photoPart.fieldname !== 'photo') {
        reply
          .code(400)
          .send({ error: 'WRONG_FIELD', message: 'Expected multipart field named `photo`' });
        return;
      }

      const meta = UploadProxyMetaSchema.safeParse(fields);
      if (!meta.success) {
        reply.code(400).send({
          error: 'BAD_INPUT',
          message: meta.error.message,
        });
        return;
      }

      let photoBuffer: Buffer;
      try {
        photoBuffer = await photoPart.toBuffer();
      } catch {
        reply.code(400).send({ error: 'READ_ERROR', message: 'Could not read photo stream' });
        return;
      }

      if (photoBuffer.length === 0) {
        reply.code(400).send({ error: 'EMPTY_PHOTO', message: 'Photo file is empty' });
        return;
      }

      const result = await uploadCaptureObject(
        auth.userId,
        meta.data.visitId,
        meta.data,
        photoBuffer,
      );
      if (result.kind === 'NOT_CONFIGURED') {
        req.log.warn({ workerId: auth.userId, visitId: meta.data.visitId }, 'R2 not configured');
        reply.code(503).send({
          error: 'R2_NOT_CONFIGURED',
          message: 'Photo upload is temporarily unavailable. Please try again later.',
        });
        return;
      }

      reply.send({ objectKey: result.objectKey });
    } catch (err) {
      req.log.error({ err }, 'worker captures upload proxy failed');
      reply.code(500).send({ error: 'UPLOAD_FAILED', message: 'Could not upload photo.' });
    }
  });
}
