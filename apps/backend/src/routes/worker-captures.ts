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
 * Tenant safety: the presign key path embeds the resolved **Worker.id** (via
 * resolveWorkerFromAuth), matching what worker-submit reconstructs for the
 * stored VisitPhoto.r2Key (worker-submit-service.ts:88). Cross-tenant isolation
 * comes from R2's object-key namespacing (`v3-captures/{workerId}/...`) + the
 * requireWorkerRole gate. FIXED 2026-06-04 (RCA-A): previously embedded User.id,
 * which orphaned every upload because submit keyed by Worker.id.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 * @derives(2026-05-25 founder direction on cluster B — anonymization model)
 */

import type { FastifyInstance } from 'fastify';
import { UploadUrlsRequestSchema } from '@axhy/shared-schema';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { requireWorkerRole, resolveWorkerFromAuth } from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';
import { generateBatchUploadUrls, uploadCaptureObject } from '../lib/r2-presign.js';

const UploadProxyMetaSchema = z.object({
  visitId: z.string().uuid(),
  phase: z.enum(['before', 'after']),
  index: z.coerce.number().int().min(1).max(8),
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
        // The R2 key MUST use Worker.id, because worker-submit reconstructs the
        // stored VisitPhoto.r2Key with Worker.id (worker-submit-service.ts:88).
        // Keying by User.id here orphaned every upload (presign path != r2Key).
        // resolveWorkerFromAuth is the canonical tenant-safe resolver
        // (tenant-context.ts:211); no DB write happens, only this findUnique read.
        const worker = await resolveWorkerFromAuth(prisma, auth);
        if (worker.kind === 'NO_WORKER') {
          reply.code(404).send({ error: 'WORKER_NOT_FOUND', message: 'Worker profile not found.' });
          return;
        }
        const result = await generateBatchUploadUrls(worker.workerId, visitId, files);

        if (result.kind === 'NOT_CONFIGURED') {
          req.log.warn(
            { workerId: worker.workerId, visitId },
            'R2 not configured — refusing presign',
          );
          reply.code(503).send({
            error: 'R2_NOT_CONFIGURED',
            message: 'Photo upload is temporarily unavailable. Please try again later.',
          });
          return;
        }

        req.log.info(
          {
            workerId: worker.workerId,
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

      // Same Worker.id key contract as the presign path (see above).
      const worker = await resolveWorkerFromAuth(prisma, auth);
      if (worker.kind === 'NO_WORKER') {
        reply.code(404).send({ error: 'WORKER_NOT_FOUND', message: 'Worker profile not found.' });
        return;
      }

      const result = await uploadCaptureObject(
        worker.workerId,
        meta.data.visitId,
        meta.data,
        photoBuffer,
      );
      if (result.kind === 'NOT_CONFIGURED') {
        req.log.warn(
          { workerId: worker.workerId, visitId: meta.data.visitId },
          'R2 not configured',
        );
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
