-- Wave 4b Phase 2.5 cleanup — drop never-populated LivingDoc columns
-- @derives(spec-2 §3.5) @derives(ADR-0023)
-- @derives(feedback_no_premature_schema_slots) — drop columns whose
-- writer was never coded; Phase 2c diffing feature is unscheduled.
--
-- Pre-flight: archivedSnapshot + lastArchivedAt are 100% NULL across
-- all rows (verified pre-apply). No data loss.
--
-- Rollback (if Phase 2c ever ships):
--   ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "lastArchivedAt" TIMESTAMP(3);
--   ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "archivedSnapshot" JSONB;
--
-- SAFE: columns are 100% NULL (verified); no writer code exists; drop
-- is reversible via additive ADD COLUMN if Phase 2c is scheduled.

ALTER TABLE "axhy"."LivingDoc" DROP COLUMN "archivedSnapshot";
ALTER TABLE "axhy"."LivingDoc" DROP COLUMN "lastArchivedAt";
