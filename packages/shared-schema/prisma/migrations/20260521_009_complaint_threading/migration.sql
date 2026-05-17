-- Migration 009 — Complaint threading (Wave 3 chat intent classifier slice)
--
-- Locked 2026-05-18 under the v2 30-day supervisor simulation plan
-- (`docs/plans/2026-05-18-supervisor-30-day-real-life-simulation-v2.md` §3).
--
-- Scope:
--   (a) Extend `axhy.Complaint` with:
--         - `kind`                  TEXT NOT NULL DEFAULT 'other'
--         - `state`                 TEXT NOT NULL DEFAULT 'OPEN'
--         - `unreadHrRepliesCount`  INTEGER NOT NULL DEFAULT 0
--         - `lastReplyAt`           TIMESTAMP NULLable
--         - `createdByUserId`       UUID NOT NULL (back-filled from
--                                   supervisorId for existing rows)
--       + two new B-tree indexes:
--         - (companyId, state, createdAt)               — HR triage
--         - (companyId, createdByUserId, state, createdAt) — supervisor inbox
--       + CHECK constraints on `kind` and `state` enums (DB-level invariant
--         enforcement per the production-grade rulebook P1: invariants
--         enforced, not described).
--
--   (b) Create `axhy.ComplaintMessage` (threaded replies) + indexes.
--
--   (c) Create `axhy.ComplaintMessageRead` (per-(message, actor) read
--       receipts with composite PK so concurrent reads are idempotent).
--
-- Rollback note:
--   Down-migration: `DROP TABLE axhy."ComplaintMessageRead";`
--                   `DROP TABLE axhy."ComplaintMessage";`
--                   `ALTER TABLE axhy."Complaint" DROP COLUMN "kind",
--                       DROP COLUMN "state", DROP COLUMN "unreadHrRepliesCount",
--                       DROP COLUMN "lastReplyAt", DROP COLUMN "createdByUserId";`
--                   Plus drop the two new Complaint indexes and the two CHECK
--                   constraints. No data loss for pre-Wave-3 rows (state is
--                   recoverable from `resolvedAt IS NULL`, kind defaults to
--                   'other', counters were always 0).
--
-- @derives(supervisor-drawer-and-decisions-redesign.md §A.5 + §B + §C)
-- @derives(supervisor-30day-scenarios.md scenarios #26–38 — complaint cases)
-- @derives(panel-2026-05-18) — Wave 3 backend

-- =============================================================================
-- (a) Complaint extensions
-- =============================================================================

ALTER TABLE "axhy"."Complaint"
  ADD COLUMN IF NOT EXISTS "kind"                 TEXT      NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "state"                TEXT      NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "unreadHrRepliesCount" INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastReplyAt"          TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS "createdByUserId"      UUID      NULL;

-- Back-fill `createdByUserId` from `supervisorId` for pre-Wave-3 rows.
-- After back-fill, flip to NOT NULL. We do this in two steps so the
-- migration is safe on a non-empty production-shaped table.
UPDATE "axhy"."Complaint"
   SET "createdByUserId" = "supervisorId"
 WHERE "createdByUserId" IS NULL;

ALTER TABLE "axhy"."Complaint"
  ALTER COLUMN "createdByUserId" SET NOT NULL;

-- CHECK constraints — invariants enforced at the DB level per P1.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'complaint_kind_check'
  ) THEN
    ALTER TABLE "axhy"."Complaint"
      ADD CONSTRAINT "complaint_kind_check"
      CHECK ("kind" IN (
        'photo_mismatch',
        'missed_area',
        'attitude',
        'theft_accusation',
        'hygiene',
        'noise',
        'damage',
        'gate_pass',
        'other'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'complaint_state_check'
  ) THEN
    ALTER TABLE "axhy"."Complaint"
      ADD CONSTRAINT "complaint_state_check"
      CHECK ("state" IN ('OPEN', 'IN_HR', 'RESOLVED', 'DISMISSED'));
  END IF;
END $$;

-- New indexes — HR triage + supervisor inbox.
CREATE INDEX IF NOT EXISTS "Complaint_companyId_state_createdAt_idx"
  ON "axhy"."Complaint" ("companyId", "state", "createdAt");

CREATE INDEX IF NOT EXISTS "Complaint_companyId_createdByUserId_state_createdAt_idx"
  ON "axhy"."Complaint" ("companyId", "createdByUserId", "state", "createdAt");

-- =============================================================================
-- (b) ComplaintMessage
-- =============================================================================

CREATE TABLE IF NOT EXISTS "axhy"."ComplaintMessage" (
  "id"           UUID      NOT NULL DEFAULT gen_random_uuid(),
  "complaintId"  UUID      NOT NULL,
  "companyId"    UUID      NOT NULL,
  "authorUserId" UUID      NOT NULL,
  "authorRole"   TEXT      NOT NULL,
  "body"         TEXT      NOT NULL,
  "attachments"  JSONB     NULL,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplaintMessage_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'complaint_message_author_role_check'
  ) THEN
    ALTER TABLE "axhy"."ComplaintMessage"
      ADD CONSTRAINT "complaint_message_author_role_check"
      CHECK ("authorRole" IN ('SUPERVISOR', 'HR', 'ADMIN'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ComplaintMessage_complaintId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ComplaintMessage"
      ADD CONSTRAINT "ComplaintMessage_complaintId_fkey"
      FOREIGN KEY ("complaintId")
      REFERENCES "axhy"."Complaint" ("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ComplaintMessage_companyId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ComplaintMessage"
      ADD CONSTRAINT "ComplaintMessage_companyId_fkey"
      FOREIGN KEY ("companyId")
      REFERENCES "axhy"."Company" ("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ComplaintMessage_complaintId_createdAt_idx"
  ON "axhy"."ComplaintMessage" ("complaintId", "createdAt");

CREATE INDEX IF NOT EXISTS "ComplaintMessage_companyId_createdAt_idx"
  ON "axhy"."ComplaintMessage" ("companyId", "createdAt");

-- =============================================================================
-- (c) ComplaintMessageRead — per-(message, actor) read receipts
-- =============================================================================
--
-- Composite PK on (messageId, actorUserId) makes concurrent mark-read
-- idempotent: the second insert hits the PK conflict and we return success.
-- See Wave 3 brief: "supervisor + HR mark same message read simultaneously —
-- both succeed (idempotent)".

CREATE TABLE IF NOT EXISTS "axhy"."ComplaintMessageRead" (
  "messageId"   UUID      NOT NULL,
  "actorUserId" UUID      NOT NULL,
  "actorRole"   TEXT      NOT NULL,
  "companyId"   UUID      NOT NULL,
  "readAt"      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplaintMessageRead_pkey" PRIMARY KEY ("messageId", "actorUserId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'complaint_message_read_actor_role_check'
  ) THEN
    ALTER TABLE "axhy"."ComplaintMessageRead"
      ADD CONSTRAINT "complaint_message_read_actor_role_check"
      CHECK ("actorRole" IN ('SUPERVISOR', 'HR', 'ADMIN'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ComplaintMessageRead_messageId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ComplaintMessageRead"
      ADD CONSTRAINT "ComplaintMessageRead_messageId_fkey"
      FOREIGN KEY ("messageId")
      REFERENCES "axhy"."ComplaintMessage" ("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ComplaintMessageRead_companyId_actorUserId_idx"
  ON "axhy"."ComplaintMessageRead" ("companyId", "actorUserId");
