/**
 * Zod schemas for POST /admin/memberships.
 *
 * Used by:
 *   - OWNER to create HR (rare event)
 *   - HR to create SUPERVISOR (frequent)
 *
 * OWNER→OWNER (co-owner) is allowed by the locked authority table but
 * deferred at the API surface for this slice — Zod restricts to HR|SUPERVISOR.
 *
 * @derives(ADR-0026)
 * @derives(ADR-0025)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { z } from 'zod';

/** @derives(ADR-0026) */
export const AdminCreateMembershipInput = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, 'phone must be E.164'),
  name: z.string().min(1).max(120),
  role: z.enum(['HR', 'SUPERVISOR']),
  baseSalaryPaise: z.number().int().nonnegative().max(2_000_000_000),
  bankIfsc: z.string().max(16).optional(),
  bankAcct: z.string().max(40).optional(),
  podId: z.string().uuid().optional(),
});

/** @derives(ADR-0026) */
export type AdminCreateMembershipInput = z.infer<typeof AdminCreateMembershipInput>;

/** @derives(ADR-0026) */
export const AdminCreateMembershipOutput = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['HR', 'SUPERVISOR']),
  status: z.literal('ACTIVE'),
});

/** @derives(ADR-0026) */
export type AdminCreateMembershipOutput = z.infer<typeof AdminCreateMembershipOutput>;
