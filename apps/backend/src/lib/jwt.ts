/**
 * JWT issue + verify using `jose`.
 *
 * Per ADR-0007:
 *   - Access TTL: 900 seconds (15 min)
 *   - Refresh TTL: 2,592,000 seconds (30 days)
 *   - Algorithm: HS256
 *   - Secret: JWT_SECRET env var (>= 32 bytes base64)
 *
 * @derives(ADR-0007)
 */

import { SignJWT, jwtVerify } from 'jose';
import { JWTClaims } from '@axhy/shared-schema';
import type { JWTClaims as JWTClaimsType, Role } from '@axhy/shared-schema';

const ACCESS_TTL_SECONDS = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'JWT_SECRET env var is required and must be at least 32 chars. See apps/backend/.env.example.',
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Issue an access token for an authenticated user inside a specific company.
 *
 * @derives(ADR-0007)
 */
export async function issueAccessToken(input: {
  userId: string;
  companyId: string;
  role: Role;
  availableRoles: ReadonlyArray<Role>;
  locale: string;
  // F1 trust model — optional during compat window. Always supplied by
  // /auth/otp/verify going forward. @derives(F1 trust model 2026-05-27)
  membershipId?: string;
  epoch?: number;
  isPlatformAdmin?: boolean;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: JWTClaimsType = {
    sub: input.userId,
    companyId: input.companyId,
    role: input.role,
    availableRoles: [...input.availableRoles],
    locale: input.locale,
    iat: now,
    exp: now + ACCESS_TTL_SECONDS,
    kind: 'access',
    ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
    ...(input.epoch !== undefined ? { epoch: input.epoch } : {}),
    ...(input.isPlatformAdmin !== undefined ? { isPlatformAdmin: input.isPlatformAdmin } : {}),
  };
  return await new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(getSecret());
}

/**
 * Verify and parse an access token. Throws on invalid / expired / wrong kind.
 *
 * @derives(ADR-0007)
 */
export async function verifyAccessToken(token: string): Promise<JWTClaimsType> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
  const parsed = JWTClaims.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`JWT payload failed schema validation: ${parsed.error.message}`);
  }
  if (parsed.data.kind !== 'access') {
    throw new Error('Token is not an access token');
  }
  return parsed.data;
}
