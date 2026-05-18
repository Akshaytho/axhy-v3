/**
 * Activity Reverse / soft-flag routes — Wave 4 compliance flow (2026-05-18).
 *
 *   POST /activity/:id/reverse
 *       Within the 30-minute reversal window: undo the source AuditEvent
 *       by dispatching the per-kind compensating writer (see
 *       activity-reverse-service.ts). Body is `{}` today; reserved for
 *       forward-compat. Idempotency-Key supported. The route returns
 *       422 KIND_NOT_REVERSIBLE for kinds outside the reversible set.
 *
 *   POST /activity/:id/soft-flag
 *       Beyond the 30-minute window: create a LATE_REVERSAL_REQUEST
 *       SupervisorDecision row that HR will surface in the HR portal
 *       (once it lands). Body: `{ note?: string | null }`. Idempotency-Key
 *       supported. Rejects requests inside the window with 422 WINDOW_OPEN
 *       so the supervisor uses Reverse when they CAN.
 *
 * Both routes require role=SUPERVISOR. Cross-tenant attempts return 404.
 * Self-only — the caller must be the originating supervisor on the source
 * AuditEvent (NOT_OWN_EVENT → 403).
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 * @derives(feedback_production_grade_workflow_rules.md P3 + P8)
 * @derives(master-plan §G) — supervisor surface
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ReverseActivityInput, SoftFlagActivityInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { withIdempotency } from '../lib/idempotency-key.js';
import { reverseActivity, softFlagActivity } from '../lib/services/activity-reverse-service.js';

type IdParams = FastifyRequest<{ Params: { id: string } }>;

/**
 * Register the Wave 4 activity-reverse routes on `app`.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export async function registerActivityRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /activity/:id/reverse ──────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/activity/:id/reverse',
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
      const auditEventId = req.params.id;
      if (!auditEventId) {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'Missing :id route param' });
        return;
      }
      const parsed = ReverseActivityInput.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      await withIdempotency(
        req,
        reply,
        { companyId: auth.companyId, routeKey: 'POST:/activity/:id/reverse' },
        async () => {
          const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
            reverseActivity(tx, {
              companyId: auth.companyId,
              supervisorUserId: auth.userId,
              auditEventId,
            }),
          );

          if (out.kind === 'AUDIT_NOT_FOUND') {
            return { status: 404, body: { error: 'ACTIVITY_NOT_FOUND' } };
          }
          if (out.kind === 'NOT_OWN_EVENT') {
            return { status: 403, body: { error: 'NOT_OWN_EVENT' } };
          }
          if (out.kind === 'WINDOW_CLOSED') {
            return {
              status: 422,
              body: {
                error: 'WINDOW_CLOSED',
                message: 'Reversal window has closed. Use soft-flag to request HR review.',
                windowMs: out.windowMs,
                elapsedMs: out.elapsedMs,
              },
            };
          }
          if (out.kind === 'KIND_NOT_REVERSIBLE') {
            return {
              status: 422,
              body: { error: 'KIND_NOT_REVERSIBLE', sourceKind: out.sourceKind },
            };
          }
          if (out.kind === 'ALREADY_REVERSED') {
            return { status: 409, body: { error: 'ALREADY_REVERSED' } };
          }
          if (out.kind === 'UNDERLYING_ROW_MISSING') {
            return {
              status: 409,
              body: {
                error: 'UNDERLYING_ROW_MISSING',
                message:
                  'The underlying row has already been changed by another path; reverse is no longer possible.',
                sourceKind: out.sourceKind,
              },
            };
          }
          req.log.info(
            {
              event: 'activity.reversed',
              sourceAuditEventId: out.sourceAuditEventId,
              sourceKind: out.sourceKind,
              supervisorUserId: auth.userId,
            },
            'activity reversed',
          );
          return {
            status: 200,
            body: {
              ok: true,
              sourceAuditEventId: out.sourceAuditEventId,
              sourceKind: out.sourceKind,
              reverseAuditEventId: out.reverseAuditEventId,
              compensatingAuditEventId: out.compensatingAuditEventId,
            },
          };
        },
      );
    },
  );

  // ── POST /activity/:id/soft-flag ────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/activity/:id/soft-flag',
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
      const auditEventId = req.params.id;
      if (!auditEventId) {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'Missing :id route param' });
        return;
      }
      const parsed = SoftFlagActivityInput.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      await withIdempotency(
        req,
        reply,
        { companyId: auth.companyId, routeKey: 'POST:/activity/:id/soft-flag' },
        async () => {
          const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
            softFlagActivity(tx, {
              companyId: auth.companyId,
              supervisorUserId: auth.userId,
              auditEventId,
              note: parsed.data.note ?? null,
            }),
          );

          if (out.kind === 'AUDIT_NOT_FOUND') {
            return { status: 404, body: { error: 'ACTIVITY_NOT_FOUND' } };
          }
          if (out.kind === 'NOT_OWN_EVENT') {
            return { status: 403, body: { error: 'NOT_OWN_EVENT' } };
          }
          if (out.kind === 'WINDOW_OPEN') {
            return {
              status: 422,
              body: {
                error: 'WINDOW_OPEN',
                message: 'Reversal window is still open; use Reverse instead of soft-flag.',
                windowMs: out.windowMs,
                elapsedMs: out.elapsedMs,
              },
            };
          }
          req.log.info(
            {
              event: 'activity.soft_flagged',
              sourceAuditEventId: out.sourceAuditEventId,
              sourceKind: out.sourceKind,
              decisionId: out.decisionId,
              supervisorUserId: auth.userId,
            },
            'activity soft-flagged for HR review',
          );
          return {
            status: 200,
            body: {
              ok: true,
              decisionId: out.decisionId,
              sourceAuditEventId: out.sourceAuditEventId,
              sourceKind: out.sourceKind,
            },
          };
        },
      );
    },
  );
}
