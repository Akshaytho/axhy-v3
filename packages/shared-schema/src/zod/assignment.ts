/**
 * @derives(master-plan §G)
 */

import { z } from 'zod';

/**
 * Recurring Assignment input. dayMask is 7-char Mon-Sun.
 * For single-day "send Suresh today only" use the oneOffDate variant below.
 */
export const CreateAssignmentRecurringInput = z
  .object({
    workerId: z.string().uuid(),
    siteId: z.string().uuid(),
    dayMask: z.string().regex(/^[MTWTFS_]{7}$/),
    shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
    shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
    validFrom: z.string(),
    validUntil: z.string().nullable().optional(),
  })
  .strict();

/** Single-day shorthand. Backend auto-fills validFrom = validUntil = oneOffDate, dayMask = day-of-week of oneOffDate. */
export const CreateAssignmentOneOffInput = z
  .object({
    workerId: z.string().uuid(),
    siteId: z.string().uuid(),
    oneOffDate: z.string(),
    shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
    shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .strict();

/** Discriminated by presence of `oneOffDate`. */
export const CreateAssignmentInput = z.union([
  CreateAssignmentRecurringInput,
  CreateAssignmentOneOffInput,
]);
export type CreateAssignmentInputT = z.infer<typeof CreateAssignmentInput>;
