/**
 * Digest Zod schemas — workflow-design-closure §3.5 Digest primitive.
 *
 * Auto-composed multi-event rollups. Distinct from individual Notification rows.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5)
 */

import { z } from 'zod';

/**
 * Digest kind catalogue.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5 + Decision 10)
 */
export const DigestKindSchema = z.enum([
  'owner_monthly',
  'owner_incident',
  'owner_annual',
  'hr_team_daily',
  'supervisor_while_you_were_out',
]);

/**
 * Inferred DigestKind type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5)
 */
export type DigestKind = z.infer<typeof DigestKindSchema>;

/**
 * Delivery channel for a Digest. Distinct from Notification channel set —
 * digests are not delivered as SMS by default (too long).
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5)
 */
export const DigestChannelSchema = z.enum(['push', 'whatsapp_out', 'email', 'in_app']);

/**
 * Inferred DigestChannel type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5)
 */
export type DigestChannel = z.infer<typeof DigestChannelSchema>;

/**
 * Digest row shape.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5)
 */
export const DigestSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  audienceUserId: z.string().uuid(),
  kind: DigestKindSchema,
  periodStart: z.date(),
  periodEnd: z.date(),
  composedAt: z.date(),
  body: z.unknown(),
  bodyText: z.string().nullable(),
  deliveryChannel: DigestChannelSchema.nullable(),
  deliveredAt: z.date().nullable(),
});

/**
 * Inferred Digest type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5)
 */
export type Digest = z.infer<typeof DigestSchema>;

/**
 * Input for composing a new Digest. composedAt + deliveryChannel are set by
 * DigestComposerService at write time.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5)
 */
export const ComposeDigestInput = z.object({
  companyId: z.string().uuid(),
  audienceUserId: z.string().uuid(),
  kind: DigestKindSchema,
  periodStart: z.date(),
  periodEnd: z.date(),
  body: z.unknown(),
  bodyText: z.string().nullable().optional(),
});

/**
 * Inferred ComposeDigestInput type.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.5)
 */
export type ComposeDigestInput = z.infer<typeof ComposeDigestInput>;
