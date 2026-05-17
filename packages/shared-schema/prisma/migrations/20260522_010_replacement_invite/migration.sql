-- Migration 010 — ReplacementInvite (F28) — Wave 1 backend
--
-- Locked 2026-05-18 under the v2 30-day supervisor simulation plan
-- (`docs/plans/2026-05-18-supervisor-30-day-real-life-simulation-v2.md` §3 Wave 1).
--
-- Scope:
--   Create `axhy.ReplacementInvite` (PUBG-style multi-worker invite broadcast).
--   The table replaces a stub model introduced by Wave 3 commit 2d16919 so
--   parallel sub-agents could `prisma generate` while Wave 1 was incomplete.
--   This migration is the definitive table shape; the stub is purely a
--   schema-level convenience and never had its own migration.
--
-- Lifecycle invariants enforced at the DB level (P-rule P1):
--   - status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')
--   - expiresAt > sentAt
--   - terminal-state rows have respondedAt set (PARTIAL CHECK below).
--
-- Indexes — sized for the cron sweep + supervisor/worker inbox + group-atomic
-- operations. The cron predicate (status='PENDING' AND expiresAt < NOW())
-- hits the first index; the supervisor and worker list queries hit the
-- composite (companyId, *, status) indexes; group operations pivot on groupId.
--
-- Rollback note:
--   Down-migration: `DROP TABLE axhy."ReplacementInvite";`
--   No data loss for any other table — this is purely additive. Wave 3's
--   stub-replacement is overwritten here; rolling this back returns the
--   schema to a stub-shaped column set, which is harmless to existing data
--   (the stub had a strict-superset of nullable columns).
--
-- @derives(master-plan §P.4 — ReplacementInvite)
-- @derives(master-plan §G:976 — replacement-picker locked design)
-- @derives(replacement-invite-feature-spec.md, 2026-05-18)
-- @derives(supervisor-30day-scenarios.md scenarios #39–46 + emergency cover)

CREATE TABLE IF NOT EXISTS "axhy"."ReplacementInvite" (
  "id"               UUID      NOT NULL DEFAULT gen_random_uuid(),
  "companyId"        UUID      NOT NULL,
  "groupId"          UUID      NOT NULL,
  "fromSupervisorId" UUID      NOT NULL,
  "toWorkerId"       UUID      NOT NULL,
  "visitId"          UUID      NULL,
  "siteId"           UUID      NOT NULL,
  "scheduledStart"   TIMESTAMP NOT NULL,
  "status"           TEXT      NOT NULL DEFAULT 'PENDING',
  "sentAt"           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"        TIMESTAMP NOT NULL,
  "respondedAt"      TIMESTAMP NULL,
  "respondReason"    TEXT      NULL,
  "createdAt"        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplacementInvite_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- DB-level invariants
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'replacement_invite_status_check'
  ) THEN
    ALTER TABLE "axhy"."ReplacementInvite"
      ADD CONSTRAINT "replacement_invite_status_check"
      CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'replacement_invite_expiry_after_sent_check'
  ) THEN
    ALTER TABLE "axhy"."ReplacementInvite"
      ADD CONSTRAINT "replacement_invite_expiry_after_sent_check"
      CHECK ("expiresAt" > "sentAt");
  END IF;
END $$;

-- Terminal rows must have respondedAt; PENDING rows must not.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'replacement_invite_responded_at_consistency_check'
  ) THEN
    ALTER TABLE "axhy"."ReplacementInvite"
      ADD CONSTRAINT "replacement_invite_responded_at_consistency_check"
      CHECK (
        ("status" = 'PENDING' AND "respondedAt" IS NULL)
        OR
        ("status" <> 'PENDING' AND "respondedAt" IS NOT NULL)
      );
  END IF;
END $$;

-- =============================================================================
-- Foreign keys
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ReplacementInvite_companyId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ReplacementInvite"
      ADD CONSTRAINT "ReplacementInvite_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "axhy"."Company" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ReplacementInvite_fromSupervisorId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ReplacementInvite"
      ADD CONSTRAINT "ReplacementInvite_fromSupervisorId_fkey"
      FOREIGN KEY ("fromSupervisorId") REFERENCES "axhy"."User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ReplacementInvite_toWorkerId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ReplacementInvite"
      ADD CONSTRAINT "ReplacementInvite_toWorkerId_fkey"
      FOREIGN KEY ("toWorkerId") REFERENCES "axhy"."User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ReplacementInvite_siteId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ReplacementInvite"
      ADD CONSTRAINT "ReplacementInvite_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "axhy"."Site" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ReplacementInvite_visitId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ReplacementInvite"
      ADD CONSTRAINT "ReplacementInvite_visitId_fkey"
      FOREIGN KEY ("visitId") REFERENCES "axhy"."Visit" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Cron sweep predicate — `status='PENDING' AND expiresAt < NOW()`.
CREATE INDEX IF NOT EXISTS "ReplacementInvite_status_expiresAt_idx"
  ON "axhy"."ReplacementInvite" ("status", "expiresAt");

-- Supervisor inbox — "open broadcasts I sent".
CREATE INDEX IF NOT EXISTS "ReplacementInvite_companyId_fromSupervisorId_status_idx"
  ON "axhy"."ReplacementInvite" ("companyId", "fromSupervisorId", "status");

-- Worker inbox — "pending invites I received".
CREATE INDEX IF NOT EXISTS "ReplacementInvite_companyId_toWorkerId_status_idx"
  ON "axhy"."ReplacementInvite" ("companyId", "toWorkerId", "status");

-- Atomic group operations — sibling expire on first-accept, group cancel.
CREATE INDEX IF NOT EXISTS "ReplacementInvite_groupId_idx"
  ON "axhy"."ReplacementInvite" ("groupId");

-- General list query (activity feed).
CREATE INDEX IF NOT EXISTS "ReplacementInvite_companyId_sentAt_idx"
  ON "axhy"."ReplacementInvite" ("companyId", "sentAt");

-- =============================================================================
-- Partial unique index — at most one ACCEPTED row per group
-- =============================================================================
--
-- This is THE race-safety guarantee. Without it, two workers can both atomic-
-- UPDATE their own PENDING row to ACCEPTED concurrently (each touches a
-- different row id so the row-level locks don't conflict), and Postgres
-- READ COMMITTED isolation lets both succeed before either can run the
-- sibling-expire UPDATE.
--
-- With this partial unique index the second concurrent transaction hits a
-- P2002 unique-constraint violation on the index when it tries to set
-- status='ACCEPTED' — the service layer catches and surfaces as 409
-- ALREADY_DECIDED.
--
-- Pattern matches `binding-expire-sweep` migration 20260519_f003_*'s partial
-- unique index for the same reason: DB-enforced exclusion under concurrency,
-- not application-layer hope.

CREATE UNIQUE INDEX IF NOT EXISTS "ReplacementInvite_one_accepted_per_group_uniq"
  ON "axhy"."ReplacementInvite" ("groupId")
  WHERE "status" = 'ACCEPTED';
