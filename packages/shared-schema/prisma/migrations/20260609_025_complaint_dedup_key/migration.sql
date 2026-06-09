-- Migration 025 — H6: idempotent chat complaint creation.
--
-- Adds a nullable Complaint.dedupKey + a unique index on (companyId, dedupKey) so a
-- retried/replayed chat `log_complaint` turn cannot create a duplicate Complaint. The
-- service pre-checks by dedupKey before INSERT (do NOT catch P2002 inside the interactive
-- tx — a constraint violation aborts the tx, so the pre-check is the idempotency path and
-- this index is only the integrity backstop).
--
-- dedupKey is NULL for button/form complaints; Postgres treats NULLs as DISTINCT in a
-- unique index, so those rows (and all existing rows) are never constrained.
--
-- Verification:
--   SELECT 1 FROM information_schema.columns
--     WHERE table_schema='axhy' AND table_name='Complaint' AND column_name='dedupKey';
--   SELECT indexname FROM pg_indexes
--     WHERE schemaname='axhy' AND tablename='Complaint' AND indexdef ILIKE '%dedupKey%';
--
-- Rollback:
--   DROP INDEX IF EXISTS "axhy"."Complaint_companyId_dedupKey_key";
--   ALTER TABLE "axhy"."Complaint" DROP COLUMN IF EXISTS "dedupKey";
--
-- @derives(PRODUCTION_BUG_LEDGER.md H6)

ALTER TABLE "axhy"."Complaint" ADD COLUMN "dedupKey" TEXT;

-- Matches Prisma's @@unique([companyId, dedupKey]) naming convention.
CREATE UNIQUE INDEX "Complaint_companyId_dedupKey_key"
  ON "axhy"."Complaint" ("companyId", "dedupKey");
