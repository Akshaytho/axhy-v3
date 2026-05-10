/**
 * @axhy/shared-schema/zod/living-doc — LivingDocRule shape per Spec 2 §3.5
 *
 * Each row in any of the 5 LivingDoc JSON sections (siteRules, workerNotes,
 * clientPreferences, recurringTasks, freeNotes) conforms to this shape.
 * Only state='ACTIVE' rules filter into prompt context this wave;
 * PENDING/REJECTED/EXPIRED used by Phase D nightly nano-tier extractor.
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 * @derives(spec-2 §3.5)
 */

import { z } from 'zod';

/** Section IDs map 1:1 to the 5 JSON columns on LivingDoc. */
export const LivingDocSectionEnum = z.enum([
  'site_rules',
  'worker_notes',
  'client_preferences',
  'recurring_tasks',
  'free_notes',
]);
export type LivingDocSection = z.infer<typeof LivingDocSectionEnum>;

/** Maps section enum to the matching Prisma JSON column name. */
export const LIVING_DOC_SECTION_TO_COLUMN: Record<
  LivingDocSection,
  'siteRules' | 'workerNotes' | 'clientPreferences' | 'recurringTasks' | 'freeNotes'
> = {
  site_rules: 'siteRules',
  worker_notes: 'workerNotes',
  client_preferences: 'clientPreferences',
  recurring_tasks: 'recurringTasks',
  free_notes: 'freeNotes',
};

/**
 * COMPANY    — visible to HR, Owner, all Supervisors. Editable: HR + Owner only.
 * SUPERVISOR_OWN — visible+editable to that supervisor only.
 * WORKER_OWN — visible to nobody directly; AI uses when answering ABOUT that worker.
 */
export const LivingDocVisibilityEnum = z.enum(['COMPANY', 'SUPERVISOR_OWN', 'WORKER_OWN']);
export type LivingDocVisibility = z.infer<typeof LivingDocVisibilityEnum>;

/**
 * PENDING  — AI inferred overnight, awaiting supervisor's morning review (Phase D)
 * ACTIVE   — supervisor confirmed (or wrote directly via propose_living_doc_update)
 * REJECTED — supervisor rejected on review (kept for audit + future training)
 * EXPIRED  — stale PENDING (>30 days); ignored by AI prompts
 *
 * Phase 2 wave: only ACTIVE rules filter into prompt context.
 */
export const LivingDocRuleStateEnum = z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'EXPIRED']);
export type LivingDocRuleState = z.infer<typeof LivingDocRuleStateEnum>;

export const LivingDocRuleScope = z.object({
  workerId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
});
export type LivingDocRuleScope = z.infer<typeof LivingDocRuleScope>;

export const LivingDocRuleSource = z.object({
  chatMessageId: z.string().uuid().optional(),
  visitIds: z.array(z.string().uuid()).optional(),
  pattern: z.string().optional(),
});
export type LivingDocRuleSource = z.infer<typeof LivingDocRuleSource>;

export const LivingDocRule = z.object({
  id: z.string().uuid(),
  ruleText: z.string().min(1),
  description: z.string().min(1),
  visibility: LivingDocVisibilityEnum,
  scope: LivingDocRuleScope,
  createdAt: z.string(),
  createdBy: z.enum(['supervisor', 'ai_inferred']),
  state: LivingDocRuleStateEnum,
  decidedAt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: LivingDocRuleSource,
});
export type LivingDocRule = z.infer<typeof LivingDocRule>;

/**
 * Input for the propose_living_doc_update tool — what AI emits when supervisor
 * says e.g. "Mukesh tends to be late on rainy days" / "remember Suresh prefers
 * Tea breaks at 11am".
 */
export const ProposeLivingDocUpdateInput = z.object({
  section: LivingDocSectionEnum,
  visibility: LivingDocVisibilityEnum,
  ruleText: z.string().min(1),
  description: z.string().min(1),
  scope: LivingDocRuleScope.optional().default({}),
});
export type ProposeLivingDocUpdateInput = z.infer<typeof ProposeLivingDocUpdateInput>;
