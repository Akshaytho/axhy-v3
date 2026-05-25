/**
 * Zod schemas for POST /admin/sites.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { z } from 'zod';

/** @derives(ADR-0026) */
export const AdminCreateSiteInput = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(500).optional(),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
  workdays: z
    .string()
    .regex(/^[MTWFSU_]{7}$/)
    .optional()
    .default('MTWTFS_'),
});

/** @derives(ADR-0026) */
export type AdminCreateSiteInput = z.infer<typeof AdminCreateSiteInput>;

/** @derives(ADR-0026) */
export const AdminCreateSiteOutput = z.object({
  siteId: z.string().uuid(),
  state: z.literal('DRAFT'),
});

/** @derives(ADR-0026) */
export type AdminCreateSiteOutput = z.infer<typeof AdminCreateSiteOutput>;
