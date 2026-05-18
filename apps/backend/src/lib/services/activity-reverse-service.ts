/**
 * activity-reverse-service — supervisor Reverse / soft-flag of an AuditEvent.
 *
 * Wave 4 compliance flow (2026-05-18). The supervisor's Activity feed gives
 * them a 30-minute "did I just do that by mistake?" window on a curated set
 * of reversible kinds (REVERSIBLE_ACTIVITY_KINDS in @axhy/shared-schema).
 * Beyond the window or for non-reversible kinds the supervisor soft-flags
 * the event to HR — a SupervisorDecision row that the HR portal will
 * surface when it lands.
 *
 * Both writes are tx-callable so the route handler can compose them with
 * `withTenantContext` + `withIdempotency`.
 *
 * Reverse path semantics, one kind at a time:
 *
 *   WORKER_MARKED_ABSENT
 *     The audit row was emitted by `markAbsentService` after an Attendance
 *     upsert. The reverse path deletes that Attendance row (the canonical
 *     undo per VisitState / Attendance machine — Attendance is keyed on
 *     `(workerId, date)`, and no row means "no decision recorded"). Emits
 *     a compensating `ATTENDANCE_REVERSED` AuditEvent in addition to the
 *     supervisor-intent `ACTIVITY_REVERSED` row.
 *
 *   LEAVE_APPROVED
 *     Returns the LeaveRequest to state `REQUESTED`, clears decidedBy /
 *     decidedAt / decisionNote. Emits `LEAVE_REVERSED`.
 *
 *   ASSIGNMENT_CREATED
 *     Transitions Assignment.state to `TERMINATED` with a system reason of
 *     `reversed_within_30_min`. Emits `ASSIGNMENT_REVERSED`.
 *
 *   REPLACEMENT_INVITE_ACCEPTED
 *     The acceptance auto-created an Assignment (replacement-invite-service
 *     line 361). The reverse path terminates that Assignment AND returns
 *     the ReplacementInvite to a terminal `CANCELLED` status with respond
 *     reason `reversed_by_supervisor`, so re-acceptance is impossible.
 *     Emits `ASSIGNMENT_REVERSED` (the Assignment side) — the
 *     `ACTIVITY_REVERSED` row carries the source ref.
 *
 * Cross-tenant: every read is companyId-filtered. A supervisor on Tenant A
 * cannot reverse an event that lives on Tenant B (returns AUDIT_NOT_FOUND
 * → 404, same envelope as "doesn't exist" to avoid info leak).
 *
 * Self-only: the supervisor can only reverse events they themselves
 * originated (AuditEvent.actorId == auth.supervisorUserId). Otherwise
 * NOT_OWN_EVENT → 403. The product reasoning: a supervisor who never made
 * the decision shouldn't be able to undo it; HR is the right path for
 * cross-supervisor corrections.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 * @derives(feedback_production_grade_workflow_rules.md P3 + P5)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 * @derives(master-plan §G) — supervisor surface
 */

import type { Prisma } from '@prisma/client';
import {
  ACTIVITY_REVERSE_WINDOW_MS,
  isReversibleActivityKind,
  type ReversibleActivityKind,
} from '@axhy/shared-schema';

import { recordAuditEvent } from '../audit-event.js';

/** Result discriminator for the Reverse path. */
export type ReverseActivityResult =
  | {
      kind: 'OK';
      sourceKind: ReversibleActivityKind;
      sourceAuditEventId: string;
      reverseAuditEventId: string;
      compensatingAuditEventId: string;
    }
  | { kind: 'AUDIT_NOT_FOUND' }
  | { kind: 'NOT_OWN_EVENT' }
  | { kind: 'WINDOW_CLOSED'; windowMs: number; elapsedMs: number }
  | { kind: 'KIND_NOT_REVERSIBLE'; sourceKind: string }
  | { kind: 'ALREADY_REVERSED' }
  | { kind: 'UNDERLYING_ROW_MISSING'; sourceKind: ReversibleActivityKind };

