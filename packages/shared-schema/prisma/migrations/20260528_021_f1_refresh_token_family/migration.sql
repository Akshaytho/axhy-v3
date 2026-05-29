-- F1-b refresh token families
-- Opaque random tokens, hashed at rest. One row per device-session (family).
-- Family-detection (Stripe pattern): reuse of a rotated token outside the
-- 10-second grace window triggers compromise response: family revoked +
-- Membership.token_epoch bumped (kills outstanding access tokens too).
--
-- Additive migration. No ALTER on existing tables. Zero downtime.

CREATE TABLE "axhy"."RefreshToken" (
  "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  "userId"              UUID         NOT NULL,
  "membershipId"        UUID,                                              -- NULL for SUPER_ADMIN (no tenant)
  "currentTokenHash"    VARCHAR(64)  NOT NULL,                             -- SHA-256 hex (64 chars). Always set until revoked.
  "previousTokenHash"   VARCHAR(64),                                       -- previous hash kept for 10s rotation grace
  "previousRotatedAt"   TIMESTAMPTZ,                                       -- when current became previous
  "createdAt"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "lastUsedAt"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expiresAt"           TIMESTAMPTZ  NOT NULL,                             -- 30 days from creation, slides on rotate
  "revokedAt"           TIMESTAMPTZ,
  "revokedReason"       VARCHAR(32),                                       -- LOGOUT | COMPROMISE | EXPIRED | ADMIN_REVOKE
  "userAgent"           VARCHAR(256),
  "ipFirst"             VARCHAR(64),
  "ipLast"              VARCHAR(64),
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId")       REFERENCES "axhy"."User"("id")       ON DELETE CASCADE,
  CONSTRAINT "RefreshToken_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "axhy"."Membership"("id") ON DELETE CASCADE
);

-- O(1) happy-path lookup. Also structurally prevents two families sharing a token.
CREATE UNIQUE INDEX "RefreshToken_currentTokenHash_key" ON "axhy"."RefreshToken"("currentTokenHash");

-- Forensic + admin-list queries (e.g. all sessions for a user).
CREATE INDEX "RefreshToken_userId_idx"       ON "axhy"."RefreshToken"("userId");
CREATE INDEX "RefreshToken_membershipId_idx" ON "axhy"."RefreshToken"("membershipId");

-- Compromise-detect path. Partial index keeps it small (most rows have NULL previous).
CREATE INDEX "RefreshToken_previousTokenHash_idx"
  ON "axhy"."RefreshToken"("previousTokenHash") WHERE "previousTokenHash" IS NOT NULL;

-- Future sweeper cron (F1-c) scans expired non-revoked rows.
CREATE INDEX "RefreshToken_expiresAt_idx"
  ON "axhy"."RefreshToken"("expiresAt") WHERE "revokedAt" IS NULL;
