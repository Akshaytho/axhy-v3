/**
 * Zod schemas for POST /admin/sites/:id/bindings.
 *
 * @derives(ADR-0026)
 * @derives(ADR-0003)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { z } from 'zod';

/** @derives(ADR-0026) */
export const AdminCreateBindingInput = z
  .object({
    supervisorUserId: z.string().uuid(),
    effectiveFrom: z.string().datetime(),
    effectiveUntil: z.string().datetime().optional(),
    actingForUserId: z.string().uuid().optional(),
    reason: z.string().min(1).max(1000),
  })
  .refine((v) => !v.actingForUserId || !!v.effectiveUntil, {
    message: 'effectiveUntil is required when actingForUserId is set',
    path: ['effectiveUntil'],
  });

/** @derives(ADR-0026) */
export type AdminCreateBindingInput = z.infer<typeof AdminCreateBindingInput>;

/** @derives(ADR-0026) */
export const AdminCreateBindingOutput = z.object({
  bindingId: z.string().uuid(),
});

/** @derives(ADR-0026) */
export type AdminCreateBindingOutput = z.infer<typeof AdminCreateBindingOutput>;
