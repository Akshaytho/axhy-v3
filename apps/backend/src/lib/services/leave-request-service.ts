/**
 * Leave-request service — tx-callable domain function for creating
 * LeaveRequest rows.
 *
 * Extracted from `apps/backend/src/routes/leave-requests.ts` for F-002.b
 * (round-2 R2b-iii). Same atomicity pattern as createAssignmentService.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G)
 * Linked specs:
 *   - F-002.b — round-2 R2b-iii service extraction
 *   - production-grade-rulebook P3 + P8 — atomic workflow
 */

import type { LeaveRequest, Prisma } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';
import { enqueueOutbox } from '../outbox.js';

/** @derives(F-002.b) */
export type CreateLeaveRequestServiceInput = {
  workerId: string;
  /** ISO date string (YYYY-MM-DD). */
  fromDate: string;
  /** ISO date string (YYYY-MM-DD); must be ≥ fromDate (caller validates). */
  toDate: string;
  reason: string;
};

/** @derives(F-002.b) */
export type CreateLeaveRequestServiceAuth = {
  companyId: string;
  userId: string;
};

/** @derives(F-002.b) */
export type CreateLeaveRequestServiceResult =
  | { kind: 'OK'; leave: LeaveRequest }
  | { kind: 'WORKER_NOT_FOUND' };

/**
 * Creates a LeaveRequest row inside the caller's transaction. Verifies the
 * worker exists in the caller's tenant, writes the row, emits
 * LEAVE_REQUESTED audit + `hr.leave_requested` outbox.
 *
 * Caller is responsible for: fromDate ≤ toDate range validation (route does
 * this before calling the service).
 *
 * @derives(F-002.b — service extraction)
 */
export async function createLeaveRequestService(
  tx: Prisma.TransactionClient,
  input: CreateLeaveRequestServiceInput,
  auth: CreateLeaveRequestServiceAuth,
): Promise<CreateLeaveRequestServiceResult> {
  const worker = await tx.worker.findFirst({
    where: { id: input.workerId, companyId: auth.companyId },
  });
  if (!worker) return { kind: 'WORKER_NOT_FOUND' };

  const leave = await tx.leaveRequest.create({
    data: {
      companyId: auth.companyId,
      workerId: input.workerId,
      fromDate: new Date(input.fromDate),
      toDate: new Date(input.toDate),
      reason: input.reason,
      state: 'REQUESTED',
    },
  });

  await recordAuditEvent(tx, {
    companyId: auth.companyId,
    kind: 'LEAVE_REQUESTED',
    actorId: auth.userId,
    targetId: leave.id,
    payload: {
      workerId: input.workerId,
      workerName: worker.name,
      fromDate: input.fromDate,
      toDate: input.toDate,
      reason: input.reason,
    },
  });

  await enqueueOutbox(tx, {
    companyId: auth.companyId,
    topic: 'hr.leave_requested',
    payload: {
      leaveRequestId: leave.id,
      workerId: input.workerId,
      workerName: worker.name,
      workerPhone: worker.phone,
      fromDate: input.fromDate,
      toDate: input.toDate,
      reason: input.reason,
    },
  });

  return { kind: 'OK', leave };
}
