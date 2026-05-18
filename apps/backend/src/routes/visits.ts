/**
 * Visit review routes — Wave 4 compliance flow (2026-05-18).
 *
 *   POST /visits/:id/resolve
 *       Supervisor confirms an AI-flagged visit is fine. Body:
 *       `{ supervisorReason?: string | null }`. Conditional UPDATE on
 *       Visit.flagged=true; no state transition. Idempotency-Key supported.
 *
 *   POST /visits/:id/reject
 *       Supervisor rejects an AI-flagged visit. Body:
 *       `{ supervisorReason: string }` (required). Conditional UPDATE on
 *       Visit.flagged=true AND state IN (IN_PROGRESS, COMPLETED, NEEDS_REVIEW);
 *       transitions state to REJECTED. Idempotency-Key supported. The
 *       client surfaces a typed-phrase confirmation ("REJECT") before
 *       firing this mutation.
 *
 * Both routes require role=SUPERVISOR. Cross-tenant attempts return 404
 * (same envelope as missing-id) — never reveal that a foreign-tenant visit
 * exists. Every mutation runs inside `withTenantContext` for RLS.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 * @derives(feedback_production_grade_workflow_rules.md P3 + P8)
 * @derives(master-plan §G) — supervisor surface
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ResolveFlaggedVisitInput, RejectFlaggedVisitInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { withIdempotency } from '../lib/idempotency-key.js';
import {
  resolveFlaggedVisit,
  rejectFlaggedVisit,
} from '../lib/services/visit-flagged-review-service.js';

type IdParams = FastifyRequest<{ Params: { id: string } }>;

/**
 * Register the Wave 4 visit-review routes on `app`.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export async function registerVisitsRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /visits/:id/resolve ────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/visits/:id/resolve',
    { preHandler: requireAuth },
    async (req: IdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      if (auth.role !== 'SUPERVISOR') {
        reply.code(403).send({ error: 'SUPERVISOR_ROLE_REQUIRED' });
        return;
      }
      const visitId = req.params.id;
      if (!visitId) {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'Missing :id route param' });
        return;
      }
      const parsed = ResolveFlaggedVisitInput.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      await withIdempotency(
        req,
        reply,
        // Cluster B fix (P0, deep-review 2026-05-18): routeKey MUST embed the
        // resource id, not the literal `:id` placeholder. Without this, the
        // same Idempotency-Key reused across different visits in the same
        // tenant would return the cached body for the wrong visit.
        { companyId: auth.companyId, routeKey: `POST:/visits/${visitId}/resolve` },
        async () => {
          const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
            resolveFlaggedVisit(tx, {
              companyId: auth.companyId,
              supervisorUserId: auth.userId,
              visitId,
              supervisorReason: parsed.data.supervisorReason ?? null,
            }),
          );

          if (out.kind === 'VISIT_NOT_FOUND') {
            return { status: 404, body: { error: 'VISIT_NOT_FOUND' } };
          }
          if (out.kind === 'VISIT_NOT_FLAGGED') {
            return {
              status: 409,
              body: {
                error: 'ALREADY_DECIDED',
                message: 'Visit is no longer flagged (resolved or rejected by another action).',
              },
            };
          }
          req.log.info(
            {
              event: 'visit.resolved',
              visitId,
              supervisorUserId: auth.userId,
              previousState: out.previousState,
            },
            'flagged visit resolved',
          );
          return {
            status: 200,
            body: {
              ok: true,
              visitId,
              previousState: out.previousState,
              flagged: out.visit.flagged,
              state: out.visit.state,
            },
          };
        },
      );
    },
  );

  // ── POST /visits/:id/reject ─────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/visits/:id/reject',
    { preHandler: requireAuth },
    async (req: IdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      if (auth.role !== 'SUPERVISOR') {
        reply.code(403).send({ error: 'SUPERVISOR_ROLE_REQUIRED' });
        return;
      }
      const visitId = req.params.id;
      if (!visitId) {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'Missing :id route param' });
        return;
      }
      const parsed = RejectFlaggedVisitInput.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      await withIdempotency(
        req,
        reply,
        // Cluster B fix (P0, deep-review 2026-05-18): resource-id-embedded routeKey.
        { companyId: auth.companyId, routeKey: `POST:/visits/${visitId}/reject` },
        async () => {
          const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
            rejectFlaggedVisit(tx, {
              companyId: auth.companyId,
              supervisorUserId: auth.userId,
              visitId,
              supervisorReason: parsed.data.supervisorReason,
            }),
          );

          if (out.kind === 'VISIT_NOT_FOUND') {
            return { status: 404, body: { error: 'VISIT_NOT_FOUND' } };
          }
          if (out.kind === 'VISIT_NOT_FLAGGED') {
            return {
              status: 409,
              body: {
                error: 'ALREADY_DECIDED',
                message: 'Visit is no longer flagged.',
              },
            };
          }
          if (out.kind === 'VISIT_STATE_INVALID') {
            return {
              status: 409,
              body: {
                error: 'VISIT_STATE_INVALID',
                message: `Visit is in state ${out.currentState} and cannot be rejected.`,
                currentState: out.currentState,
              },
            };
          }
          req.log.info(
            {
              event: 'visit.rejected',
              visitId,
              supervisorUserId: auth.userId,
              previousState: out.previousState,
            },
            'flagged visit rejected',
          );
          return {
            status: 200,
            body: {
              ok: true,
              visitId,
              previousState: out.previousState,
              flagged: out.visit.flagged,
              state: out.visit.state,
            },
          };
        },
      );
    },
  );
}
