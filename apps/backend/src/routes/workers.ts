/**
 * Worker-scoped supervisor routes.
 *
 * POST /workers/:id/mark-absent
 *   Marks a worker absent for a given date (PERSONNEL-tier action). Inside
 *   one Prisma transaction:
 *     1. Verify worker belongs to caller's company (RLS already protects;
 *        we double-check to return clean 404)
 *     2. Compute payDeductPaise from worker.baseSalaryPaise
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
import { recordAuditEvent } from '../lib/audit-event.js';
import { enqueueOutbox } from '../lib/outbox.js';

/** Days per month used for daily-pay computation. Locked at 26 per
 * master plan §B (cleaning industry standard: 6-day week, 4.33 weeks). */
const WORKING_DAYS_PER_MONTH = 26;

function computeDailyDeductPaise(
  baseSalaryPaise: number,
  status: 'PRESENT' | 'ABSENT_NO_CALL' | 'ABSENT_APPROVED_LEAVE' | 'HALF_DAY' | 'ON_BREAK',
): number {
  if (status === 'PRESENT' || status === 'ON_BREAK') return 0;
  if (status === 'ABSENT_APPROVED_LEAVE') return 0; // approved leave = paid
  const fullDay = Math.round(baseSalaryPaise / WORKING_DAYS_PER_MONTH);
  if (status === 'HALF_DAY') return Math.round(fullDay / 2);
  return fullDay; // ABSENT_NO_CALL → full deduction
}

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
        const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
          const worker = await tx.worker.findFirst({
            where: { id: workerId, companyId: auth.companyId },
          });
          if (!worker) {
            return { kind: 'NOT_FOUND' as const };
          }

          const payDeductPaise = computeDailyDeductPaise(worker.baseSalaryPaise, status);

          // Upsert Attendance — re-marking the same (worker, date) updates
          // status + supervisor + reason. Avoids dup rows for same day.
          const attendance = await tx.attendance.upsert({
            where: { workerId_date: { workerId, date: new Date(date) } },
            create: {
              companyId: auth.companyId,
              workerId,
              date: new Date(date),
              status,
              markedBySupervisorId: auth.userId,
              reason: reason ?? null,
              payDeductPaise,
            },
            update: {
              status,
              markedBySupervisorId: auth.userId,
              reason: reason ?? null,
              payDeductPaise,
            },
          });

          await recordAuditEvent(tx, {
            companyId: auth.companyId,
            kind: 'WORKER_MARKED_ABSENT',
            actorId: auth.userId,
            targetId: workerId,
            payload: {
              date,
              status,
              reason: reason ?? null,
              payDeductPaise,
              workerName: worker.name,
            },
          });

          // Notify HR via WhatsApp (Phase C — stubbed in dispatcher today)
          await enqueueOutbox(tx, {
            companyId: auth.companyId,
            topic: 'hr.worker_absent',
            payload: {
              workerId,
              workerName: worker.name,
              workerPhone: worker.phone,
              supervisorId: auth.userId,
              date,
              status,
              payDeductPaise,
            },
          });

          // Recompute monthly running tally (Phase C — stubbed)
          if (payDeductPaise > 0) {
            await enqueueOutbox(tx, {
              companyId: auth.companyId,
              topic: 'payroll.recompute',
              payload: { workerId, monthOf: date.slice(0, 7) }, // YYYY-MM
            });
          }

          return {
            kind: 'OK' as const,
            attendance,
          };
        });

        if (out.kind === 'NOT_FOUND') {
          reply.code(404).send({
            error: 'WORKER_NOT_FOUND',
            message: 'Worker not found in this company',
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
