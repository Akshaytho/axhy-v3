/**
 * Wave 4 compliance flow — request body Zod schemas.
 *
 * Shared between the supervisor mobile app (POST callers) and the backend
 * route handlers (POST validators). Single source of truth so client +
 * server can never drift.
 *
 * Surfaces:
 *   POST /visits/:id/resolve   — flagged-visit Resolve (FlaggedReviewSheet)
 *   POST /visits/:id/reject    — flagged-visit Reject  (FlaggedReviewSheet)
 *   POST /activity/:id/reverse — Activity Reverse within 30-min window
 *   POST /activity/:id/soft-flag — Activity beyond-window → HR review
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */

import { z } from 'zod';

/**
 * Body of `POST /visits/:id/resolve`.
 *
 * `supervisorReason` is OPTIONAL — the Resolve path is non-destructive
 * (flips Visit.flagged from true → false) and many supervisors will just
 * tap "looks fine". When present, must be 1..1000 chars after trim;
 * empty strings reject at validation time to avoid all-whitespace noise
 * showing up in the audit trail.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export const ResolveFlaggedVisitInput = z
  .object({
    supervisorReason: z
      .string()
      .trim()
      .min(1, 'supervisorReason must not be empty')
      .max(1000, 'supervisorReason max 1000 chars')
      .nullable()
      .optional(),
  })
  .strict();

/** Inferred input type. */
export type ResolveFlaggedVisitInputT = z.infer<typeof ResolveFlaggedVisitInput>;

/**
 * Body of `POST /visits/:id/reject`.
 *
 * `supervisorReason` is REQUIRED on the reject path — the typed-phrase
 * confirmation (`REJECT`) on the client surfaces a textarea before the
 * mutation fires. Audit trail demands a reason: a Reject is destructive
 * (transitions Visit.state to REJECTED), and "why" is the most important
 * field for the HR portal and the AI extractor to learn from.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export const RejectFlaggedVisitInput = z
  .object({
    supervisorReason: z
      .string()
      .trim()
      .min(1, 'supervisorReason is required on reject')
      .max(1000, 'supervisorReason max 1000 chars'),
  })
  .strict();

/** Inferred input type. */
export type RejectFlaggedVisitInputT = z.infer<typeof RejectFlaggedVisitInput>;

/**
 * Body of `POST /activity/:id/reverse`.
 *
 * No body fields are required today — the reversal kind + window are
 * derived from the source AuditEvent on the server. Reserved for forward
 * compat: future revisions may carry a free-form `note`.
 *
 * `.strict()` rejects unknown keys so clients can't silently send garbage.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export const ReverseActivityInput = z.object({}).strict();

/** Inferred input type. */
export type ReverseActivityInputT = z.infer<typeof ReverseActivityInput>;

/**
 * Body of `POST /activity/:id/soft-flag`.
 *
 * `note` is OPTIONAL free-form context — supervisors often add a short
 * explanation when asking HR to undo a past-window action (e.g. "wrong
 * worker, please reverse"). Max 1000 chars; nullable.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export const SoftFlagActivityInput = z
  .object({
    note: z
      .string()
      .trim()
      .min(1, 'note must not be empty')
      .max(1000, 'note max 1000 chars')
      .nullable()
      .optional(),
  })
  .strict();

/** Inferred input type. */
export type SoftFlagActivityInputT = z.infer<typeof SoftFlagActivityInput>;

/**
 * Reversal window — 30 minutes from the source AuditEvent.createdAt to the
 * moment the supervisor taps Reverse. Hardcoded here (not a Policy row) so
 * client + server agree without a round-trip; widening to a per-tenant
 * Policy is a follow-on if customers ask.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export const ACTIVITY_REVERSE_WINDOW_MS = 30 * 60 * 1000;

/**
 * The set of AuditEvent kinds that the `POST /activity/:id/reverse` route
 * supports as a same-supervisor undo within the 30-min window. Anything
 * outside this set returns HTTP 422 KIND_NOT_REVERSIBLE — the supervisor
 * must use the soft-flag path instead, which forwards to HR regardless of
 * kind.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export const REVERSIBLE_ACTIVITY_KINDS = [
  'WORKER_MARKED_ABSENT',
  'LEAVE_APPROVED',
  'ASSIGNMENT_CREATED',
  'REPLACEMENT_INVITE_ACCEPTED',
] as const;

/** Type-narrowed union of reversible kinds. */
export type ReversibleActivityKind = (typeof REVERSIBLE_ACTIVITY_KINDS)[number];

/** Type guard for reversible kinds. */
export function isReversibleActivityKind(kind: string): kind is ReversibleActivityKind {
  return (REVERSIBLE_ACTIVITY_KINDS as readonly string[]).includes(kind);
}
