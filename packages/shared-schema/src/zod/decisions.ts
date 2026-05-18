/**
 * Decisions tab Zod schemas — shared between backend + mobile.
 *
 * Wire shape for `GET /supervisor/decisions` — the supervisor's pending
 * decision queue, tier-grouped into sections. Also covers the dismiss
 * write shape for `POST /supervisor/decisions/:id/dismiss`.
 *
 * The tier/section model mirrors data-flow §5. FAILED_REVIEW is reserved
 * for a future slice (no FAILED state exists yet); it is included in the
 * response shape so clients don't break when it ships.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { z } from 'zod';

/**
 * Decision tier for the Decisions tab UI — extends the storage-level
 * DwiTierSchema with REVIEW for the FAILED_REVIEW section.
 *
 * NOTE: supervisor.ts exports a narrower `DecisionTierSchema` (no REVIEW)
 * for the mark-absent + action routes. This schema is the full presentation
 * tier for the Decisions tab read surface.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export const DecisionsTierSchema = z.enum([
  'NOTE',
  'OPERATIONAL',
  'PERSONNEL',
  'EMPLOYMENT',
  'REVIEW',
]);
export type DecisionTierT = z.infer<typeof DecisionsTierSchema>;

/**
 * Section the row sorts into on the Decisions tab.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
/**
 * STALE is for pending decisions older than 48h that the supervisor hasn't
 * acted on. They stay actionable but lose red-dot urgency — keeps the
 * NEEDS_YOU_NOW queue bounded and lets fresh items get attention.
 * @derives(feedback_stale_decisions_section_after_48h.md, 2026-05-18)
 */
export const DecisionSectionSchema = z.enum(['NEEDS_YOU_NOW', 'ROUTINE', 'STALE', 'FAILED_REVIEW']);
export type DecisionSectionT = z.infer<typeof DecisionSectionSchema>;

/**
 * Visual emphasis for a `DecisionAction` button on the mobile card footer.
 *
 *   - `primary`   — the affirmative path (Approve, Accept, Acknowledge).
 *   - `danger`    — the negative / destructive path (Reject, Terminate).
 *   - `secondary` — a tertiary override (e.g. "Accept anyway" on skill mismatch).
 *
 * Wave 2 lock: server drives style; mobile may not re-derive from `label`.
 *
 * @derives(Wave 2 plan §3 — actions[] contract)
 * @derives(drawer-redesign §B.4 — card variants)
 */
export const DecisionActionStyleSchema = z.enum(['primary', 'danger', 'secondary']);
export type DecisionActionStyleT = z.infer<typeof DecisionActionStyleSchema>;

/**
 * Confirmation gesture required before a `DecisionAction` POSTs.
 *
 *   - `none`          — single tap fires the request (e.g. simple Approve).
 *   - `typed-phrase`  — supervisor must type `confirmPhrase` verbatim
 *                       (used for EMPLOYMENT-tier terminate-class actions
 *                       AND for OPERATIONAL "Accept anyway" overrides).
 *   - `reason-sheet`  — opens a bottom-sheet that collects a 1–200 char
 *                       free-text reason; the body POSTed includes
 *                       `{ reason }`. Used for PERSONNEL-tier Reject +
 *                       SwapRequest Reject.
 *
 * @derives(Wave 2 plan §3C)
 * @derives(drawer-redesign §B.4)
 */
export const DecisionActionConfirmModeSchema = z.enum(['none', 'typed-phrase', 'reason-sheet']);
export type DecisionActionConfirmModeT = z.infer<typeof DecisionActionConfirmModeSchema>;

/**
 * HTTP verb a `DecisionAction` uses. Wave 2 only emits POST + PATCH; DELETE
 * is allowed in the contract so future sources (e.g. cancel-invite) don't
 * need a schema bump.
 *
 * @derives(Wave 2 plan §3C)
 */
export const DecisionActionMethodSchema = z.enum(['POST', 'PATCH', 'DELETE']);
export type DecisionActionMethodT = z.infer<typeof DecisionActionMethodSchema>;

/**
 * One actionable button the mobile DecisionCard renders in its footer.
 *
 * The server constructs `actions[]` per row; mobile renders buttons in the
 * supplied order without re-deriving copy, style, or endpoint from `kind`.
 * This keeps the mobile DecisionCard a thin renderer and lets future
 * kinds add buttons by extending only the backend builder.
 *
 * `body` is the JSON body the mobile client must include in the request.
 * For `reason-sheet`, mobile MERGES `{ reason }` into `body` at submit time.
 * For `typed-phrase`, mobile blocks submission until the supervisor types
 * `confirmPhrase` verbatim.
 *
 * `endpoint` is a relative path the mobile client suffixes onto its backend
 * base URL. The path is interpolated by the backend (e.g.
 * `/leave-requests/<id>/approve` already has the id baked in).
 *
 * @derives(Wave 2 plan §3C — actions[] per DecisionRow)
 * @derives(drawer-redesign §B.4 — card variants)
 */
