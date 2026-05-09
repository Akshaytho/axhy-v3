/**
 * Supervisor route Zod schemas — shared between backend + mobile.
 *
 * Tier 1 supervisor actions per data-flow §5:
 *   - mark-absent (PERSONNEL tier, single-tap confirm)
 *   - approve-leave / reject-leave (PERSONNEL tier)
 *   - log-complaint (NOTE tier, no confirm)
 *   - swap-worker (OPERATIONAL tier)
 *   - mark-visit-done (OPERATIONAL tier)
 *
 * Each route's Input/Output schemas live here and are imported by
 * apps/backend/src/routes/* (validates request body) and apps/mobile/
 * (types the API client + UI form state).
 *
 * @derives(data-flow §5 — supervisor action catalog)
 * @derives(panel-2026-05-08) — Phase B Tier 1 supervisor routes
 */

import { z } from 'zod';

// ─── Shared types ────────────────────────────────────────────────────────────

/**
 * ISO date-only string (YYYY-MM-DD), accepted by Postgres @db.Date.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/**
 * Attendance status — one of the documented enum values.
 * @derives(data-flow §5 — supervisor mark-absent)
 * @derives(ADR-0007)
 */
export const AttendanceStatusSchema = z.enum([
  'PRESENT',
  'ABSENT_NO_CALL',
  'ABSENT_APPROVED_LEAVE',
  'HALF_DAY',
  'ON_BREAK',
]);

/**
 * Inferred attendance status type.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

/**
 * Decision tier per data-flow §5.
 * @derives(data-flow §5 — decision tier coloring)
 * @derives(ADR-0007)
 */
export const DecisionTierSchema = z.enum(['NOTE', 'OPERATIONAL', 'PERSONNEL', 'EMPLOYMENT']);

/**
 * Inferred decision tier type.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type DecisionTier = z.infer<typeof DecisionTierSchema>;

// ─── POST /workers/:id/mark-absent ───────────────────────────────────────────

/**
 * Input shape for POST /workers/:id/mark-absent.
 * @derives(data-flow §5 — supervisor "Mark worker absent" action)
 * @derives(ADR-0007)
 */
export const MarkAbsentInput = z.object({
  /** Date to mark, YYYY-MM-DD. */
  date: DateOnlySchema,
  /** Status. Defaults to ABSENT_NO_CALL — the most common case. */
  status: AttendanceStatusSchema.default('ABSENT_NO_CALL'),
  /** Optional supervisor reason text. */
  reason: z.string().trim().max(500).optional(),
});

/**
 * Inferred input type for /workers/:id/mark-absent.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type MarkAbsentInput = z.infer<typeof MarkAbsentInput>;

/**
 * Output shape for POST /workers/:id/mark-absent.
 * @derives(data-flow §5 — supervisor "Mark worker absent" action)
 * @derives(ADR-0007)
 */
export const MarkAbsentOutput = z.object({
  ok: z.literal(true),
  attendanceId: z.string().uuid(),
  workerId: z.string().uuid(),
  date: DateOnlySchema,
  status: AttendanceStatusSchema,
  payDeductPaise: z.number().int().nonnegative(),
});

/**
 * Inferred output type for /workers/:id/mark-absent.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type MarkAbsentOutput = z.infer<typeof MarkAbsentOutput>;

// ─── POST /leave-requests/:id/approve | /reject ──────────────────────────────

/**
 * Input shape for POST /leave-requests/:id/approve and /reject.
 * @derives(data-flow §5 — approve leave PERSONNEL tier)
 * @derives(ADR-0007)
 */
export const LeaveDecisionInput = z.object({
  /** Optional supervisor note attached to the decision. */
  note: z.string().trim().max(500).optional(),
});

/**
 * Inferred input type for /leave-requests/:id/{approve,reject}.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type LeaveDecisionInput = z.infer<typeof LeaveDecisionInput>;

/**
 * LeaveRequestState — 12-state machine per data-flow §4.
 * @derives(data-flow §4 — state machines)
 * @derives(ADR-0007)
 */
export const LeaveRequestStateSchema = z.enum([
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'APPLIED',
  'COMPLETED',
]);

/**
 * Output shape for the leave-decision routes.
 * @derives(data-flow §5 — approve leave)
 * @derives(ADR-0007)
 */
export const LeaveDecisionOutput = z.object({
  ok: z.literal(true),
  leaveRequestId: z.string().uuid(),
  workerId: z.string().uuid(),
  state: LeaveRequestStateSchema,
  decidedBy: z.string().uuid(),
  decidedAt: z.string(), // ISO timestamp
});

/**
 * Inferred output type for the leave-decision routes.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type LeaveDecisionOutput = z.infer<typeof LeaveDecisionOutput>;

// ─── POST /sites/:id/complaints ──────────────────────────────────────────────

/**
 * Complaint severity. NOTE-tier action — supervisor logs it without confirm.
 * @derives(data-flow §5 — log complaint NOTE tier)
 * @derives(ADR-0007)
 */
export const ComplaintSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

/**
 * Inferred complaint severity type.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type ComplaintSeverity = z.infer<typeof ComplaintSeveritySchema>;

/**
 * Input shape for POST /sites/:id/complaints.
 * @derives(data-flow §5 — supervisor "Log complaint" action)
 * @derives(ADR-0007)
 */
export const LogComplaintInput = z.object({
  /** Complaint text — supervisor's words via voice or button flow. */
  text: z.string().trim().min(1, 'Text is required').max(2000),
  /** Severity. Defaults to LOW (NOTE-tier). */
  severity: ComplaintSeveritySchema.default('LOW'),
});

/**
 * Inferred input type for /sites/:id/complaints.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type LogComplaintInput = z.infer<typeof LogComplaintInput>;

/**
 * Output shape for POST /sites/:id/complaints.
 * @derives(data-flow §5 — supervisor "Log complaint" action)
 * @derives(ADR-0007)
 */
export const LogComplaintOutput = z.object({
  ok: z.literal(true),
  complaintId: z.string().uuid(),
  siteId: z.string().uuid(),
  severity: ComplaintSeveritySchema,
  loggedBy: z.string().uuid(),
  loggedAt: z.string(), // ISO timestamp
});

/**
 * Inferred output type for /sites/:id/complaints.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type LogComplaintOutput = z.infer<typeof LogComplaintOutput>;
