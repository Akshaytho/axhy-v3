-- Migration 030 — #36 (Site.workdays default) + #38 (Membership roster index).
--
-- #36: Site.workdays is a 7-char day-mask (@db.VarChar(7); admin-sites validator
-- /^[MTWFSU_]{7}$/), but the DB default was the 6-char 'MTWTFS', violating its own
-- contract. The only writer (admin-site-service.ts) already inserts the compliant
-- 7-char 'MTWTFS_' (Mon–Sat on, Sun off), so no production row SHOULD hold the bad
-- value — but fix the default and backfill any 6-char rows (raw insert / seed) to be safe.
--
-- #38: the worker-roster keyset page filters (companyId, role='WORKER') and sorts
-- (createdAt desc, id desc). No existing Membership index covers that, so Postgres
-- scans the companyId index then sorts in memory each page. Add a covering index.
--
-- PROD NOTE: Membership grows over time. On a SMALL table (pre-launch) the plain
-- CREATE INDEX below builds instantly. If the prod table is already LARGE, build it
-- without a long write-lock instead (run OUTSIDE a transaction, then skip the CREATE):
--   CREATE INDEX CONCURRENTLY "Membership_companyId_role_createdAt_id_idx"
--     ON "axhy"."Membership" ("companyId", "role", "createdAt", "id");
--
-- Verification:
--   SELECT "workdays" FROM "axhy"."Site" WHERE "workdays" = 'MTWTFS';  -- expect 0 rows
--   SELECT indexname FROM pg_indexes WHERE schemaname='axhy' AND tablename='Membership'
--     AND indexname='Membership_companyId_role_createdAt_id_idx';
--
-- Rollback:
--   DROP INDEX IF EXISTS "axhy"."Membership_companyId_role_createdAt_id_idx";
--   ALTER TABLE "axhy"."Site" ALTER COLUMN "workdays" SET DEFAULT 'MTWTFS';
--
-- @derives(PRODUCTION_BUG_LEDGER.md #36, #38)

-- #36
ALTER TABLE "axhy"."Site" ALTER COLUMN "workdays" SET DEFAULT 'MTWTFS_';
UPDATE "axhy"."Site" SET "workdays" = 'MTWTFS_' WHERE "workdays" = 'MTWTFS';

-- #38
CREATE INDEX IF NOT EXISTS "Membership_companyId_role_createdAt_id_idx"
  ON "axhy"."Membership" ("companyId", "role", "createdAt", "id");