/** Result discriminator for the soft-flag (HR-review) path. */
export type SoftFlagActivityResult =
  | {
      kind: 'OK';
      decisionId: string;
      sourceAuditEventId: string;
      sourceKind: string;
    }
  | { kind: 'AUDIT_NOT_FOUND' }
  | { kind: 'NOT_OWN_EVENT' }
  | { kind: 'WINDOW_OPEN'; windowMs: number; elapsedMs: number };

export type ReverseActivityInput = {
  companyId: string;
  /** User.id of the supervisor; must match the source AuditEvent.actorId. */
  supervisorUserId: string;
  auditEventId: string;
  /** Override clock for tests. Defaults to `new Date()`. */
  now?: Date;
};

export type SoftFlagActivityInput = {
  companyId: string;
  supervisorUserId: string;
  auditEventId: string;
  /** Optional free-form supervisor note to attach to the HR-review decision. */
  note: string | null;
  /** Override clock for tests. Defaults to `new Date()`. */
  now?: Date;
};

/**
 * Reverse an in-window AuditEvent. Looks up the source row, validates
 * authorization (own + reversible + within-window + not-already-reversed),
 * then dispatches to a per-kind compensating writer. Emits an
 * `ACTIVITY_REVERSED` audit row that carries the source ref, in addition
 * to the per-kind compensating audit row (ATTENDANCE_REVERSED, etc.).
 */
