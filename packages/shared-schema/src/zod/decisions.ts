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
export const DecisionSectionSchema = z.enum(['NEEDS_YOU_NOW', 'ROUTINE', 'FAILED_REVIEW']);
export type DecisionSectionT = z.infer<typeof DecisionSectionSchema>;

/**
 * One pending-decision row in the supervisor's queue.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export const DecisionRow = z
  .object({
    id: z.string().uuid(),
    section: DecisionSectionSchema,
    tier: DecisionsTierSchema,
    title: z.string(),
    body: z.string().nullable(),
    workerName: z.string().nullable(),
    siteName: z.string().nullable(),
    /** ISO timestamp when this decision was proposed. */
    proposedAt: z.string().datetime(),
    /** Whether this decision needs typed-phrase confirm (EMPLOYMENT tier). */
    requiresTypedConfirm: z.boolean(),
    /** The phrase the supervisor must type to confirm — e.g. 'TERMINATE'. */
    confirmPhrase: z.string().nullable(),
  })
  .strict();
export type DecisionRowT = z.infer<typeof DecisionRow>;

/**
 * Response shape for `GET /supervisor/decisions`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export const DecisionsResponse = z
  .object({
    rows: z.array(DecisionRow),
    counts: z.object({
      needsYouNow: z.number().int().nonnegative(),
      routine: z.number().int().nonnegative(),
      failedReview: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  })
  .strict();
export type DecisionsResponseT = z.infer<typeof DecisionsResponse>;

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
