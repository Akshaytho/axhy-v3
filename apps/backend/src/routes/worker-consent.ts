/**
 * /worker/consent route — DPDP one-page consent at first run.
 *
 *   POST /worker/consent — append a ConsentLog row for the authenticated user.
 *
 * Append-only. Each call inserts a new row; the latest row by acceptedAt
 * represents the current consent state.
 *
 * Role-gated: only WORKER may submit. HR / SUPERVISOR / OWNER hit 403 —
 * they have a separate consent surface (out of scope for slice 1).
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §6 + §13 M22)
 * @derives(F-006b worker-shell relaxation 2026-05-21)
 */

import type { FastifyInstance } from 'fastify';
import { RoleSchema, SubmitConsentInput, type SubmitConsentOutput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
// requireAuth populates req.auth.userId + req.auth.role; the route gates on
// req.auth.role !== WORKER below (see handler body) — not a bare-authenticated
// endpoint.
import { requireAuth } from '../middleware/tenant-context.js';

/** @derives(master-plan §G) */
export async function registerWorkerConsentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/worker/consent', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      // Worker-only endpoint — DPDP consent is the worker's acceptance of the
      // platform privacy policy. Supervisors and HR have their own onboarding.
      if (auth.role !== RoleSchema.enum.WORKER) {
        reply.code(403).send({
          error: 'WRONG_ROLE',
          message: 'Only worker accounts can submit this consent. Sign in as a worker.',
        });
        return;
      }

      const parsed = SubmitConsentInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      // tenant-exempt: ConsentLog is per-User (no companyId) — workers consent
      // to the Axhy platform privacy policy, not a tenant company. Matches the
      // /me route pattern for cross-tenant entity access.
      const row = await prisma.consentLog.create({
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
