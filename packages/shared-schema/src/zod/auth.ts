/**
 * Auth Zod schemas — shared between backend, mobile, admin-web.
 *
 * @derives(ADR-0007) — Phone+OTP auth via MSG91 + jose JWT
 */

import { z } from 'zod';

/** E.164 phone number validator (India default if no country code). */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10–15 digits, optionally prefixed with +')
  .transform((v) => (v.startsWith('+') ? v : `+91${v}`));

export const OtpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'OTP must be exactly 6 digits');

export const RoleSchema = z.enum(['WORKER', 'SUPERVISOR', 'OWNER', 'HR', 'SUPER_ADMIN']);
export type Role = z.infer<typeof RoleSchema>;

// ─── Request shapes ───────────────────────────────────────────────────────────

export const RequestOTPInput = z.object({
  phone: PhoneSchema,
});
export type RequestOTPInput = z.infer<typeof RequestOTPInput>;

export const RequestOTPOutput = z.object({
  ok: z.literal(true),
  /** Resend window in seconds — UI uses to disable button until expiry */
  resendInSeconds: z.number().int().min(1),
});
export type RequestOTPOutput = z.infer<typeof RequestOTPOutput>;

export const VerifyOTPInput = z.object({
  phone: PhoneSchema,
  code: OtpCodeSchema,
});
export type VerifyOTPInput = z.infer<typeof VerifyOTPInput>;

export const VerifyOTPOutput = z.object({
  ok: z.literal(true),
  accessToken: z.string(),
  refreshToken: z.string(),
  /** All companies this user belongs to. UI shows picker if length > 1. */
  memberships: z.array(
    z.object({
      companyId: z.string().uuid(),
      companyName: z.string(),
      role: RoleSchema,
    }),
  ),
});
export type VerifyOTPOutput = z.infer<typeof VerifyOTPOutput>;

// ─── JWT claims ──────────────────────────────────────────────────────────────

export const JWTClaims = z.object({
  /** Subject — User.id */
  sub: z.string().uuid(),
  /** Active company for this token; mobile mode-switcher rotates the JWT */
  companyId: z.string().uuid(),
  /** Active role inside the active company */
  role: RoleSchema,
  /** All available roles across all memberships, regardless of active companyId */
  availableRoles: z.array(RoleSchema),
  /** Locale at issuance (defaults to user.locale) */
  locale: z.string().min(2).max(8),
  /** Issued-at, in seconds since epoch */
  iat: z.number().int(),
  /** Expiry, in seconds since epoch */
  exp: z.number().int(),
  /** Token kind — refresh tokens carry only sub + iat + exp */
  kind: z.enum(['access', 'refresh']),
  // ─── F1 trust model (compat-window optional) ─────────────────────────────
  /** Membership.id — backs the requireAuth DB lookup. Absent on legacy
   *  tokens (pre-2026-05-27 cutover). Absent on SUPER_ADMIN tokens (no
   *  tenant context). @derives(F1 trust model 2026-05-27) */
  membershipId: z.string().uuid().optional(),
  /** Snapshot of Membership.token_epoch (or 0 for SUPER_ADMIN) at issuance.
   *  Mismatch with current DB epoch → 401. @derives(F1 trust model) */
  epoch: z.number().int().nonnegative().optional(),
  /** True when User.is_platform_admin was true at issuance. Only meaningful
   *  for SUPER_ADMIN tokens. @derives(F1 trust model) */
  isPlatformAdmin: z.boolean().optional(),
});
export type JWTClaims = z.infer<typeof JWTClaims>;
