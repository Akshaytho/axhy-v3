/**
 * SiteSupervisorBinding Zod schemas — supervisor responsibility model §7 Option A.
 *
 * Single table for both ACTING (temporary coverage) and PERMANENT (portfolio)
 * bindings. Discriminator: `actingForUserId` IS NULL → permanent;
 * `actingForUserId` IS NOT NULL → acting.
 *
 * effectiveUntil semantics (DB CHECK constraint enforces):
 *   - Acting: effectiveUntil REQUIRED.
 *   - Permanent: effectiveUntil OPTIONAL — NULL = open-ended,
 *     non-NULL = future-dated planned switch.
 *
 * @derives(ADR-0003)
 * @derives(supervisor-responsibility-model §7 + §5.8)
 * @derives(workflow-design-closure §3.1 + §4)
 */

import { z } from 'zod';

/**
 * Derived kind discriminator. Not a stored column — computed from
 * `actingForUserId` (NULL ⇒ PERMANENT, NOT NULL ⇒ ACTING). Mirrored from
 * the DB-side CASE used in the no-overlap EXCLUDE constraint.
 * @derives(ADR-0003)
 */
export const BindingKindSchema = z.enum(['PERMANENT', 'ACTING']);

/**
 * Inferred BindingKind type.
 * @derives(ADR-0003)
 */
export type BindingKind = z.infer<typeof BindingKindSchema>;

/**
 * SiteSupervisorBinding row shape.
 * @derives(ADR-0003)
 * @derives(supervisor-responsibility-model §7)
 */
export const SiteSupervisorBindingSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    siteId: z.string().uuid(),
    userId: z.string().uuid(),
    actingForUserId: z.string().uuid().nullable(),
    effectiveFrom: z.date(),
    effectiveUntil: z.date().nullable(),
    reason: z.string().min(1).max(1000),
    createdBy: z.string().uuid(),
    createdAt: z.date(),
    endedAt: z.date().nullable(),
    endedReason: z.string().nullable(),
    handoffPackage: z.unknown().nullable(),
  })
  .refine(
    (b) => b.actingForUserId === null || b.effectiveUntil !== null,
    'Acting bindings (actingForUserId not null) must have effectiveUntil set',
  )
  .refine(
    (b) => b.actingForUserId === null || b.actingForUserId !== b.userId,
    'actingForUserId must differ from userId (cannot act for yourself)',
  )
  .refine(
    (b) => b.effectiveUntil === null || b.effectiveUntil > b.effectiveFrom,
    'effectiveUntil must be strictly after effectiveFrom',
  );

/**
 * Inferred SiteSupervisorBinding type.
 * @derives(ADR-0003)
 */
export type SiteSupervisorBinding = z.infer<typeof SiteSupervisorBindingSchema>;

/**
 * Derive kind discriminator from a binding row (mirrors the DB-side CASE in
 * the no-overlap EXCLUDE constraint).
 * @derives(ADR-0003)
 * @derives(supervisor-responsibility-model §5.8)
 */
export function deriveBindingKind(row: { actingForUserId: string | null }): BindingKind {
  return row.actingForUserId === null ? 'PERMANENT' : 'ACTING';
}

/**
 * Input for creating a new permanent portfolio binding.
 * effectiveUntil may be NULL (open-ended) or non-NULL (future-dated switch).
 * @derives(ADR-0003)
 * @derives(supervisor-responsibility-model §7 + §9 pick 6)
 */
export const CreatePermanentBindingInput = z
  .object({
    companyId: z.string().uuid(),
    siteId: z.string().uuid(),
    userId: z.string().uuid(),
    effectiveFrom: z.date(),
    effectiveUntil: z.date().nullable().optional(),
    reason: z.string().min(1).max(1000),
    createdBy: z.string().uuid(),
  })
  .refine(
    (b) => b.effectiveUntil == null || b.effectiveUntil > b.effectiveFrom,
    'effectiveUntil must be strictly after effectiveFrom',
  );

/**
 * Inferred CreatePermanentBindingInput type.
 * @derives(ADR-0003)
 */
export type CreatePermanentBindingInput = z.infer<typeof CreatePermanentBindingInput>;

/**
 * Input for creating a new acting (temporary coverage) binding.
 * effectiveUntil is REQUIRED.
 * @derives(ADR-0003)
 * @derives(supervisor-responsibility-model §7 + §9 pick 5)
 */
export const CreateActingBindingInput = z
  .object({
    companyId: z.string().uuid(),
    siteId: z.string().uuid(),
    userId: z.string().uuid(),
    actingForUserId: z.string().uuid(),
    effectiveFrom: z.date(),
    effectiveUntil: z.date(),
    reason: z.string().min(1).max(1000),
    createdBy: z.string().uuid(),
  })
  .refine(
    (b) => b.actingForUserId !== b.userId,
    'actingForUserId must differ from userId (cannot act for yourself)',
  )
  .refine(
    (b) => b.effectiveUntil > b.effectiveFrom,
    'effectiveUntil must be strictly after effectiveFrom',
  );

/**
 * Inferred CreateActingBindingInput type.
 * @derives(ADR-0003)
 */
export type CreateActingBindingInput = z.infer<typeof CreateActingBindingInput>;