export async function reverseActivity(
  tx: Prisma.TransactionClient,
  input: ReverseActivityInput,
): Promise<ReverseActivityResult> {
  const now = input.now ?? new Date();

  const source = await tx.auditEvent.findFirst({
    where: { id: input.auditEventId, companyId: input.companyId },
    select: {
      id: true,
      kind: true,
      actorId: true,
      targetId: true,
      payload: true,
      createdAt: true,
    },
  });
  if (!source) return { kind: 'AUDIT_NOT_FOUND' };
  if (source.actorId !== input.supervisorUserId) return { kind: 'NOT_OWN_EVENT' };

  const elapsedMs = now.getTime() - source.createdAt.getTime();
  if (elapsedMs >= ACTIVITY_REVERSE_WINDOW_MS) {
    return { kind: 'WINDOW_CLOSED', windowMs: ACTIVITY_REVERSE_WINDOW_MS, elapsedMs };
  }

  if (!isReversibleActivityKind(source.kind)) {
    return { kind: 'KIND_NOT_REVERSIBLE', sourceKind: source.kind };
  }

  // Idempotency guard — if any ACTIVITY_REVERSED row already points at this
  // source, treat as a no-op success-shaped failure. Distinct from
  // Idempotency-Key (same request resent) — this catches a NEW request
  // that races a prior reverse.
  const priorReverse = await tx.auditEvent.findFirst({
    where: {
      companyId: input.companyId,
      kind: 'ACTIVITY_REVERSED',
      targetId: input.auditEventId,
    },
    select: { id: true },
  });
  if (priorReverse) return { kind: 'ALREADY_REVERSED' };

  // Per-kind compensating action + compensating audit kind.
  let compensatingAuditEventId: string;
  const sourceKind = source.kind as ReversibleActivityKind;
  switch (sourceKind) {
    case 'WORKER_MARKED_ABSENT': {
      // Audit payload from markAbsentService carries date + workerId is
      // mirrored at AuditEvent.targetId. Composite unique key on Attendance
      // is (workerId, date) so we deleteMany on that pair.
      const payload = source.payload as Record<string, unknown>;
      const date = typeof payload.date === 'string' ? payload.date : null;
      const workerId = source.targetId;
      if (!date || !workerId) {
        return { kind: 'UNDERLYING_ROW_MISSING', sourceKind };
      }
      const del = await tx.attendance.deleteMany({
        where: { companyId: input.companyId, workerId, date: new Date(date) },
      });
      if (del.count === 0) return { kind: 'UNDERLYING_ROW_MISSING', sourceKind };
      const ev = await recordAuditEvent(tx, {
        companyId: input.companyId,
        kind: 'ATTENDANCE_REVERSED',
        actorId: input.supervisorUserId,
        targetId: workerId,
        payload: {
          date,
          workerId,
          sourceAuditEventId: source.id,
          reversedAt: now.toISOString(),
          reversedBy: input.supervisorUserId,
        },
      });
      compensatingAuditEventId = ev.id;
      break;
    }
    case 'LEAVE_APPROVED': {
      const payload = source.payload as Record<string, unknown>;
      const leaveRequestId =
        typeof payload.leaveRequestId === 'string' ? payload.leaveRequestId : null;
      if (!leaveRequestId) return { kind: 'UNDERLYING_ROW_MISSING', sourceKind };
      const upd = await tx.leaveRequest.updateMany({
        where: { id: leaveRequestId, companyId: input.companyId, state: 'APPROVED' },
        data: { state: 'REQUESTED', decidedBy: null, decidedAt: null, decisionNote: null },
      });
      if (upd.count === 0) return { kind: 'UNDERLYING_ROW_MISSING', sourceKind };
      const ev = await recordAuditEvent(tx, {
        companyId: input.companyId,
        kind: 'LEAVE_REVERSED',
        actorId: input.supervisorUserId,
        targetId: leaveRequestId,
        payload: {
          leaveRequestId,
          sourceAuditEventId: source.id,
          reversedAt: now.toISOString(),
          reversedBy: input.supervisorUserId,
        },
      });
      compensatingAuditEventId = ev.id;
      break;
    }
    case 'ASSIGNMENT_CREATED': {
      // The Assignment row id is at AuditEvent.targetId per
      // assignment-service / calendar.ts ASSIGNMENT_CREATED emit.
      const assignmentId = source.targetId;
      if (!assignmentId) return { kind: 'UNDERLYING_ROW_MISSING', sourceKind };
      const upd = await tx.assignment.updateMany({
        where: { id: assignmentId, companyId: input.companyId, state: 'ACTIVE' },
        data: {
          state: 'TERMINATED',
          terminatedReason: 'reversed_within_30_min',
          terminatedBy: input.supervisorUserId,
        },
      });
      if (upd.count === 0) {
        // The assignment row may have already been TERMINATED via another path.
        return { kind: 'UNDERLYING_ROW_MISSING', sourceKind };
      }
      const ev = await recordAuditEvent(tx, {
        companyId: input.companyId,
        kind: 'ASSIGNMENT_REVERSED',
        actorId: input.supervisorUserId,
        targetId: assignmentId,
        payload: {
          assignmentId,
          sourceAuditEventId: source.id,
          reversedAt: now.toISOString(),
          reversedBy: input.supervisorUserId,
        },
      });
      compensatingAuditEventId = ev.id;
      break;
    }
    case 'REPLACEMENT_INVITE_ACCEPTED': {
      // The acceptance row carries the auto-created Assignment id in its
      // payload (replacement-invite-service line 382).
      const payload = source.payload as Record<string, unknown>;
      const assignmentId = typeof payload.assignmentId === 'string' ? payload.assignmentId : null;
      const inviteId = source.targetId;
      if (!assignmentId || !inviteId) return { kind: 'UNDERLYING_ROW_MISSING', sourceKind };
      const upd = await tx.assignment.updateMany({
        where: { id: assignmentId, companyId: input.companyId, state: 'ACTIVE' },
        data: {
          state: 'TERMINATED',
          terminatedReason: 'reversed_within_30_min',
          terminatedBy: input.supervisorUserId,
        },
      });
      if (upd.count === 0) return { kind: 'UNDERLYING_ROW_MISSING', sourceKind };
      // Also clamp the invite back to a terminal CANCELLED so a stray
      // re-accept tap on the worker's device can't recreate the assignment.
      await tx.replacementInvite.updateMany({
        where: { id: inviteId, companyId: input.companyId, status: 'ACCEPTED' },
        data: {
          status: 'CANCELLED',
          respondReason: 'reversed_by_supervisor',
          respondedAt: now,
        },
      });
      const ev = await recordAuditEvent(tx, {
        companyId: input.companyId,
        kind: 'ASSIGNMENT_REVERSED',
        actorId: input.supervisorUserId,
        targetId: assignmentId,
        payload: {
          assignmentId,
          inviteId,
          sourceAuditEventId: source.id,
          reversedAt: now.toISOString(),
          reversedBy: input.supervisorUserId,
        },
      });
      compensatingAuditEventId = ev.id;
      break;
    }
  }

  // Supervisor-intent audit row. targetId is the source AuditEvent.id so
  // the prior-reverse guard above can spot a duplicate next time.
  const reverseEvent = await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'ACTIVITY_REVERSED',
    actorId: input.supervisorUserId,
    targetId: source.id,
    payload: {
      sourceAuditEventId: source.id,
      sourceKind: source.kind,
      reversedAt: now.toISOString(),
      reversedBy: input.supervisorUserId,
    },
  });

  return {
    kind: 'OK',
    sourceKind,
    sourceAuditEventId: source.id,
    reverseAuditEventId: reverseEvent.id,
    compensatingAuditEventId,
  };
}

