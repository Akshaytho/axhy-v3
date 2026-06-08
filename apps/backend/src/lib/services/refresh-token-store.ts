/**
 * F1-b refresh-token store — opaque random tokens with Postgres family
 * rows and Redis hot-path cache.
 *
 * Design (locked NEXT_SESSION.md §6, see docs/plans/2026-05-28-f1-b-refresh-rotation.md):
 *
 *   - Token format: `axrt_<base64url(32 bytes)>`. Stored only as SHA-256
 *     hex at rest. Plaintext never persists.
 *   - One row per device-session (family). `currentTokenHash` is the active
 *     token; `previousTokenHash` is held for 10 s after rotation to absorb
 *     mobile network races (client retries after timeout).
 *   - Reuse of a rotated token OUTSIDE the 10 s grace window triggers
 *     compromise response: revoke the family row, DEL the Redis cache key,
 *     bump `Membership.tokenEpoch` (kills outstanding access tokens too).
 *   - Postgres is source of truth. Redis is opportunistic cache; outage
 *     degrades to DB-only path (logged, never throws to caller).
 *
 * @derives(ADR-0007)
 */

import crypto from 'node:crypto';

import type { PrismaClient, RefreshToken } from '@prisma/client';
import pino from 'pino';

import { getRedis } from '../redis.js';
import { RedisKeys } from '../redis-keys.js';

const log = pino({ name: 'refresh-token-store' });

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const REDIS_TTL_SECONDS = 60 * 60 * 24 * 31; // 31 days (1 d slack vs DB)
const ROTATION_GRACE_MS = 10_000;
const TOKEN_PREFIX = 'axrt_';
const TOKEN_RANDOM_BYTES = 32;

/**
 * SHA-256 hex digest. Used at create-time (stored at rest) and
 * validate-time (lookup against the unique index on currentTokenHash).
 * @derives(ADR-0007)
 */
export function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * True for tokens that do NOT carry the F1-b `axrt_` prefix — i.e. legacy
 * JWT-shaped refresh tokens issued before f1-b. Founder decision 2026-05-28:
 * legacy tokens are refused with 401 AUTH_LEGACY_REFRESH; client wipes and
 * re-OTPs.
 * @derives(ADR-0007)
 */
export function isLegacyToken(token: string): boolean {
  return !token.startsWith(TOKEN_PREFIX);
}

function mintRawToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(TOKEN_RANDOM_BYTES).toString('base64url');
}

/**
 * Outcome of validate(plainToken). `family` is present iff `found=true`.
 * Mutually exclusive flags: `withinGrace` (previous hash within 10 s),
 * `compromise` (previous hash AFTER 10 s — attacker reuse), `revoked`
 * (family already marked dead).
 * @derives(ADR-0007)
 */
export type ValidateResult =
  | { found: false }
  | {
      found: true;
      family: RefreshToken;
      withinGrace?: boolean;
      compromise?: boolean;
      revoked?: boolean;
      /** Token is past its absolute expiresAt (H9). Route maps this to 401. */
      expired?: boolean;
    };

/**
 * Public surface of the refresh-token store. Returned by
 * createRefreshTokenStore(prisma) — single instance per backend process.
 * @derives(ADR-0007)
 */
export interface RefreshTokenStore {
  create(input: {
    userId: string;
    membershipId: string | null;
    userAgent?: string;
    ipFirst?: string;
  }): Promise<{ familyId: string; plainToken: string; expiresAt: Date }>;

  validate(plainToken: string): Promise<ValidateResult>;

  rotate(input: {
    familyId: string;
    ipLast?: string;
  }): Promise<{ plainToken: string; expiresAt: Date }>;

  revokeForCompromise(familyId: string): Promise<void>;
  revokeForLogout(familyId: string): Promise<void>;
}

/** Best-effort Redis write; logs and swallows on outage. */
async function warmRedis(familyId: string, hash: string): Promise<void> {
  try {
    await getRedis().set(RedisKeys.refreshCurrentHash(familyId), hash, 'EX', REDIS_TTL_SECONDS);
  } catch (err) {
    log.warn(
      { event: 'refresh.redis_warm_failed', err: err instanceof Error ? err.message : String(err) },
      'refresh: redis warm failed; proceeding via DB',
    );
  }
}

async function clearRedis(familyId: string): Promise<void> {
  try {
    await getRedis().del(RedisKeys.refreshCurrentHash(familyId));
  } catch (err) {
    log.warn(
      {
        event: 'refresh.redis_clear_failed',
        err: err instanceof Error ? err.message : String(err),
      },
      'refresh: redis clear failed; family revoked in DB anyway',
    );
  }
}

