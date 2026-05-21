/**
 * Worker consent Zod schemas — DPDP one-page consent at first run.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §6 + §13 M22)
 * @derives(F-006b worker-shell relaxation 2026-05-21)
 */

import { z } from 'zod';

/** Submit consent input — the worker accepts a specific policy version.
 *  @derives(master-plan §G) */
export const SubmitConsentInput = z.object({
  policyVersion: z.string().trim().min(1).max(32),
});
/** @derives(master-plan §G) */
export type SubmitConsentInput = z.infer<typeof SubmitConsentInput>;

/** Submit consent output — server timestamp of acceptance.
 *  @derives(master-plan §G) */
export const SubmitConsentOutput = z.object({
  ok: z.literal(true),
  acceptedAt: z.string(),
});
/** @derives(master-plan §G) */
export type SubmitConsentOutput = z.infer<typeof SubmitConsentOutput>;
