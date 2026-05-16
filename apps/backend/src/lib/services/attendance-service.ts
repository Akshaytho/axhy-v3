/**
 * Attendance service — tx-callable domain function for `mark absent`.
 *
 * Extracted from `apps/backend/src/routes/workers.ts` (POST /workers/:id/mark-absent)
 * for F-002.b (round-2 R2b-iii). Same atomicity pattern as
 * createAssignmentService / createLeaveRequestService.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G)
 * Linked specs:
 *   - F-002.b — round-2 R2b-iii service extraction
 *   - production-grade-rulebook P3 + P8 — atomic workflow
 *   - data-flow §5 — supervisor "Mark worker absent" action
 */

import type { Attendance, Prisma } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';
import { enqueueOutbox } from '../outbox.js';

/** Days per month used for daily-pay computation (master plan §B). */
const WORKING_DAYS_PER_MONTH = 26;

/** @derives(F-002.b) */
export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT_NO_CALL'
  | 'ABSENT_APPROVED_LEAVE'
  | 'HALF_DAY'
  | 'ON_BREAK';

/** @derives(F-002.b) */
export type MarkAbsentServiceInput = {
  workerId: string;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  status: AttendanceStatus;
  reason: string | null;
};

/** @derives(F-002.b) */
export type MarkAbsentServiceAuth = {
  companyId: string;
  userId: string;
};

/** @derives(F-002.b) */
export type MarkAbsentServiceResult =
  | { kind: 'OK'; attendance: Attendance }
  | { kind: 'WORKER_NOT_FOUND' };

/** @derives(F-002.b) — pure computation, moved alongside service body */
export function computeDailyDeductPaise(baseSalaryPaise: number, status: AttendanceStatus): number {
  if (status === 'PRESENT' || status === 'ON_BREAK') return 0;
  if (status === 'ABSENT_APPROVED_LEAVE') return 0;
  const fullDay = Math.round(baseSalaryPaise / WORKING_DAYS_PER_MONTH);
  if (status === 'HALF_DAY') return Math.round(fullDay / 2);
  return fullDay;
}

/**
 * Marks a worker absent (upsert by workerId+date) inside the caller's tx.
 * Emits WORKER_MARKED_ABSENT audit + `hr.worker_absent` outbox + (if any
 * deduction) `payroll.recompute` outbox.
 *
 * Idempotent on (workerId, date) — re-marking the same day updates status +
 * reason + supervisor without creating a duplicate row.
 *
 * @derives(F-002.b — service extraction)
 */
export async function markAbsentService(
  tx: Prisma.TransactionClient,
  input: MarkAbsentServiceInput,
  auth: MarkAbsentServiceAuth,
): Promise<MarkAbsentServiceResult> {
  const worker = await tx.worker.findFirst({
    where: { id: input.workerId, companyId: auth.companyId },
  });
  if (!worker) return { kind: 'WORKER_NOT_FOUND' };

  const payDeductPaise = computeDailyDeductPaise(worker.baseSalaryPaise, input.status);

  const attendance = await tx.attendance.upsert({
    where: { workerId_date: { workerId: input.workerId, date: new Date(input.date) } },
    create: {
      companyId: auth.companyId,
      workerId: input.workerId,
      date: new Date(input.date),
      status: input.status,
      markedBySupervisorId: auth.userId,
      reason: input.reason,
      payDeductPaise,
    },
    update: {
      status: input.status,
      markedBySupervisorId: auth.userId,
      reason: input.reason,
      payDeductPaise,
    },
  });

  await recordAuditEvent(tx, {
    companyId: auth.companyId,
    kind: 'WORKER_MARKED_ABSENT',
    actorId: auth.userId,
    targetId: input.workerId,
    payload: {
      date: input.date,
      status: input.status,
      reason: input.reason,
      payDeductPaise,
      workerName: worker.name,
    },
  });

  await enqueueOutbox(tx, {
    companyId: auth.companyId,
    topic: 'hr.worker_absent',
    payload: {
      workerId: input.workerId,
      workerName: worker.name,
      workerPhone: worker.phone,
      supervisorId: auth.userId,
      date: input.date,
      status: input.status,
      payDeductPaise,
    },
  });

  if (payDeductPaise > 0) {
    await enqueueOutbox(tx, {
      companyId: auth.companyId,
      topic: 'payroll.recompute',
      payload: { workerId: input.workerId, monthOf: input.date.slice(0, 7) },
    });
  }

  return { kind: 'OK', attendance };
}
