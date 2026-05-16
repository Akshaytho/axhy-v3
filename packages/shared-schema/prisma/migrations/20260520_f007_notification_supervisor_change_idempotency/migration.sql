-- F-007 round-2 v11 — Notification persistence layer for `supervisor_change`
--
-- Locked 2026-05-16 after the v1 → v11 plan iteration + comprehensive 11-voice
-- production-readiness panel test (friend APPROVED at HEAD e0678d1 22:14).
--
-- This migration adds TWO things on the existing `axhy.Notification` table:
--
--   (a) ONE partial unique index for idempotent replay of `supervisor_change`
--       events. Every (recipient × channel × site × source-event) is at most
--       one row; replay → P2002 → handler logs `idempotent_skip` and continues.
--
--   (b) A DB-level CHECK constraint enforcing the audience mutual-exclusion
--       invariant — exactly one of `audienceUserId` / `audienceWorkerId` is
--       non-NULL per row. The Zod schema already refines this at the app
--       layer (NotificationSchema.refine in packages/shared-schema/src/zod/
--       notification.ts), but per the v11 panel-test Vikram finding (P1 —
--       invariants enforced, not described), the invariant MUST be enforced
--       at the DB level too. App-layer refines protect callers that use the
--       Zod schema; the DB constraint protects everything else (raw SQL,
--       direct prisma.notification.create() without Zod, etc.).
--
-- Both objects are guarded with IF NOT EXISTS so the migration is safe to
-- re-run on databases where either object was added out-of-band.
--
-- Architecture rule this migration supports (v8 — locked):
--   * our DB owns truth + audit + unread/read history + app panel.
--   * OneSignal (F-011) owns push subscription plumbing + delivery transport.
--   * future grouping stays read-side, not write-side.
-- Immutable rows + single idempotency index = the persistence-layer half.
--
-- @derives(F-007 scope round-2 v11 §3 pick 7)
-- @derives(F-007 v11 panel-test 2026-05-16 21:35 — Vikram P1 finding)
-- @derives(workflow-design-closure §3.4 Notification primitive)
-- @derives(workflow-design-closure Decision 4 — worker supervisor-change)

-- =============================================================================
-- (a) Partial unique index for idempotent replay
-- =============================================================================
--
-- COALESCE(...::text, '') turns NULL into an empty string for index purposes.
-- Exactly one of `audienceUserId` / `audienceWorkerId` is non-NULL per row
-- (enforced by the CHECK below + the existing Zod refine), so the COALESCE'd
-- composite gives a deterministic key keyed on whichever is set.
--
-- Without COALESCE, PostgreSQL would treat NULLs as distinct in the unique
-- index, which would defeat the dedup for the worker-recipient case (where
-- audienceUserId IS NULL on every row in the group).
--
-- The expression is in the WHERE clause too so the index is partial — only
-- `supervisor_change` rows are tracked. Other notification kinds (added in
-- future round-2+ sub-slices) get their own idempotency strategies.

CREATE UNIQUE INDEX IF NOT EXISTS "notification_supervisor_change_idempotency"
  ON "axhy"."Notification" (
    "companyId",
    "kind",
    "channel",
    COALESCE("audienceUserId"::text, ''),
    COALESCE("audienceWorkerId"::text, ''),
    ("payload" ->> 'sourceAuditId'),
    ("payload" ->> 'siteId')
  )
  WHERE "kind" = 'supervisor_change';

-- =============================================================================
-- (b) DB CHECK constraint — audience mutual exclusion
-- =============================================================================
--
-- Exactly one of audienceUserId / audienceWorkerId is non-NULL per row.
-- The existing schema (20260515_layer_1_core_primitives/migration.sql:88-104)
-- created the Notification table without this constraint. F-007 adds it now.
--
-- Logical form:
--   (audienceUserId IS NULL) <> (audienceWorkerId IS NULL)
-- Reading: "one of them is NULL XOR the other is NULL" — i.e. exactly one is
-- NULL, exactly one is non-NULL.
--
-- The guard is conditional via DO blocks so the migration is idempotent — if
-- the constraint was added out-of-band (or by a future migration that lands
-- earlier on a different branch), we skip re-adding it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Notification_audience_mutex'
      AND conrelid = '"axhy"."Notification"'::regclass
  ) THEN
    ALTER TABLE "axhy"."Notification"
      ADD CONSTRAINT "Notification_audience_mutex"
      CHECK (("audienceUserId" IS NULL) <> ("audienceWorkerId" IS NULL));
  END IF;
END $$;
