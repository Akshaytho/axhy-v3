/**
 * Policy Zod schemas — workflow-design-closure §3.6 Policy primitive.
 *
 * Append-only per-tenant config. Current value for a key is the most-recent
 * row by setAt.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6)
 */

import { z } from 'zod';

/**
 * Policy category — one of sla / notification / worker / hr / ai / owner / handoff.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6)
 */
export const PolicyCategorySchema = z.enum([
  'sla',
  'notification',
  'worker',
  'hr',
  'ai',
  'owner',
  'handoff',
]);

/**
 * Inferred PolicyCategory type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6)
 */
export type PolicyCategory = z.infer<typeof PolicyCategorySchema>;

/**
 * Policy row shape.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6)
 */
export const PolicySchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  key: z.string().min(1).max(200),
  value: z.unknown(),
  setBy: z.string().uuid(),
  setAt: z.date(),
  previousValueSnapshot: z.unknown().nullable(),
  category: PolicyCategorySchema,
});

/**
 * Inferred Policy type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6)
 */
export type Policy = z.infer<typeof PolicySchema>;

/**
 * Input for setting (appending) a policy value. Previous value snapshot is
 * computed by PolicyService at write time.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6)
 */
export const SetPolicyInput = z.object({
  companyId: z.string().uuid(),
  key: z.string().min(1).max(200),
  value: z.unknown(),
  setBy: z.string().uuid(),
  category: PolicyCategorySchema,
});

/**
 * Inferred SetPolicyInput type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6)
 */
export type SetPolicyInput = z.infer<typeof SetPolicyInput>;

/**
 * Default policy keys shipped at launch. Not exhaustive — the platform allows
 * any dotted key. PolicyService loads the default values for these keys at
 * tenant initialisation; this constant documents what keys exist.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6 + §12 founder-pick flags)
 */
export const DEFAULT_POLICY_KEYS = {
  // SLA tiers (Decision 3)
  HR_QUEUE_URGENT_SLA_MINUTES: 'hr.queue.urgent_sla_minutes',
  HR_QUEUE_NEXT_DAY_SLA_MINUTES: 'hr.queue.next_day_sla_minutes',
  HR_QUEUE_STANDARD_SLA_DAYS: 'hr.queue.standard_sla_days',
  // HR pod sizing (Decision 1)
  HR_POD_TARGET_WORKER_COUNT: 'hr.pod.target_worker_count',
  HR_POD_TARGET_SUPERVISOR_COUNT: 'hr.pod.target_supervisor_count',
  // Worker (Decisions 4, 5, 7)
  WORKER_PREFERRED_LANGUAGE_DEFAULT: 'worker.preferred_language_default',
  WORKER_TERMINATION_APPEAL_DAYS: 'worker.termination_appeal_days',
  // AI backlog (Decision 9)
  AI_BACKLOG_CHIP_UPGRADE_SECONDS: 'ai.backlog.chip_upgrade_seconds',
  AI_BACKLOG_GLOBAL_BANNER_THRESHOLD: 'ai.backlog.global_banner_threshold',
  // Notification (closure §7)
  NOTIFICATION_CHANNEL_FALLBACK_CHAIN: 'notification.channel_fallback_chain',
  // Handoff package (Decision 8)
  HANDOFF_MAX_SIZE_BYTES: 'handoff.max_size_bytes',
  // HR Updates audience (closure §7 + Decision 4 + F-P-6)
  HR_UPDATES_AUDIENCE_WORKERS_DEFAULT: 'hr_updates.audience_workers_default',
} as const;
