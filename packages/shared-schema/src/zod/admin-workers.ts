/**
 * Zod schemas for POST /admin/workers + POST /admin/workers/:id/anonymize.
 *
 * @derives(ADR-0026)
 * @derives(ADR-0025)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { z } from 'zod';

/** @derives(ADR-0026) */
export const AdminCreateWorkerInput = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, 'phone must be E.164'),
  name: z.string().min(1).max(120),
  baseSalaryPaise: z.number().int().nonnegative(),
  bankIfsc: z.string().max(16).optional(),
  bankAcct: z.string().max(40).optional(),
  preferredLanguage: z
    .string()
    .regex(/^[a-z]{2}$/)
    .optional()
    .default('hi'),
});

/** @derives(ADR-0026) */
export type AdminCreateWorkerInput = z.infer<typeof AdminCreateWorkerInput>;

/** @derives(ADR-0026) */
export const AdminCreateWorkerOutput = z.object({
  workerId: z.string().uuid(),
  userId: z.string().uuid(),
  membershipId: z.string().uuid(),
  state: z.literal('PENDING_ACTIVATION'),
});

/** @derives(ADR-0026) */
export type AdminCreateWorkerOutput = z.infer<typeof AdminCreateWorkerOutput>;

/** @derives(ADR-0026) */
export const AdminAnonymizeWorkerInput = z.object({
  reason: z.string().min(1).max(500),
  effectiveAt: z.string().datetime().optional(),
});

/** @derives(ADR-0026) */
export type AdminAnonymizeWorkerInput = z.infer<typeof AdminAnonymizeWorkerInput>;

/** @derives(ADR-0026) */
export const AdminAnonymizeWorkerOutput = z.object({
  workerId: z.string().uuid(),
  anonymizedAt: z.string().datetime(),
});

/** @derives(ADR-0026) */
export type AdminAnonymizeWorkerOutput = z.infer<typeof AdminAnonymizeWorkerOutput>;
