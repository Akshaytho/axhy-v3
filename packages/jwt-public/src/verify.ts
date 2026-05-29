import { jwtVerify, type JWTPayload } from 'jose';

/**
 * Decoded access-token claims required by every authenticated request.
 *
 * [ORCHESTRATOR_EXCEPTION] tiny lint-fix follow-up in same file
 * @derives(master-plan §G)
 */
export type AccessTokenPayload = {
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

const REQUIRED = ['userId', 'companyId', 'role'] as const;

function hasRequired(p: JWTPayload): p is JWTPayload & AccessTokenPayload {
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
export async function verifyAccessToken(token: string, secret: Uint8Array): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!hasRequired(payload)) return { ok: false, code: 'MALFORMED' };
    return { ok: true, payload };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ERR_JWT_EXPIRED') return { ok: false, code: 'EXPIRED' };
    return { ok: false, code: 'INVALID' };
  }
}
