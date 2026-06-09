-- Migration 029 — #26: dedup SYSTEM AuditEvent writes.
--
-- Owner budget alerts (OWNER_BUDGET_ALERT_DISPATCHED) and the daily AI-spend reset
-- (AI_SPEND_DAILY_RESET) had no dedup, so outbox redelivery / a multi-replica reset could
-- write duplicate AuditEvent rows — corrupting the immutable audit trail. Add a nullable
-- dedupKey + UNIQUE (companyId, dedupKey); the two system writers now set a deterministic
-- key (owner_budget:<dateUtc>:<topic>, ai_spend_reset:<dateUtc>) and createMany with
-- skipDuplicates (ON CONFLICT DO NOTHING). Every human-action audit leaves dedupKey NULL
-- (NULLs are distinct), so they are never constrained and existing rows are untouched.
--
-- PROD NOTE: AuditEvent grows over time. On a SMALL table (pre-launch) the plain unique
-- index below builds instantly. If the prod table is already LARGE, build it without a long
-- write-lock instead:
--   CREATE UNIQUE INDEX CONCURRENTLY "AuditEvent_companyId_dedupKey_key"
--     ON "axhy"."AuditEvent" ("companyId", "dedupKey");
-- (run outside a transaction; then skip the CREATE below).
--
-- Verification:
--   SELECT indexname FROM pg_indexes WHERE schemaname='axhy' AND tablename='AuditEvent'
--     AND indexname='AuditEvent_companyId_dedupKey_key';
--
-- Rollback:
--   DROP INDEX IF EXISTS "axhy"."AuditEvent_companyId_dedupKey_key";
--   ALTER TABLE "axhy"."AuditEvent" DROP COLUMN IF EXISTS "dedupKey";
--
-- @derives(PRODUCTION_BUG_LEDGER.md #26)

ALTER TABLE "axhy"."AuditEvent" ADD COLUMN IF NOT EXISTS "dedupKey" TEXT;

CREATE UNIQUE INDEX "AuditEvent_companyId_dedupKey_key"
  ON "axhy"."AuditEvent" ("companyId", "dedupKey");
