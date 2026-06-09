// auth-exempt — refresh token IS the credential (no Authorization header). Route re-reads Membership.status + User.is_platform_admin on every call, equivalent of requireAuth for this endpoint. See packages/ai-tools/src/session-audit.ts:517.
// tenant-exempt — companyId is re-read from DB by membershipId on every call, not taken from caller. See packages/ai-tools/src/session-audit.ts:676.
/**
 * POST /auth/refresh — F1-b refresh rotation route.
 *
 * Accepts an opaque refresh token (`axrt_<base64url>`), rotates the family,
 * and re-issues a fresh 15-min access JWT carrying currently-active
 * Membership claims.
 *
 * Security model (locked NEXT_SESSION.md §6):
 *   - Token is SHA-256-hashed before any DB lookup. No plaintext at rest.
 *   - Rotated-token reuse OUTSIDE the 10s grace window → COMPROMISE.
 *     Family revoked, Membership.tokenEpoch++ kills outstanding access
 *     tokens; legitimate user must re-OTP.
 *   - Rotated-token reuse INSIDE the 10s grace window → fresh rotation
 *     (mints a new token, returns it). The plan said "return the same
 *     token" but the store keeps only the hash; minting again is the
 *     coherent answer at our 2K-user scale and rate-limit caps any
 *     amplification at 10/min/IP.
 *   - Membership is RE-READ on every refresh. Role/status/epoch changes
 *     since login take effect immediately on refresh.
 *   - Legacy JWT-shaped tokens → 401 AUTH_LEGACY_REFRESH so the mobile
 *     client wipes and routes to OTP. Founder decision 2026-05-28.
 *
 * Errors:
 *   400 BAD_FORMAT           — Zod body parse failure
 *   401 AUTH_LEGACY_REFRESH  — JWT-shaped token (pre-f1-b)
 *   401 INVALID_REFRESH      — not found, compromise, race, or revoked role
 *   401 REFRESH_REVOKED      — family already revoked (LOGOUT, ADMIN_REVOKE)
 *   429 REFRESH_RATE_LIMITED — >10 attempts/min from this IP
 *
 * @derives(ADR-0007)
 * @derives(master-plan §G)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Role } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { withUserContext } from '../middleware/tenant-context.js';
import { issueAccessToken } from '../lib/jwt.js';
import {
  createRefreshTokenStore,
  isLegacyToken,
  type RefreshTokenStore,
} from '../lib/services/refresh-token-store.js';
import { checkAndConsumeRateLimit } from '../lib/redis-rate-limit.js';

const RefreshInput = z.object({
  refreshToken: z.string().min(20).max(60),
});

const RATE_LIMIT_PER_IP = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ACCESS_TTL_SECONDS = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);

/**
 * Register POST /auth/refresh on the Fastify app.
 *
 * @derives(ADR-0007)
 */
