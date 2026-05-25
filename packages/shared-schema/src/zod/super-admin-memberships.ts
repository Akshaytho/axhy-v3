/**
 * Zod schemas for POST /super-admin/memberships.
 *
 * Bootstraps the first OWNER of a tenant. Caller is SUPER_ADMIN; target
 * role is implicitly OWNER (the only role SUPER_ADMIN may create per
 * HIRING_AUTHORITY in docs/locked/hiring-hierarchy.md).
 *
 * companyId travels in the body — SUPER_ADMIN tokens carry no tenant
 * context, so the request must name the tenant explicitly.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { z } from 'zod';

/** @derives(ADR-0026) */
export const SuperAdminCreateMembershipInput = z.object({
  companyId: z.string().uuid(),
  phone: z.string().regex(/^\+\d{8,15}$/, 'phone must be E.164'),
  name: z.string().min(1).max(120),
  baseSalaryPaise: z.number().int().nonnegative(),
  bankIfsc: z.string().max(16).optional(),
  bankAcct: z.string().max(40).optional(),
});

/** @derives(ADR-0026) */
export type SuperAdminCreateMembershipInput = z.infer<typeof SuperAdminCreateMembershipInput>;

/** @derives(ADR-0026) */
export const SuperAdminCreateMembershipOutput = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  companyId: z.string().uuid(),
  role: z.literal('OWNER'),
  status: z.literal('ACTIVE'),
});

/** @derives(ADR-0026) */
export type SuperAdminCreateMembershipOutput = z.infer<typeof SuperAdminCreateMembershipOutput>;
