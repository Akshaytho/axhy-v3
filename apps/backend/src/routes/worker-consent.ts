/**
 * /worker/consent route — DPDP one-page consent at first run.
 *
 *   POST /worker/consent — append a ConsentLog row for the authenticated user.
 *
 * Append-only. Each call inserts a new row; the latest row by acceptedAt
 * represents the current consent state.
 *
 * Auth + role: requireWorkerRole preHandler (auth + WORKER role gate).
 *   HR / SUPERVISOR / OWNER hit 403 — they have a separate consent surface
 *   (out of scope for slice 1).
 *
 * Rate limit: per-user 10 req/min (env-tunable via
 *   RATE_LIMIT_WORKER_CONSENT_PER_MIN). Default covers reinstalls + policy
 *   version bumps; normal usage is once per install.
 *
 * Tenant safety: ConsentLog is per-User (no companyId column) — workers
 * consent to the Axhy platform privacy policy, not a tenant company. This
 * is the ONE worker route that is genuinely tenant-agnostic; the
 * `resolveWorkerFromAuth` helper does not apply here.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §6 + §13 M22)
 * @derives(F-006b worker-shell relaxation 2026-05-21)
 * @derives(2026-05-25 founder direction on cluster B — anonymization model)
 */

import type { FastifyInstance } from 'fastify';
import { SubmitConsentInput, type SubmitConsentOutput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireWorkerRole } from '../middleware/tenant-context.js';
import { consumeWorkerRateLimit } from '../lib/worker-rate-limits.js';

/** @derives(master-plan §G) */
export async function registerWorkerConsentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/worker/consent', { preHandler: requireWorkerRole }, async (req, reply) => {
    try {
      const auth = req.auth!;

      const rl = await consumeWorkerRateLimit('consent', auth.userId);
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

      const parsed = SubmitConsentInput.safeParse(req.body);
      if (!parsed.success) {
        // Includes a non-allowlisted policyVersion (ACCEPTED_POLICY_VERSIONS)
        // — we never persist an unknown string as a legal consent record.
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      // Dedup (RCA-G/consent 2026-06-04): re-submitting the SAME
      // (userId, policyVersion) — common on reinstall / screen refocus — used
      // to silently append a duplicate consent row on every retry. Instead
      // return 409, which the mobile client already treats as "already
      // consented, proceed" (app/(auth)/consent.tsx). This NEVER deletes or
      // mutates an existing row (INV 9 immutable legal record / INV 11 DPDP);
      // a DIFFERENT allowed version still appends (real history of accepting
      // v1 then v2). Scoped to exact (userId, policyVersion).
      const existing = await prisma.consentLog.findFirst({
        // raw-ok: per-User read, no companyId; see tenant-exempt note below.
        where: { userId: auth.userId, policyVersion: parsed.data.policyVersion },
        select: { id: true },
      });
      if (existing) {
        reply
          .code(409)
          .send({
            error: 'ALREADY_CONSENTED',
            message: 'This policy version is already accepted.',
          });
        return;
      }

      // tenant-exempt: ConsentLog is per-User — schema.prisma:1390 has no
      // companyId column because DPDP consent is to the Axhy platform, not to
      // any tenant company. withTenantContext would have nothing meaningful to
      // GUC-scope here. // raw-ok pairs with this exemption for CHECK 10.
      const row = await prisma.consentLog.create({
        // raw-ok: per-User write, no companyId; see tenant-exempt note above.
        data: {
          userId: auth.userId,
          policyVersion: parsed.data.policyVersion,
        },
      });

      const out: SubmitConsentOutput = {
        ok: true,
        acceptedAt: row.acceptedAt.toISOString(),
      };
      reply.send(out);
    } catch (err) {
      req.log.error({ err }, 'worker consent endpoint failed');
      reply.code(500).send({ error: 'CONSENT_FAILED', message: 'Could not record consent.' });
    }
  });
}
