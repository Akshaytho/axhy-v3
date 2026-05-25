/**
 * Worker-scoped supervisor routes.
 *
 * POST /workers/:id/mark-absent
 *   Marks a worker absent for a given date (PERSONNEL-tier action). Inside
 *   one Prisma transaction:
 *     1. Verify worker belongs to caller's company (RLS already protects;
 *        we double-check to return clean 404)
 *     2. Compute payDeductPaise from Membership.baseSalaryPaise (ADR-0025)
 *     3. Upsert Attendance row by (workerId, date)
 *     4. Record AuditEvent (kind = WORKER_MARKED_ABSENT)
 *     5. Enqueue Outbox topics (hr.worker_absent + payroll.recompute)
 *
 *   The dispatcher (B.6) drains the outbox topics. No AI here. No real
 *   network calls — outbox handlers are stubbed in B.6 and ship for
 *   real in Phase C.
 *
 * @derives(data-flow §5 — supervisor "Mark worker absent" action)
 * @derives(data-flow §6 — journey of one action: mark absent)
 * @derives(panel-2026-05-08) — Phase B.3
 */

import type { FastifyInstance } from 'fastify';
import { MarkAbsentInput } from '@axhy/shared-schema';
import type { MarkAbsentOutput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { markAbsentService } from '../lib/services/attendance-service.js';

/**
 * Register worker-scoped supervisor routes on the given Fastify app.
 *
 * @derives(ADR-0007) — JWT + tenant-context middleware
 * @derives(data-flow §5 — supervisor "Mark worker absent" action)
 */
export async function registerWorkerRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/workers/:id/mark-absent',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      const parsed = MarkAbsentInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const workerId = req.params.id;
      const { date, status, reason } = parsed.data;

      try {
        // F-002.b (round-2 R2b-iii): route is now a thin wrapper around
        // markAbsentService. /chat/apply (F-002.15) calls the same service
        // INSIDE its own withTenantContext for atomic lifecycle + domain.
        const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
          markAbsentService(
            tx,
            { workerId, date, status, reason: reason ?? null },
            { companyId: auth.companyId, userId: auth.userId },
          ),
        );

        if (out.kind === 'WORKER_NOT_FOUND') {
          reply.code(404).send({
            error: 'WORKER_NOT_FOUND',
            message: 'Worker not found in this company',
          });
          return;
        }

        if (out.kind === 'NOT_SUPERVISOR') {
          // Q2=B (panel-2026-05-17): cross-supervisor-within-same-tenant.
          // Log the caller + effective winner for operator forensics; the
          // external surface stays opaque so callers can't distinguish
          // "wrong supervisor" from "unassigned worker" / "no binding."
          // A dedicated audit kind (WORKER_MARK_ABSENT_REJECTED) is parked
          // for a follow-up ADR — req.log.warn is the contract for now.
          req.log.warn(
            {
              workerId,
              callerUserId: auth.userId,
              effectiveUserId: out.effectiveUserId,
            },
            'mark-absent rejected — caller not the responsible supervisor',
          );
          reply.code(403).send({
            error: 'NOT_SUPERVISOR',
            message: 'You are not the responsible supervisor for this worker today.',
          });
          return;
        }

        const result: MarkAbsentOutput = {
          ok: true,
          attendanceId: out.attendance.id,
          workerId: out.attendance.workerId,
          date: out.attendance.date.toISOString().slice(0, 10),
          status: out.attendance.status as MarkAbsentOutput['status'],
          payDeductPaise: out.attendance.payDeductPaise,
        };
        reply.send(result);
      } catch (err) {
        req.log.error({ err }, 'mark-absent failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not record absence' });
      }
    },
  );
}