/**
 * Soft-flag a past-window AuditEvent to HR. Creates an OPERATIONAL-tier
 * SupervisorDecision row (kind = `LATE_REVERSAL_REQUEST`) that the HR
 * portal will surface when it lands. Until then it sits in the queue +
 * audit log, ready for HR-portal day-1.
 *
 * Same authorization story as Reverse: caller must be the originating
 * supervisor (AuditEvent.actorId match).
 *
 * NOTE: the route allows soft-flag from inside the window TOO — the
 * supervisor may genuinely want HR review on a fresh action (e.g., "I
 * marked Ravi absent but his wife just called — please reverse and
 * mark approved leave"). In that case Window state is OPEN; we still
 * accept the request and emit the decision. The product UX greys the
 * soft-flag button while reverse is the primary CTA, but the API
 * remains permissive.
 *
 * UPDATE on review: per the plan §3 Wave 4 lock — "Beyond 30 min →
 * button currently greys with text 'Window closed — soft-flag for HR'".
 * The window-closed path is the canonical soft-flag entry. The window-
 * open path is rejected (WINDOW_OPEN → 422) so the supervisor uses
 * Reverse when they CAN. HR queue stays focused on cases that need it.
 */
export async function softFlagActivity(
  tx: Prisma.TransactionClient,
  input: SoftFlagActivityInput,
): Promise<SoftFlagActivityResult> {
  const now = input.now ?? new Date();

  const source = await tx.auditEvent.findFirst({
    where: { id: input.auditEventId, companyId: input.companyId },
    select: { id: true, kind: true, actorId: true, targetId: true, createdAt: true },
  });
  if (!source) return { kind: 'AUDIT_NOT_FOUND' };
  if (source.actorId !== input.supervisorUserId) return { kind: 'NOT_OWN_EVENT' };

  const elapsedMs = now.getTime() - source.createdAt.getTime();
  if (elapsedMs < ACTIVITY_REVERSE_WINDOW_MS) {
    return { kind: 'WINDOW_OPEN', windowMs: ACTIVITY_REVERSE_WINDOW_MS, elapsedMs };
  }

  const decision = await tx.supervisorDecision.create({
    data: {
      companyId: input.companyId,
      supervisorId: input.supervisorUserId,
      kind: 'LATE_REVERSAL_REQUEST',
      tier: 'OPERATIONAL',
      targetId: source.id,
      payload: {
        sourceAuditEventId: source.id,
        sourceKind: source.kind,
        sourceTargetId: source.targetId,
        note: input.note,
        requestedAt: now.toISOString(),
        requestedBy: input.supervisorUserId,
      },
    },
    select: { id: true },
  });

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'ACTIVITY_LATE_REVERSAL_REQUESTED',
    actorId: input.supervisorUserId,
    targetId: source.id,
    payload: {
      sourceAuditEventId: source.id,
      sourceKind: source.kind,
      decisionId: decision.id,
      requestedAt: now.toISOString(),
      requestedBy: input.supervisorUserId,
    },
  });

  return {
    kind: 'OK',
    decisionId: decision.id,
    sourceAuditEventId: source.id,
    sourceKind: source.kind,
  };
}
