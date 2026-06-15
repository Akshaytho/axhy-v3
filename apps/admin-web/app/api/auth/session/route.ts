/**
 * Session cookie route — POST sets httpOnly access/refresh tokens after
 * re-verifying the access token; DELETE clears them.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 tasks 9/10/11
 *
 * Called by the login page right after a successful OTP verify. The login
 * page receives {accessToken, refreshToken, user} from the backend, then
 * POSTs the two tokens here so they land in httpOnly cookies (never
 * exposed to JS). The response carries a {redirect} hint based on role.
 *
 * Security details:
 * - httpOnly: true always — tokens never reach browser JS.
 * - secure: process.env.NODE_ENV === 'production' so localhost dev works.
 * - sameSite: lax — allows top-level navigations, blocks cross-site POSTs.
 * - axhy_rt path scoped to /api/auth so the refresh token is not sent on
 *   every backend request.
 * - Re-verifies the access token via @axhy/jwt-public before trusting the
 *   client-supplied tokens. 401 on failure with classified code.
 *
 * @derives(master-plan §G)
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAccessToken } from '@axhy/jwt-public';

import { getJwtSecret } from '../../../../lib/env';

const Body = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(20),
});

// Lazy + memoized: encode the secret on first verify, not at module load, so
// `next build` does not evaluate (and crash on) a missing JWT_SECRET. See
// getJwtSecret in lib/env for the full rationale.
let _secret: Uint8Array | null = null;
function secret(): Uint8Array {
  return (_secret ??= new TextEncoder().encode(getJwtSecret()));
}

const FIFTEEN_MIN = 15 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;

/**
 * Establish a session: validate body, re-verify access token, set cookies.
 *
 * @derives(master-plan §G)
 */
export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'BODY_INVALID' }, { status: 400 });
  }
  const { accessToken, refreshToken } = parsed.data;
  const verified = await verifyAccessToken(accessToken, secret());
  if (!verified.ok) {
    return NextResponse.json({ error: 'TOKEN_INVALID', code: verified.code }, { status: 401 });
  }
  const store = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  store.set('axhy_at', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: FIFTEEN_MIN,
  });
  store.set('axhy_rt', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: SEVEN_DAYS,
  });
  const redirect = verified.payload.role === 'HR' ? '/hr' : '/owner';
  return NextResponse.json({ redirect });
}

/**
 * End a session: clear both auth cookies. Always returns 200.
 *
 * @derives(master-plan §G)
 */
export async function DELETE(): Promise<NextResponse> {
  const store = await cookies();
  store.delete('axhy_at');
  store.delete('axhy_rt');
  return NextResponse.json({ ok: true });
}
