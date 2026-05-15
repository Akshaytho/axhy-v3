/**
 * Notification Zod schemas — workflow-design-closure §3.4 Notification primitive.
 *
 * Formalises outbox-driven delivery with per-row tracking. Audience is exactly
 * one of audienceUserId or audienceWorkerId.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.4)
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §7 Notification rules)
 */

import { z } from 'zod';

/**
 * Notification kind catalogue.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.4 + Decisions 4/5/9)
 */
export const NotificationKindSchema = z.enum([
  'supervisor_change',
  'termination_applied',
  'termination_notified_to_subject',
  'leave_status',
  'replacement_invite',
  'flag_alert',
  'hr_update',
  'ai_budget_alert',
  'binding_change',
  'site_state_change',
  'worker_activation_complete',
  'doc_pending_reminder',
  'worker_appeal_resolved',
  'hr_fallback_invoked',
]);

/**
 * Inferred NotificationKind type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.4)
 */
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

/**
 * Delivery channel for a Notification.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §7 — channel fallback chain)
 */
export const NotificationChannelSchema = z.enum([
  'push',
  'sms',
  'whatsapp_out',
  'email',
  'in_app_banner',
]);

/**
 * Inferred NotificationChannel type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §7)
 */
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

/**
 * SLA priority tier for a Notification — matches QueueItem priority tiers.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure Decision 3 — HR queue priority/SLA)
 */
export const NotificationPrioritySchema = z.enum(['URGENT', 'NEXT_DAY', 'STANDARD', 'DIGEST']);

/**
 * Inferred NotificationPriority type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure Decision 3)
 */
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;

/**
 * Notification row shape. Mutual-exclusion: exactly one of audienceUserId or
 * audienceWorkerId must be set.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.4)
 */
export const NotificationSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    audienceUserId: z.string().uuid().nullable(),
    audienceWorkerId: z.string().uuid().nullable(),
    kind: NotificationKindSchema,
    channel: NotificationChannelSchema,
    priority: NotificationPrioritySchema,
    payload: z.unknown(),
    scheduledAt: z.date(),
    deliveredAt: z.date().nullable(),
    failedAt: z.date().nullable(),
    failureReason: z.string().nullable(),
    ackedAt: z.date().nullable(),
  })
  .refine(
    (n) => Boolean(n.audienceUserId) !== Boolean(n.audienceWorkerId),
    'Exactly one of audienceUserId or audienceWorkerId must be set',
  );

/**
 * Inferred Notification type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.4)
 */
export type Notification = z.infer<typeof NotificationSchema>;

/**
 * Input for scheduling a new Notification via NotificationService.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.4 + §7)
 */
export const ScheduleNotificationInput = z
  .object({
    companyId: z.string().uuid(),
    audienceUserId: z.string().uuid().nullable().optional(),
    audienceWorkerId: z.string().uuid().nullable().optional(),
    kind: NotificationKindSchema,
    channel: NotificationChannelSchema,
    priority: NotificationPrioritySchema.optional(),
    payload: z.unknown(),
    scheduledAt: z.date().optional(),
  })
  .refine(
    (n) => Boolean(n.audienceUserId) !== Boolean(n.audienceWorkerId),
    'Exactly one of audienceUserId or audienceWorkerId must be set',
  );

/**
 * Inferred ScheduleNotificationInput type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.4)
 */
export type ScheduleNotificationInput = z.infer<typeof ScheduleNotificationInput>;
