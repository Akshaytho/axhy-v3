/**
 * Worker consent Zod schemas — DPDP one-page consent at first run.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §6 + §13 M22)
 * @derives(F-006b worker-shell relaxation 2026-05-21)
 */

import { z } from 'zod';

/**
 * The policy versions the backend will accept as a valid DPDP consent.
 * Single source of truth — the mobile client sends the current one
 * (`POLICY_VERSION` in app/(auth)/consent.tsx). When a new policy ships, add
 * its version here (and the older ones stay valid so a re-consent to history
 * is still recorded). Without this allow-list any authenticated/tampered
 * client could persist an arbitrary string as a legally-meaningful consent
 * record. (RCA-G/consent 2026-06-04)
 *
 * @derives(master-plan §G)
 */
export const ACCEPTED_POLICY_VERSIONS = ['2026-05-21'] as const;
/** @derives(master-plan §G) */
export type AcceptedPolicyVersion = (typeof ACCEPTED_POLICY_VERSIONS)[number];

/** Submit consent input — the worker accepts a specific, KNOWN policy version.
 *  @derives(master-plan §G) */
export const SubmitConsentInput = z.object({
  policyVersion: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .refine((v) => (ACCEPTED_POLICY_VERSIONS as readonly string[]).includes(v), {
      message: 'Unknown or unsupported policy version',
    }),
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
