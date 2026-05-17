/**
 * Complaint + ComplaintMessage shared schemas (Wave 3 — chat intent
 * classifier + complaint threading).
 *
 * Scope:
 *   - ComplaintKind enum (9 values)
 *   - ComplaintState enum (4 values)
 *   - ComplaintAuthorRole enum (3 values)
 *   - ProposeLogComplaintInput   — AI tool input
 *   - ProposeClarifyInput        — AI tool input (intent-classifier fallback)
 *   - CreateComplaintMessageInput — POST /complaints/:id/messages body
 *   - ListComplaintsQuery         — GET /complaints query params
 *   - Complaint, ComplaintMessage, ComplaintMessageRead row shapes used
 *     in response payloads.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 * @derives(supervisor-30day-scenarios.md scenarios #26–38)
 * @derives(master-plan §G) — supervisor surface
 */

import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

/**
 * Complaint kind enum. Aligned with the DB CHECK constraint in migration 009
 * and the AI intent-classifier kind extraction in `propose_log_complaint`.
 *
 * Real Hyderabad supervisor phrasings per scenario examples:
 *   - photo_mismatch   — "photo doesn't match what client saw"
 *   - missed_area      — "lobby missed at Aparna A-block"
 *   - attitude         — "Anjali rude to resident's child"
 *   - theft_accusation — "client says her phone is missing"
 *   - hygiene          — "phenyl smell complaint from KIMS infection control"
 *   - noise            — "vacuum cleaner running at 6 AM, residents complained"
 *   - damage           — "broken tile, worker dropped bucket"
 *   - gate_pass        — "gate pass expired, worker turned back at security"
 *   - other            — fallback when AI cannot classify confidently
 *
 * @derives(master-plan §G) — supervisor surface
 */
export const ComplaintKindSchema = z.enum([
  'photo_mismatch',
  'missed_area',
  'attitude',
  'theft_accusation',
  'hygiene',
  'noise',
  'damage',
  'gate_pass',
  'other',
]);
/** @derives(master-plan §G) — supervisor surface */
export type ComplaintKind = z.infer<typeof ComplaintKindSchema>;

/**
 * Complaint lifecycle state.
 *   - OPEN      — supervisor logged it; awaiting HR triage.
 *   - IN_HR     — HR has acknowledged and is working it.
 *   - RESOLVED  — supervisor or HR closed it with a resolution.
 *   - DISMISSED — false alarm / duplicate / out-of-scope.
 *
 * @derives(master-plan §G) — supervisor surface
 */
export const ComplaintStateSchema = z.enum(['OPEN', 'IN_HR', 'RESOLVED', 'DISMISSED']);
/** @derives(master-plan §G) — supervisor surface */
export type ComplaintState = z.infer<typeof ComplaintStateSchema>;

/**
 * Author role on a ComplaintMessage. ADMIN reserved for future ops tooling.
 * @derives(master-plan §G) — supervisor surface
 */
export const ComplaintAuthorRoleSchema = z.enum(['SUPERVISOR', 'HR', 'ADMIN']);
/** @derives(master-plan §G) — supervisor surface */
export type ComplaintAuthorRole = z.infer<typeof ComplaintAuthorRoleSchema>;

/**
 * Severity (re-imported from supervisor.ts shape; mirrored here so callers
 * that only need complaint types don't have to import two files).
 * @derives(master-plan §G) — supervisor surface
 */
export const ComplaintSeverityWaveThreeSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
/** @derives(master-plan §G) — supervisor surface */
export type ComplaintSeverityWaveThree = z.infer<typeof ComplaintSeverityWaveThreeSchema>;

// ─── Attachment ──────────────────────────────────────────────────────────────

/**
 * Single attachment on a ComplaintMessage. Photos uploaded via the existing
 * S3 signed-URL pipeline; width/height optional because mobile may not have
 * exif on iOS-shared photos.
 * @derives(master-plan §G) — supervisor surface
 */
