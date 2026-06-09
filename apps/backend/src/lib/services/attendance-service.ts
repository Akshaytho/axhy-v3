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

import { assertCallerSupervisesWorker } from '../authorization/supervises-worker.js';
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

/** @derives(F-002.b) @derives(panel-2026-05-17) — Q2=B mark-absent hardening */
export type MarkAbsentServiceResult =
  | { kind: 'OK'; attendance: Attendance }
  | { kind: 'WORKER_NOT_FOUND' }
  | { kind: 'NOT_SUPERVISOR'; effectiveUserId: string | null };

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

  // Q2=B (panel-2026-05-17): cross-tenant is already rejected above as
  // WORKER_NOT_FOUND; this check rejects cross-supervisor-within-same-tenant.
  // Lives in the service (not the route) so chat-routed callers — and any
  // future worker-targeted DWI writer — inherit the same guarantee.
  const authzCheck = await assertCallerSupervisesWorker(tx, {
    companyId: auth.companyId,
    callerUserId: auth.userId,
    workerId: input.workerId,
  });
  if (authzCheck.kind === 'FORBIDDEN') {
    return { kind: 'NOT_SUPERVISOR', effectiveUserId: authzCheck.effectiveUserId };
  }
  if (authzCheck.kind === 'NO_PRIMARY_SITE' || authzCheck.kind === 'NO_EFFECTIVE_BINDING') {
    return { kind: 'NOT_SUPERVISOR', effectiveUserId: null };
  }

  // ADR-0025: salary lives on Membership now, joined by (companyId, userId, role=WORKER).
  // Worker without a User row (PENDING_ACTIVATION pre-OTP) cannot have salary; deduct 0.
  let baseSalaryPaise = 0;
  if (worker.userId) {
    const membership = await tx.membership.findFirst({
      where: {
        userId: worker.userId,
        companyId: auth.companyId,
        role: 'WORKER',
      },
      select: { baseSalaryPaise: true },
    });
    baseSalaryPaise = membership?.baseSalaryPaise ?? 0;
  }
  const payDeductPaise = computeDailyDeductPaise(baseSalaryPaise, input.status);

  // #13 idempotency: only emit notifications + payroll recompute when this mark
  // actually CHANGES the attendance (status or deduction). A repeated identical
  // mark (retry / double-click) upserts the same row but must NOT re-fire the
  // hr.worker_absent + payroll.recompute outbox at scale.
  const existing = await tx.attendance.findUnique({
    where: { workerId_date: { workerId: input.workerId, date: new Date(input.date) } },
    select: { status: true, payDeductPaise: true },
  });
  const changed =
    !existing || existing.status !== input.status || existing.payDeductPaise !== payDeductPaise;

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

  // #13: emit the audit + outbox only when the mark changed something. A no-op
  // re-mark (same status + same deduction) returns OK without re-firing anything.
  if (changed) {
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

    // Recompute payroll whenever the mark changed — a correction back to a
    // zero-deduction status (e.g. ABSENT→PRESENT) changes payDeductPaise, so
    // `changed` is true and the prior deduction is RESTORED. Month-level tally.
    await enqueueOutbox(tx, {
      companyId: auth.companyId,
      topic: 'payroll.recompute',
      payload: { workerId: input.workerId, monthOf: input.date.slice(0, 7) },
    });
  }

  return { kind: 'OK', attendance };
}
