-- Migration 017 — Row-Level Security + cascade-delete FK on axhy_chat.turn_embeddings.
--
-- Phase 2 of Wave A.3 vector-RAG. Deferred from Phase 1 migration 016 per
-- spec §3.3 + §16.
--
-- Spec: docs/locked/vector-rag-context-assembly.md §3.3 + §16
-- Plan: docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md (Phase 2 ride-along)
--
-- Verification (run before + after on Railway):
--   SELECT relrowsecurity FROM pg_class WHERE relname='turn_embeddings' AND relnamespace = 'axhy_chat'::regnamespace;
--   SELECT polname FROM pg_policy WHERE polrelid = 'axhy_chat.turn_embeddings'::regclass;
--   SELECT conname, confdeltype FROM pg_constraint WHERE conrelid = 'axhy_chat.turn_embeddings'::regclass AND contype='f';
--
-- Before: RLS off; no FK to Company.
-- After: RLS on; one policy (tenant_isolation); one FK with ON DELETE CASCADE.
--
-- Rollback:
--   ALTER TABLE "axhy_chat"."turn_embeddings" DROP CONSTRAINT IF EXISTS fk_turn_embeddings_company;
--   DROP POLICY IF EXISTS tenant_isolation ON "axhy_chat"."turn_embeddings";
--   ALTER TABLE "axhy_chat"."turn_embeddings" DISABLE ROW LEVEL SECURITY;
--
-- @derives(docs/locked/vector-rag-context-assembly.md §3.3 + §16)

-- 1. Add cascade-delete FK to Company (for DPDP erasure when a company is deleted)
ALTER TABLE "axhy_chat"."turn_embeddings"
  ADD CONSTRAINT "fk_turn_embeddings_company"
  FOREIGN KEY ("company_id") REFERENCES "axhy"."Company"("id")
  ON DELETE CASCADE;

-- 2. Enable Row-Level Security
ALTER TABLE "axhy_chat"."turn_embeddings" ENABLE ROW LEVEL SECURITY;

-- 3. Tenant-isolation policy — matches the existing withTenantContext GUC pattern
--    used by chat.ts (uses Postgres GUC current_setting('axhy.current_company_id')).
CREATE POLICY "tenant_isolation" ON "axhy_chat"."turn_embeddings"
  USING ("company_id"::text = current_setting('axhy.current_company_id', true));