export const ComplaintAttachmentSchema = z.object({
  type: z.literal('image'),
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
/** @derives(master-plan §G) — supervisor surface */
export type ComplaintAttachment = z.infer<typeof ComplaintAttachmentSchema>;

// ─── AI tool inputs ──────────────────────────────────────────────────────────

/**
 * Input schema for the `propose_log_complaint` AI tool. Mirrored from the
 * Anthropic-shaped tool definition in `@axhy/ai-tools/tools/complaint.ts`.
 * Used by chat.ts to validate the model's tool call before persistence.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C.3)
 */
export const ProposeLogComplaintInput = z.object({
  siteId: z.string().uuid(),
  severity: ComplaintSeverityWaveThreeSchema,
  kind: ComplaintKindSchema,
  description: z.string().trim().min(1).max(280),
  observedAt: z.string().datetime().optional(),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §C.3) */
export type ProposeLogComplaintInputT = z.infer<typeof ProposeLogComplaintInput>;

/**
 * Input schema for the `propose_clarify` AI tool. Used by the intent
 * classifier when its confidence is below threshold and it needs the
 * supervisor to pick the actual intent. Mobile renders `options` as
 * tappable chips.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C.2)
 */
export const ProposeClarifyInput = z.object({
  question: z.string().trim().min(1).max(140),
  options: z.array(z.string().trim().min(1).max(24)).min(2).max(4),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §C.2) */
export type ProposeClarifyInputT = z.infer<typeof ProposeClarifyInput>;

// ─── Complaints REST API ─────────────────────────────────────────────────────

/**
 * Body schema for `POST /chat/messages` extension. Adds `attachments`.
 * Re-exported as a separate name so chat.ts can compose without rewriting
 * its existing `CreateChatMessageInput`.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 */
export const ChatMessageAttachmentSchema = z.object({
  type: z.literal('image'),
  url: z.string().url(),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §C) */
export type ChatMessageAttachment = z.infer<typeof ChatMessageAttachmentSchema>;

/**
 * Body schema for `POST /complaints/:id/messages`. Supervisors reply
 * inline in a complaint thread. HR ingest will use the same endpoint
 * (gated by role) when the HR portal lands.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 */
export const CreateComplaintMessageInput = z.object({
  body: z.string().trim().min(1).max(2000),
  attachments: z.array(ComplaintAttachmentSchema).max(8).optional(),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §C) */
export type CreateComplaintMessageInputT = z.infer<typeof CreateComplaintMessageInput>;

/**
 * Query string for `GET /complaints`. All filters are optional; pagination
 * uses opaque cursor (last seen `id` + `createdAt`) for stable ordering.
 * @derives(supervisor-drawer-and-decisions-redesign.md §A.3)
 */
export const ListComplaintsQuery = z.object({
  state: ComplaintStateSchema.optional(),
  siteId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §A.3) */
export type ListComplaintsQueryT = z.infer<typeof ListComplaintsQuery>;

// ─── Response row shapes ─────────────────────────────────────────────────────

/** @derives(supervisor-drawer-and-decisions-redesign.md §C) */
export const ComplaintMessageRow = z.object({
  id: z.string().uuid(),
  complaintId: z.string().uuid(),
  authorUserId: z.string().uuid(),
  authorRole: ComplaintAuthorRoleSchema,
  body: z.string(),
  attachments: z.array(ComplaintAttachmentSchema).nullable(),
  createdAt: z.string(),
  readByCallerAt: z.string().nullable(),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §C) */
export type ComplaintMessageRowT = z.infer<typeof ComplaintMessageRow>;

/** @derives(supervisor-drawer-and-decisions-redesign.md §A.5) */
export const ComplaintRow = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  siteName: z.string(),
  createdByUserId: z.string().uuid(),
  supervisorId: z.string().uuid(),
  kind: ComplaintKindSchema,
  severity: ComplaintSeverityWaveThreeSchema,
  state: ComplaintStateSchema,
  text: z.string(),
  unreadHrRepliesCount: z.number().int().min(0),
  lastReplyAt: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.string().uuid().nullable(),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §A.5) */
export type ComplaintRowT = z.infer<typeof ComplaintRow>;

/** @derives(supervisor-drawer-and-decisions-redesign.md §C) */
export const ComplaintThreadResponse = z.object({
  complaint: ComplaintRow,
  messages: z.array(ComplaintMessageRow),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §C) */
export type ComplaintThreadResponseT = z.infer<typeof ComplaintThreadResponse>;

/** @derives(supervisor-drawer-and-decisions-redesign.md §A.3) */
export const ListComplaintsResponse = z.object({
  complaints: z.array(ComplaintRow),
  nextCursor: z.string().nullable(),
});
/** @derives(supervisor-drawer-and-decisions-redesign.md §A.3) */
export type ListComplaintsResponseT = z.infer<typeof ListComplaintsResponse>;
