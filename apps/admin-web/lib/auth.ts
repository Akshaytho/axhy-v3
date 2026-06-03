/**
 * Server-only session helpers for the admin-web portal.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 tasks 9/10/11
 *
 * Reads the httpOnly `axhy_at` cookie set by /api/auth/session and verifies
 * the access token using @axhy/jwt-public (HS256, shared secret with backend).
 *
 * Used by every HR-portal server component and server action to gate
 * access by role. Closed-by-default: any verification failure → null/redirect.
 *
 * @derives(master-plan §G)
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken, type AccessTokenPayload } from '@axhy/jwt-public';

import { jwtSecret } from './env';

const SECRET = new TextEncoder().encode(jwtSecret);

export type Session = AccessTokenPayload;

/**
 * Read the access-token cookie and return the verified payload, or null
 * if the cookie is missing / expired / malformed.
 *
 * Server-only — relies on next/headers cookies(). Safe to call from layouts,
 * pages, route handlers, and server actions.
 *
 * @derives(master-plan §G)
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const at = store.get('axhy_at')?.value;
  if (!at) return null;
  const result = await verifyAccessToken(at, SECRET);
  return result.ok ? result.payload : null;
}

/**
 * Require an authenticated session with one of the allowed roles.
 *
 * Redirects to /login if no session exists, or /forbidden if the session's
 * role is not in the allowed list. On success, returns the verified Session
 * for the caller to use (e.g. companyId scoping in subsequent API calls).
 *
 * Server-only.
 *
 * @derives(master-plan §G)
 */
export async function requireRole(...roles: Session['role'][]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role)) redirect('/forbidden');
  return session;
}