/**
 * Factory — pass in a PrismaClient (the singleton from lib/prisma.ts in
 * production; ephemeral clients in tests). Returns the RefreshTokenStore.
 * @derives(ADR-0007)
 */
export function createRefreshTokenStore(prisma: PrismaClient): RefreshTokenStore {
  return {
    async create({ userId, membershipId, userAgent, ipFirst }) {
      const plainToken = mintRawToken();
      const hash = sha256hex(plainToken);
      const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
      const row = await prisma.refreshToken.create({
        data: {
          userId,
          membershipId,
          currentTokenHash: hash,
          expiresAt,
          userAgent: userAgent?.slice(0, 256),
          ipFirst: ipFirst?.slice(0, 64),
          ipLast: ipFirst?.slice(0, 64),
        },
      });
      await warmRedis(row.id, hash);
      return { familyId: row.id, plainToken, expiresAt };
    },

    async validate(plainToken) {
      const hash = sha256hex(plainToken);

      // Happy path: O(1) lookup on unique index.
      const byCurrent = await prisma.refreshToken.findUnique({
        where: { currentTokenHash: hash },
      });
      if (byCurrent) {
        if (byCurrent.revokedAt) {
          return { found: true, family: byCurrent, revoked: true };
        }
        // H9: enforce absolute expiry — a token past expiresAt is rejected so a
        // stale/stolen refresh token can no longer be used forever.
        if (byCurrent.expiresAt.getTime() <= Date.now()) {
          return { found: true, family: byCurrent, expired: true };
        }
        return { found: true, family: byCurrent };
      }

      // Rotation grace / compromise path: lookup against previousTokenHash.
      // Partial index keeps this cheap (only rows with non-null previous).
      const byPrevious = await prisma.refreshToken.findFirst({
        where: { previousTokenHash: hash, revokedAt: null },
      });
      if (!byPrevious) {
        return { found: false };
      }
      // H9: absolute expiry applies on the prev-hash (grace/compromise) path too.
      if (byPrevious.expiresAt.getTime() <= Date.now()) {
        return { found: true, family: byPrevious, expired: true };
      }
      const previousAge = byPrevious.previousRotatedAt
        ? Date.now() - byPrevious.previousRotatedAt.getTime()
        : Number.MAX_SAFE_INTEGER;
      if (previousAge <= ROTATION_GRACE_MS) {
        return { found: true, family: byPrevious, withinGrace: true };
      }
      return { found: true, family: byPrevious, compromise: true };
    },

    async rotate({ familyId, ipLast }) {
      const existing = await prisma.refreshToken.findUnique({ where: { id: familyId } });
      if (!existing) throw new Error(`rotate: family ${familyId} not found`);
      if (existing.revokedAt) throw new Error(`rotate: family ${familyId} is revoked`);
      const newPlain = mintRawToken();
      const newHash = sha256hex(newPlain);
      // H9: do NOT slide the expiry on rotation. The family keeps its ORIGINAL
      // absolute expiresAt (set at create), so a token refreshed repeatedly still
      // dies ~30 days after issuance — it cannot be kept alive forever by use.
      await prisma.refreshToken.update({
        where: { id: familyId },
        data: {
          previousTokenHash: existing.currentTokenHash,
          previousRotatedAt: new Date(),
          currentTokenHash: newHash,
          lastUsedAt: new Date(),
          ipLast: ipLast?.slice(0, 64) ?? existing.ipLast,
        },
      });
      await warmRedis(familyId, newHash);
      return { plainToken: newPlain, expiresAt: existing.expiresAt };
    },

    async revokeForCompromise(familyId) {
      const row = await prisma.refreshToken.findUnique({ where: { id: familyId } });
      if (!row) return;
      await prisma.$transaction(async (tx) => {
        await tx.refreshToken.update({
          where: { id: familyId },
          data: { revokedAt: new Date(), revokedReason: 'COMPROMISE' },
        });
        if (row.membershipId) {
          await tx.membership.update({
            where: { id: row.membershipId },
            data: { tokenEpoch: { increment: 1 } },
          });
        }
      });
      await clearRedis(familyId);
    },

    async revokeForLogout(familyId) {
      await prisma.refreshToken.updateMany({
        where: { id: familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
      });
      await clearRedis(familyId);
    },
  };
}
