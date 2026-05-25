-- ADR-0025: Move payroll fields from Worker to Membership.
--
-- Reversible: see down-migration SQL at the bottom of this file (commented).
-- Safe to run on Railway prod given current scale (~6 worker rows in QA Test Co,
-- no other tenant rows). Lock duration expected <50ms total.

-- Step 1: Add new columns to Membership with defaults matching current Worker defaults.
ALTER TABLE "axhy"."Membership"
  ADD COLUMN "baseSalaryPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bankIfsc" VARCHAR(16),
  ADD COLUMN "bankAcct" TEXT;

-- Step 2: Backfill from Worker to matching Membership rows (where role=WORKER).
UPDATE "axhy"."Membership" m
SET
  "baseSalaryPaise" = w."baseSalaryPaise",
  "bankIfsc"        = w."bankIfsc",
  "bankAcct"        = w."bankAcct"
FROM "axhy"."Worker" w
WHERE
  m."userId" = w."userId"
  AND m."companyId" = w."companyId"
  AND m."role" = 'WORKER'
  AND w."userId" IS NOT NULL;

-- Step 3: Verify backfill — count must match Workers with userId set.
DO $$
DECLARE
  worker_count INT;
  membership_count INT;
BEGIN
  SELECT COUNT(*) INTO worker_count
    FROM "axhy"."Worker"
    WHERE "userId" IS NOT NULL;
  SELECT COUNT(*) INTO membership_count
    FROM "axhy"."Membership" m
    INNER JOIN "axhy"."Worker" w
      ON m."userId" = w."userId"
     AND m."companyId" = w."companyId"
    WHERE m."role" = 'WORKER'
      AND m."baseSalaryPaise" = w."baseSalaryPaise";
  IF worker_count <> membership_count THEN
    RAISE EXCEPTION 'Backfill mismatch: % workers vs % memberships with salary copied', worker_count, membership_count;
  END IF;
END $$;

-- Step 4: Drop the columns from Worker.
ALTER TABLE "axhy"."Worker"
  DROP COLUMN "baseSalaryPaise",
  DROP COLUMN "bankIfsc",
  DROP COLUMN "bankAcct";

-- =============================================================================
-- DOWN MIGRATION (manual — uncomment + run only with founder approval):
--
-- ALTER TABLE "axhy"."Worker"
--   ADD COLUMN "baseSalaryPaise" INTEGER NOT NULL DEFAULT 0,
--   ADD COLUMN "bankIfsc" VARCHAR(16),
--   ADD COLUMN "bankAcct" TEXT;
--
-- UPDATE "axhy"."Worker" w
-- SET
--   "baseSalaryPaise" = m."baseSalaryPaise",
--   "bankIfsc"        = m."bankIfsc",
--   "bankAcct"        = m."bankAcct"
-- FROM "axhy"."Membership" m
-- WHERE m."userId" = w."userId"
--   AND m."companyId" = w."companyId"
--   AND m."role" = 'WORKER';
--
-- ALTER TABLE "axhy"."Membership"
--   DROP COLUMN "baseSalaryPaise",
--   DROP COLUMN "bankIfsc",
--   DROP COLUMN "bankAcct";
