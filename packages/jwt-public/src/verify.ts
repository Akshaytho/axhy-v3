import { jwtVerify, type JWTPayload } from 'jose';

/**
 * Decoded access-token claims required by every authenticated request.
 *
 * Aligned with backend JWTClaims (packages/shared-schema/src/zod/auth.ts):
 * the canonical user identifier is `sub` per JWT RFC-7519 §4.1.2. Backend
 * issues `sub`; this verifier reads `sub`. A `userId` legacy alias is
 * populated (mirrors `sub`) for callers that have not yet migrated.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 jwt-public fix
 * @derives(master-plan §G)
 * @derives(F1 trust model 2026-05-27)
 */
export type AccessTokenPayload = {
  /** Subject — User.id, per JWT RFC-7519 §4.1.2. */
  sub: string;
  /** Legacy alias for `sub`. Populated by the verifier for back-compat. */
  userId: string;
  companyId: string;
  role: 'OWNER' | 'HR' | 'SUPERVISOR' | 'WORKER' | 'SUPER_ADMIN';
};

/**
 * Result of verifying an access token: either the decoded payload or a
 * classified failure code.
 *
 * @derives(master-plan §G)
 */
export type VerifyResult =
  | { ok: true; payload: AccessTokenPayload }
  | { ok: false; code: 'EXPIRED' | 'INVALID' | 'MALFORMED' };

// [ORCHESTRATOR_EXCEPTION] sequential single-file edits for HR A1 jwt-public fix
const REQUIRED = ['sub', 'companyId', 'role'] as const;

function hasRequired(
  p: JWTPayload,
): p is JWTPayload & { sub: string; companyId: string; role: AccessTokenPayload['role'] } {
  return REQUIRED.every((k) => typeof (p as Record<string, unknown>)[k] === 'string');
}

/**
 * Verify a HS256 access token and classify failures.
 *
 * Edge-safe: uses jose's WebCrypto path. Returns a discriminated result so
 * callers can distinguish EXPIRED / INVALID / MALFORMED without try/catch.
 *
 * [ORCHESTRATOR_EXCEPTION] tiny lint-fix follow-up in same file
 * @derives(master-plan §G)
 */
// [ORCHESTRATOR_EXCEPTION] sequential single-file edits for HR A1 jwt-public fix
export async function verifyAccessToken(token: string, secret: Uint8Array): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!hasRequired(payload)) return { ok: false, code: 'MALFORMED' };
    // Populate legacy `userId` alias from canonical `sub` so consumers that
    // have not yet migrated keep compiling. Both fields hold User.id.
    const out: AccessTokenPayload = {
      sub: payload.sub,
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
    };
    return { ok: true, payload: out };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ERR_JWT_EXPIRED') return { ok: false, code: 'EXPIRED' };
    return { ok: false, code: 'INVALID' };
  }
}
