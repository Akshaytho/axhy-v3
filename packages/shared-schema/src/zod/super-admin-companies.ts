/**
 * Zod schemas for POST /super-admin/companies.
 *
 * Creates a new tenant (Company) and bootstraps its first OWNER in one
 * call — the entry point of customer onboarding. Without it a tenant can
 * only be created by hand-editing the database or running a seed script.
 * Caller is SUPER_ADMIN; the owner becomes loginable via OTP to ownerPhone.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { z } from 'zod';

/** @derives(ADR-0026) */
export const SuperAdminCreateCompanyInput = z.object({
  name: z.string().min(1).max(120),
  /** Optional — derived from name (slugified) when omitted. Must be unique. */
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, and hyphens')
    .optional(),
  ownerPhone: z.string().regex(/^\+\d{8,15}$/, 'ownerPhone must be E.164'),
  ownerName: z.string().min(1).max(120),
});

/** @derives(ADR-0026) */
export type SuperAdminCreateCompanyInput = z.infer<typeof SuperAdminCreateCompanyInput>;

/** @derives(ADR-0026) */
export const SuperAdminCreateCompanyOutput = z.object({
  companyId: z.string().uuid(),
  slug: z.string(),
  ownerMembershipId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
});

/** @derives(ADR-0026) */
export type SuperAdminCreateCompanyOutput = z.infer<typeof SuperAdminCreateCompanyOutput>;