export const DecisionAction = z
  .object({
    /** Button copy, plain English. Mobile renders this verbatim. */
    label: z.string().min(1).max(40),
    /** Visual emphasis. */
    style: DecisionActionStyleSchema,
    /** Confirmation gesture required before POST. */
    requiresConfirm: DecisionActionConfirmModeSchema,
    /** Phrase to type when `requiresConfirm = 'typed-phrase'`. */
    confirmPhrase: z.string().min(1).max(32).optional(),
    /** Relative URL of the action endpoint, with route params interpolated. */
    endpoint: z.string().min(1).max(256),
    /** HTTP method. */
    method: DecisionActionMethodSchema,
    /** Pre-filled JSON body. Mobile merges reason/typed-phrase as needed. */
    body: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((a) => a.requiresConfirm !== 'typed-phrase' || typeof a.confirmPhrase === 'string', {
    message: "confirmPhrase is required when requiresConfirm is 'typed-phrase'",
    path: ['confirmPhrase'],
  });
export type DecisionActionT = z.infer<typeof DecisionAction>;

/**
 * One pending-decision row in the supervisor's queue.
 *
 * Wave 2 (2026-05-18) extensions:
 *   - `kind` — surfaces the `decisionKind` enum value to the mobile renderer
 *              so it can dispatch to the right card variant. Replaces the
 *              prior "the row IS a SupervisorDecision so use `tier`" implicit
 *              contract, which doesn't work once the queue UNION-ALLs LeaveRequest /
 *              SwapRequest / future ReplacementInvite + Complaint sources.
 *   - `actions[]` — server-driven button list; see `DecisionAction`.
 *   - `summaryText` — populated by sources whose body is too long for an
 *              inline card (e.g. complaint thread). Mobile renders a HeavySummary
 *              card with "Open to decide" → deep-link to a full screen.
 *   - `dayCount` — populated by multi-day LeaveRequest sources so mobile
 *              renders a per-day sub-card stack.
 *
 * Existing `requiresTypedConfirm` / `confirmPhrase` fields are retained for
 * backwards compat with the EMPLOYMENT TERMINATE_WORKER footer; new code
 * SHOULD read the equivalent fields off `actions[]` instead.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(Wave 2 plan §3 — UNION-ALL builder + actions[] contract)
 */
export const DecisionRow = z
  .object({
    /**
     * Stable id. For existing SupervisorDecision rows, this is the row id.
     * For virtual rows projected from a domain source, this is a deterministic
     * compound id of the form `<source>:<sourceRowId>` (e.g. `leave:<uuid>`,
     * `swap:<uuid>`) so mobile can use it as a React key and the deep-link
     * `?focus=` param resolves uniquely across sources.
     */
    id: z.string().min(1).max(128),
    section: DecisionSectionSchema,
    tier: DecisionsTierSchema,
    /**
     * decisionKind string — must be a value from `DECISION_KIND_REGISTRY`.
     * Drives the mobile card variant. See `supervisor-decision-kinds.ts`.
     */
    kind: z.string().min(1).max(64),
    title: z.string(),
    body: z.string().nullable(),
    workerName: z.string().nullable(),
    siteName: z.string().nullable(),
    /** ISO timestamp when this decision was proposed. */
    proposedAt: z.string().datetime(),
    /** Long-form summary text for HeavySummaryCard variants. */
    summaryText: z.string().max(2000).nullable(),
    /** Number of distinct days the decision spans (multi-day leave). */
    dayCount: z.number().int().positive().nullable(),
    /** Whether this decision needs typed-phrase confirm (EMPLOYMENT tier). */
    requiresTypedConfirm: z.boolean(),
    /** The phrase the supervisor must type to confirm — e.g. 'TERMINATE'. */
    confirmPhrase: z.string().nullable(),
    /** Server-driven action buttons; mobile renders in order. */
    actions: z.array(DecisionAction),
  })
  .strict();
export type DecisionRowT = z.infer<typeof DecisionRow>;

/**
 * Page-info cursor for the Decisions queue. Wave 2 (2026-05-18) — Decisions
 * queue is limited to 50 rows per page; cursor is composed of
 * `(priority, createdAt)` so a subsequent page request resumes immediately
 * after the last row of the previous page without re-scanning.
 *
 * `cursor` is a base64-encoded opaque token the mobile client passes back
 * verbatim. `hasMore` is true iff a subsequent page exists.
 *
 * `totalAcrossPages` is the count of all queue rows (across all pages)
 * irrespective of `limit` — used for the drawer badge.
 *
 * @derives(Wave 2 plan §3F — pagination)
 */
export const DecisionsPageInfo = z
  .object({
    /** Opaque cursor — pass back as `?cursor=` to fetch the next page. */
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
    /** Max rows the server returned in this page. Server enforces ≤ 50. */
    limit: z.number().int().min(1).max(50),
    /** Count of all matched rows across all pages (used for badge). */
    totalAcrossPages: z.number().int().nonnegative(),
  })
  .strict();
export type DecisionsPageInfoT = z.infer<typeof DecisionsPageInfo>;

/**
 * Response shape for `GET /supervisor/decisions`.
 *
 * Wave 2 adds `pageInfo` for cursor-based pagination (50 rows/page).
 * Backwards compat: `counts` still describes the CURRENT PAGE only;
 * `pageInfo.totalAcrossPages` is the cross-page total.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(Wave 2 plan §3F — pagination)
 */
export const DecisionsResponse = z
  .object({
    rows: z.array(DecisionRow),
    counts: z.object({
      needsYouNow: z.number().int().nonnegative(),
      routine: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
      failedReview: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    pageInfo: DecisionsPageInfo,
  })
  .strict();
export type DecisionsResponseT = z.infer<typeof DecisionsResponse>;

/**
 * Query parameters for `GET /supervisor/decisions`.
 *
 * @derives(Wave 2 plan §3F)
 */
export const DecisionsQueryInput = z
  .object({
    /** Opaque cursor from a prior page's `pageInfo.cursor`. */
    cursor: z.string().min(1).max(512).optional(),
    /** Page size; server caps at 50. Default 50. */
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();
export type DecisionsQueryInputT = z.infer<typeof DecisionsQueryInput>;

/**
 * Input shape for `POST /swap-requests/:id/decide`. The receiving supervisor
 * (the one bound to the swap's site at decide-time) approves, rejects, or
 * approves-anyway (override on skill mismatch).
 *
 * Wave 2 lock: `approve_anyway` requires the typed phrase 'OVERRIDE' to fire
 * (mobile is responsible for collecting it via `requiresConfirm:'typed-phrase'`
 * on the corresponding DecisionAction); the backend re-validates the body
 * and rejects if `acceptAnyway=true` but `overrideToken !== 'OVERRIDE'`.
 *
 * @derives(Wave 2 plan §3E — endpoint actions array must match real routes)
 * @derives(drawer-redesign §B.4 — TwoButtonWithWarning variant)
 */
export const SwapDecisionInput = z
  .object({
    decision: z.enum(['approve', 'reject', 'approve_anyway']),
    /** 1–200 char reason. Required for reject; optional otherwise. */
    reason: z.string().trim().min(1).max(200).optional(),
    /** Confirmation token for approve_anyway override. Must equal 'OVERRIDE'. */
    overrideToken: z.string().min(1).max(32).optional(),
  })
  .strict()
  .refine((d) => d.decision !== 'reject' || typeof d.reason === 'string', {
    message: 'reason is required when decision is reject',
    path: ['reason'],
  })
  .refine((d) => d.decision !== 'approve_anyway' || d.overrideToken === 'OVERRIDE', {
    message: "overrideToken must equal 'OVERRIDE' when decision is approve_anyway",
    path: ['overrideToken'],
  });
export type SwapDecisionInputT = z.infer<typeof SwapDecisionInput>;

/**
 * Output shape for `POST /swap-requests/:id/decide`.
 *
 * @derives(Wave 2 plan §3E)
 */
export const SwapDecisionOutput = z
  .object({
    ok: z.literal(true),
    swapRequestId: z.string().uuid(),
    state: z.enum(['ACCEPTED', 'DECLINED']),
    decidedBy: z.string().uuid(),
    decidedAt: z.string().datetime(),
  })
  .strict();
export type SwapDecisionOutputT = z.infer<typeof SwapDecisionOutput>;

/**
 * Input for POST /supervisor/decisions/:id/dismiss.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export const DismissDecisionInput = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type DismissDecisionInputT = z.infer<typeof DismissDecisionInput>;

/**
 * Output for POST /supervisor/decisions/:id/dismiss.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export const DismissDecisionOutput = z
  .object({
    ok: z.literal(true),
    decisionId: z.string().uuid(),
    dismissedAt: z.string().datetime(),
  })
  .strict();
export type DismissDecisionOutputT = z.infer<typeof DismissDecisionOutput>;
