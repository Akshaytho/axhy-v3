/**
 * GET /me Zod schemas.
 *
 * Returns the authenticated user's profile + their active company + memberships.
 * Used by every app on every screen mount to confirm session.
 *
 * @derives(ADR-0007)
 */

import { z } from 'zod';

import { RoleSchema } from './auth.js';

export const MeOutput = z.object({
  user: z.object({
    id: z.string().uuid(),
    phone: z.string(),
    name: z.string().nullable(),
    locale: z.string(),
  }),
  activeCompany: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  activeRole: RoleSchema,
  availableRoles: z.array(RoleSchema),
  memberships: z.array(
    z.object({
      companyId: z.string().uuid(),
      companyName: z.string(),
      role: RoleSchema,
    }),
  ),
});
export type MeOutput = z.infer<typeof MeOutput>;
