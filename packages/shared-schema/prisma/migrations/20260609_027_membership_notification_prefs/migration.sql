-- Migration 027 — BLOCKER #3: add the missing Membership.notificationPrefs column.
--
-- schema.prisma declares `notificationPrefs Json @default("{}")` (NOT NULL) on Membership,
-- and the lab has it (via `prisma db push`), but NO migration ever added it. Prod is
-- migration-driven, so prod lacks the column and every GET /me + PATCH
-- /me/notification-prefs 500s (me.ts reads/writes it inside withTenantContext).
--
-- This reproduces the exact lab/schema shape: jsonb NOT NULL DEFAULT '{}'. The constant
-- default backfills existing rows (metadata-only, fast in PG 11+). IF NOT EXISTS makes it
-- a no-op on the lab (already present) and the real fix on prod (absent).
--
-- Verification:
--   SELECT data_type, is_nullable, column_default FROM information_schema.columns
--     WHERE table_schema='axhy' AND table_name='Membership' AND column_name='notificationPrefs';
--   -- => jsonb | NO | '{}'::jsonb
--
-- Rollback:
--   ALTER TABLE "axhy"."Membership" DROP COLUMN IF EXISTS "notificationPrefs";
--
-- @derives(PRODUCTION_BUG_LEDGER.md BLOCKER #3)

ALTER TABLE "axhy"."Membership"
  ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB NOT NULL DEFAULT '{}'::jsonb;
