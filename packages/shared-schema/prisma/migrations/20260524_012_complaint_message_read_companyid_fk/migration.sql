-- Migration 012 — ComplaintMessageRead companyId FK
--
-- Sprint 1 deep-review Cluster G fix (2026-05-18). Migration
-- 20260521_009_complaint_threading created `ComplaintMessageRead` with a
-- `companyId UUID NOT NULL` column but NO FK constraint to `Company`.
-- Every other tenant-scoped table in the codebase has the FK; the omission
-- was an oversight. RLS / withTenantContext still isolated correctly
-- without it, but defense-in-depth requires the DB-level cascade so a
-- Company hard-delete sweeps the read receipts too.
--
-- Adds the FK with ON DELETE CASCADE to match the Wave 3 sibling pattern
-- on `ComplaintMessage_companyId_fkey` (migration 009).
--
-- Rollback:
--   ALTER TABLE "axhy"."ComplaintMessageRead"
--     DROP CONSTRAINT "ComplaintMessageRead_companyId_fkey";
--
-- @derives(2026-05-18-sprint-1-deep-review.md Cluster G)
-- @derives(master-plan §L) — tenant isolation hygiene

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ComplaintMessageRead_companyId_fkey'
  ) THEN
    ALTER TABLE "axhy"."ComplaintMessageRead"
      ADD CONSTRAINT "ComplaintMessageRead_companyId_fkey"
      FOREIGN KEY ("companyId")
      REFERENCES "axhy"."Company" ("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
