-- Migration 028 — ledger #14: idempotent VisitPhoto inserts.
--
-- worker-submit writes VisitPhoto rows via createMany. r2Key = buildObjectKey(workerId,
-- visitId, photo), so it already embeds visitId. Without a unique constraint, a submit that
-- slips past the visit state-claim (the only thing masking it today) would insert duplicate
-- evidence rows. Add UNIQUE (visitId, r2Key); the service now uses skipDuplicates
-- (ON CONFLICT DO NOTHING) so a retry is a no-op instead of a duplicate.
--
-- PRECONDITION: assumes no pre-existing duplicate (visitId, r2Key) rows. The state-claim has
-- masked duplicate submits, so a clean table is expected. If prod has duplicates, this index
-- creation will FAIL LOUDLY (rather than silently corrupt) — that indicates the masking
-- failed and the founder should investigate/de-dup the evidence rows deliberately (NOT
-- auto-deleted here, since VisitPhoto rows are visit evidence).
--
-- Verification:
--   SELECT indexname FROM pg_indexes WHERE schemaname='axhy' AND tablename='VisitPhoto'
--     AND indexname='VisitPhoto_visitId_r2Key_key';
--
-- Rollback:
--   DROP INDEX IF EXISTS "axhy"."VisitPhoto_visitId_r2Key_key";
--
-- @derives(PRODUCTION_BUG_LEDGER.md #14)

-- Matches Prisma's @@unique([visitId, r2Key]) index naming.
CREATE UNIQUE INDEX "VisitPhoto_visitId_r2Key_key"
  ON "axhy"."VisitPhoto" ("visitId", "r2Key");
