/**
 * ReplacementInvite (F28) — Zod surface for Wave 1 backend.
 *
 * Locked 2026-05-18 under the v2 30-day supervisor simulation plan
 * (`docs/plans/2026-05-18-supervisor-30-day-real-life-simulation-v2.md` §3 Wave 1).
 *
 * One file for the full F28 surface — status enum, body shapes for each
 * route, response shapes, paginated list shape. Mirrors the Wave 3 complaint
 * surface in structure so contracts read consistently across Sprint 1.
 *
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(replacement-invite-feature-spec.md, 2026-05-18)
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
  'sibling_accepted',
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
  groupId: z.string().uuid(),
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

/** @derives(master-plan §P.4) — group summary shape for outcome card */
export const ReplacementInviteGroupSummarySchema = z.object({
  groupId: z.string().uuid(),
  fromSupervisorId: z.string().uuid(),
  siteId: z.string().uuid(),
  siteName: z.string(),
  scheduledStart: z.string(),
  sentAt: z.string(),
  expiresAt: z.string(),
  pendingCount: z.number().int().min(0),
  acceptedCount: z.number().int().min(0),
  declinedCount: z.number().int().min(0),
  expiredCount: z.number().int().min(0),
  cancelledCount: z.number().int().min(0),
  totalCount: z.number().int().min(1),
  winnerWorkerId: z.string().uuid().nullable(),
  winnerWorkerName: z.string().nullable(),
});
/** @derives(master-plan §P.4) — group outcome card data */
export type ReplacementInviteGroupSummaryT = z.infer<typeof ReplacementInviteGroupSummarySchema>;

// ── Route bodies ────────────────────────────────────────────────────────────

const MIN_EXPIRES_IN_SEC = 30; // anything below this is a UX accident
const MAX_EXPIRES_IN_SEC = 30 * 60; // 30 minutes; longer asks should use a different flow
const DEFAULT_EXPIRES_IN_SEC = 120; // 2-minute countdown per master plan §G:976
const MAX_CANDIDATES_PER_GROUP = 20;

/**
 * Body for `POST /supervisor/replacement-invites`.
 * @derives(master-plan §P.4)
 */
export const CreateReplacementInviteGroupInput = z.object({
  siteId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  candidateUserIds: z
    .array(z.string().uuid())
    .min(1, 'At least one candidate required')
    .max(MAX_CANDIDATES_PER_GROUP, `At most ${MAX_CANDIDATES_PER_GROUP} candidates per group`),
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
export type CreateReplacementInviteGroupInputT = z.infer<typeof CreateReplacementInviteGroupInput>;

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
 * Query shape for `GET /supervisor/replacement-invites?status=&groupId=&limit=&cursor=`.
 * @derives(master-plan §P.4)
 */
export const ListSupervisorReplacementInvitesQuery = z.object({
  status: ReplacementInviteStatusSchema.optional(),
  groupId: z.string().uuid().optional(),
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

/** @derives(master-plan §P.4) */
export const CreateReplacementInviteGroupResponse = z.object({
  ok: z.literal(true),
  groupId: z.string().uuid(),
  invites: z.array(ReplacementInviteRowSchema),
});
/** @derives(master-plan §P.4) — `POST /supervisor/replacement-invites` response */
export type CreateReplacementInviteGroupResponseT = z.infer<
  typeof CreateReplacementInviteGroupResponse
>;

/** @derives(master-plan §P.4) */
export const AcceptReplacementInviteResponse = z.object({
  ok: z.literal(true),
  invite: ReplacementInviteRowSchema,
  assignmentId: z.string().uuid(),
  expiredSiblingCount: z.number().int().min(0),
});
/** @derives(master-plan §P.4) — `POST /worker/replacement-invites/:id/accept` response */
export type AcceptReplacementInviteResponseT = z.infer<typeof AcceptReplacementInviteResponse>;

/** @derives(master-plan §P.4) */
export const ListSupervisorReplacementInvitesResponse = z.object({
  invites: z.array(ReplacementInviteRowSchema),
  nextCursor: z.string().nullable(),
});
/** @derives(master-plan §P.4) — list response with pagination cursor */
export type ListSupervisorReplacementInvitesResponseT = z.infer<
  typeof ListSupervisorReplacementInvitesResponse
>;

// ── Internal: cadence + sizing constants (re-exported for tests + cron) ─────

/** @derives(master-plan §P.4) */
export const REPLACEMENT_INVITE_TIMING = Object.freeze({
  MIN_EXPIRES_IN_SEC,
  MAX_EXPIRES_IN_SEC,
  DEFAULT_EXPIRES_IN_SEC,
  MAX_CANDIDATES_PER_GROUP,
} as const);