export async function registerAuthRefreshRoutes(app: FastifyInstance): Promise<void> {
  const store: RefreshTokenStore = createRefreshTokenStore(prisma);

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = RefreshInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_FORMAT', message: 'Invalid refresh request body' });
      return;
    }
    const { refreshToken } = parsed.data;
    const ip = req.ip ?? 'unknown';

    const rl = await checkAndConsumeRateLimit({
      route: 'authrefresh',
      subject: ip,
      limit: RATE_LIMIT_PER_IP,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!rl.ok) {
      reply
        .code(429)
        .header('retry-after', Math.ceil(rl.retryAfterMs / 1000))
        .send({
          error: 'REFRESH_RATE_LIMITED',
          message: 'Too many refresh attempts; try again shortly',
        });
      return;
    }

    if (isLegacyToken(refreshToken)) {
      req.log.info(
        { event: 'refresh.attempt', outcome: 'legacy', ip },
        'refresh rejected: legacy token',
      );
      reply
        .code(401)
        .send({ error: 'AUTH_LEGACY_REFRESH', message: 'Session expired; please log in again' });
      return;
    }

    const result = await store.validate(refreshToken);

    if (!result.found) {
      req.log.info(
        { event: 'refresh.attempt', outcome: 'invalid', ip },
        'refresh rejected: not found',
      );
      reply.code(401).send({ error: 'INVALID_REFRESH', message: 'Invalid refresh token' });
      return;
    }

    if (result.revoked) {
      req.log.info(
        { event: 'refresh.attempt', outcome: 'revoked', familyId: result.family.id, ip },
        'refresh rejected: family revoked',
      );
      reply.code(401).send({ error: 'REFRESH_REVOKED', message: 'Refresh token revoked' });
      return;
    }

    if (result.expired) {
      req.log.info(
        { event: 'refresh.attempt', outcome: 'expired', familyId: result.family.id, ip },
        'refresh rejected: token past absolute expiry',
      );
      // Same opaque 401 as not-found — never signal which condition tripped.
      reply.code(401).send({ error: 'INVALID_REFRESH', message: 'Invalid refresh token' });
      return;
    }

    if (result.compromise) {
      req.log.warn(
        {
          event: 'refresh.attempt',
          outcome: 'compromise',
          familyId: result.family.id,
          userId: result.family.userId,
          membershipId: result.family.membershipId,
          ip,
        },
        'refresh COMPROMISE: rotated-token reuse outside grace window',
      );
      await store.revokeForCompromise(result.family.id);
      // Never signal detection to attacker — same 401 INVALID_REFRESH as not-found
      reply.code(401).send({ error: 'INVALID_REFRESH', message: 'Invalid refresh token' });
      return;
    }

    const family = result.family;
    const withinGrace = result.withinGrace === true;

    // Re-read Membership / User so role/status/epoch changes since login take effect.
    let companyId: string;
    let role: Role;
    let availableRoles: ReadonlyArray<Role>;
    let locale: string;
    let epoch: number;
    let isPlatformAdmin: boolean;

    if (family.membershipId === null) {
      const user = await prisma.user.findUnique({
        where: { id: family.userId },
        select: { id: true, locale: true, is_platform_admin: true },
      });
      if (!user || user.is_platform_admin !== true) {
        req.log.warn(
          {
            event: 'refresh.attempt',
            outcome: 'super_admin_revoked',
            familyId: family.id,
            userId: family.userId,
            ip,
          },
          'refresh rejected: SUPER_ADMIN privilege revoked',
        );
        reply.code(401).send({ error: 'INVALID_REFRESH', message: 'Invalid refresh token' });
        return;
      }
      companyId = user.id;
      role = 'SUPER_ADMIN' as Role;
      availableRoles = [role];
      locale = user.locale;
      epoch = 0;
      isPlatformAdmin = true;
    } else {
      // RLS: read the caller's own membership via tenant_self_read (own userId).
      // membershipId hoisted to a const so its non-null narrowing survives the closure.
      const membershipId = family.membershipId;
      const membership = await withUserContext(prisma, family.userId, async (tx) =>
        tx.membership.findUnique({
          where: { id: membershipId },
          select: {
            id: true,
            companyId: true,
            role: true,
            status: true,
            tokenEpoch: true,
            user: { select: { id: true, locale: true, is_platform_admin: true } },
          },
        }),
      );
      if (!membership || membership.status !== 'ACTIVE') {
        req.log.warn(
          {
            event: 'refresh.attempt',
            outcome: 'membership_inactive',
            familyId: family.id,
            membershipId: family.membershipId,
            ip,
          },
          'refresh rejected: membership not ACTIVE',
        );
        reply.code(401).send({ error: 'INVALID_REFRESH', message: 'Invalid refresh token' });
        return;
      }
      const allMemberships = await withUserContext(prisma, membership.user.id, (tx) =>
        tx.membership.findMany({
          where: { userId: membership.user.id, status: 'ACTIVE' },
          select: { role: true },
        }),
      );
      companyId = membership.companyId;
      role = membership.role as Role;
      availableRoles = allMemberships.map((m) => m.role as Role);
      locale = membership.user.locale;
      epoch = membership.tokenEpoch;
      isPlatformAdmin = membership.user.is_platform_admin === true;
    }

    let rotated;
    try {
      rotated = await store.rotate({ familyId: family.id, ipLast: ip });
    } catch (err) {
      // Race with a parallel rotate on the same family — unique index on
      // currentTokenHash means one of us loses. Map to INVALID_REFRESH so
      // the client wipes and re-OTPs rather than seeing a 500.
      req.log.warn(
        {
          event: 'refresh.attempt',
          outcome: 'rotate_race',
          familyId: family.id,
          err: err instanceof Error ? err.message : String(err),
          ip,
        },
        'refresh rotation race lost',
      );
      reply.code(401).send({ error: 'INVALID_REFRESH', message: 'Invalid refresh token' });
      return;
    }

    const accessToken = await issueAccessToken({
      userId: family.userId,
      companyId,
      role,
      availableRoles,
      locale,
      ...(family.membershipId !== null ? { membershipId: family.membershipId } : {}),
      epoch,
      isPlatformAdmin,
    });

    req.log.info(
      {
        event: 'refresh.attempt',
        outcome: withinGrace ? 'grace_rerotate' : 'rotated',
        familyId: family.id,
        membershipId: family.membershipId,
        userId: family.userId,
        ip,
      },
      'refresh ok',
    );

    reply.send({
      accessToken,
      refreshToken: rotated.plainToken,
      expiresIn: ACCESS_TTL_SECONDS,
    });
  });
}
