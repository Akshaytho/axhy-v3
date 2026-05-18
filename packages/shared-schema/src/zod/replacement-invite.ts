/**
 * ReplacementInvite (F28) — Zod surface for Wave 1 backend.
 *
 * Single-recipient cover request. Supervisor sends ONE invite to ONE
 * worker, 2-min TTL; on terminal state supervisor may re-send. NOT a
 * multi-worker broadcast — see `feedback_replacement_invite_single_recipient.md`.
 *
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(feedback_replacement_invite_single_recipient.md)
 * @derives(supervisor-30day-scenarios.md scenarios #39–46 — swaps + emergency cover)
 */

import { z } from 'zod';

// ── Status enum (DB CHECK aligned) ──────────────────────────────────────────

/** @derives(master-plan §P.4) — ReplacementInvite lifecycle */
export const ReplacementInviteStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
]);
/** @derives(master-plan §P.4) — ReplacementInvite lifecycle */
export type ReplacementInviteStatus = z.infer<typeof ReplacementInviteStatusSchema>;

// ── Respond-reason categorisation (free-text + sentinel values) ─────────────

/** @derives(master-plan §P.4) — ReplacementInvite respond reasons */
export const ReplacementInviteSystemRespondReasonSchema = z.enum([
  'accept',
  'cron_expired',
  'supervisor_cancelled',
]);
/** @derives(master-plan §P.4) — ReplacementInvite respond reasons */
export type ReplacementInviteSystemRespondReason = z.infer<
  typeof ReplacementInviteSystemRespondReasonSchema
>;

// ── Row shape (DB row → API row) ────────────────────────────────────────────

/** @derives(master-plan §P.4) — ReplacementInvite row contract */
export const ReplacementInviteRowSchema = z.object({
  id: z.string().uuid(),
  fromSupervisorId: z.string().uuid(),
  toWorkerId: z.string().uuid(),
  toWorkerName: z.string().nullable(),
  visitId: z.string().uuid().nullable(),
  siteId: z.string().uuid(),
  siteName: z.string(),
  scheduledStart: z.string(), // ISO datetime
  status: ReplacementInviteStatusSchema,
  sentAt: z.string(), // ISO
  expiresAt: z.string(), // ISO
  respondedAt: z.string().nullable(), // ISO
  respondReason: z.string().nullable(),
});
/** @derives(master-plan §P.4) — ReplacementInvite row contract */
export type ReplacementInviteRowT = z.infer<typeof ReplacementInviteRowSchema>;

// ── Route bodies ────────────────────────────────────────────────────────────

const MIN_EXPIRES_IN_SEC = 30; // anything below this is a UX accident
const MAX_EXPIRES_IN_SEC = 30 * 60; // 30 minutes; longer asks should use a different flow
const DEFAULT_EXPIRES_IN_SEC = 120; // 2-minute countdown per master plan §G:976

/**
 * Body for `POST /supervisor/replacement-invites`.
 *
 * Single-recipient: one supervisor, one worker, one cover slot. No
 * broadcast / "candidates[]" array.
 *
 * @derives(master-plan §P.4)
 * @derives(feedback_replacement_invite_single_recipient.md)
 */
export const CreateReplacementInviteInput = z.object({
  siteId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  candidateUserId: z.string().uuid(),
  visitId: z.string().uuid().nullable().optional(),
  expiresInSec: z
    .number()
    .int()
    .min(MIN_EXPIRES_IN_SEC)
    .max(MAX_EXPIRES_IN_SEC)
    .optional()
    .default(DEFAULT_EXPIRES_IN_SEC),
});
/** @derives(master-plan §P.4) — `POST /supervisor/replacement-invites` body */
export type CreateReplacementInviteInputT = z.infer<typeof CreateReplacementInviteInput>;

/**
 * Body for `POST /worker/replacement-invites/:id/decline`.
 * @derives(master-plan §P.4)
 */
export const DeclineReplacementInviteInput = z.object({
  reason: z.string().trim().min(1).max(500).nullable().optional(),
});
/** @derives(master-plan §P.4) — `POST /worker/replacement-invites/:id/decline` body */
export type DeclineReplacementInviteInputT = z.infer<typeof DeclineReplacementInviteInput>;

/**
 * Query shape for `GET /supervisor/replacement-invites?status=&limit=&cursor=`.
 * @derives(master-plan §P.4)
 */
export const ListSupervisorReplacementInvitesQuery = z.object({
  status: ReplacementInviteStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
/** @derives(master-plan §P.4) — `GET /supervisor/replacement-invites` query */
export type ListSupervisorReplacementInvitesQueryT = z.infer<
  typeof ListSupervisorReplacementInvitesQuery
>;

/**
 * Query shape for the worker-side list (out of scope this wave but the type
 * is reserved so the worker mobile app can adopt the same shape).
 * @derives(master-plan §P.4)
 */
export const ListWorkerReplacementInvitesQuery = z.object({
  status: ReplacementInviteStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
/** @derives(master-plan §P.4) — worker-mobile list query (Phase D consumer) */
export type ListWorkerReplacementInvitesQueryT = z.infer<typeof ListWorkerReplacementInvitesQuery>;

// ── Route responses ─────────────────────────────────────────────────────────

/** @derives(master-plan §P.4) — `POST /supervisor/replacement-invites` response */
export const CreateReplacementInviteResponse = z.object({
  ok: z.literal(true),
  invite: ReplacementInviteRowSchema,
});
/** @derives(master-plan §P.4) — `POST /supervisor/replacement-invites` response */
export type CreateReplacementInviteResponseT = z.infer<typeof CreateReplacementInviteResponse>;

/** @derives(master-plan §P.4) — `POST /worker/replacement-invites/:id/accept` response */
export const AcceptReplacementInviteResponse = z.object({
  ok: z.literal(true),
  invite: ReplacementInviteRowSchema,
  assignmentId: z.string().uuid(),
});
/** @derives(master-plan §P.4) — `POST /worker/replacement-invites/:id/accept` response */
export type AcceptReplacementInviteResponseT = z.infer<typeof AcceptReplacementInviteResponse>;

/** @derives(master-plan §P.4) — list response with pagination cursor */
export const ListSupervisorReplacementInvitesResponse = z.object({
  invites: z.array(ReplacementInviteRowSchema),
  nextCursor: z.string().nullable(),
});
/** @derives(master-plan §P.4) — list response with pagination cursor */
export type ListSupervisorReplacementInvitesResponseT = z.infer<
  typeof ListSupervisorReplacementInvitesResponse
>;

// ── Internal: cadence constants (re-exported for tests + cron) ─────────────

/** @derives(master-plan §P.4) */
export const REPLACEMENT_INVITE_TIMING = Object.freeze({
  MIN_EXPIRES_IN_SEC,
  MAX_EXPIRES_IN_SEC,
  DEFAULT_EXPIRES_IN_SEC,
} as const);
