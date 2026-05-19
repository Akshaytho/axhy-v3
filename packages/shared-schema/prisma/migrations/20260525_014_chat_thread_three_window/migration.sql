-- Migration 014 — ChatThread three-window support
--
-- Removes the @@unique([companyId, supervisorId]) constraint that limited
-- each supervisor to ONE chat thread, and replaces it with a partial unique
-- index that allows up to N (enforced app-side at 3) ACTIVE threads
-- (archivedAt IS NULL) per supervisor.
--
-- Per docs/locked/security-gaps-to-fix.md GAP 8 (BLOCKER) — supervisors need
-- up to 3 active threads to separate concerns across clients/days; the
-- current single-thread constraint blocks the locked-doc UX.
--
-- archivedAt already exists on ChatThread (added in an earlier migration —
-- see prisma/schema.prisma line 339). This migration just changes the
-- constraint shape so multiple non-archived threads can coexist.
--
-- App-layer enforcement of the count cap (max 3 ACTIVE per supervisor)
-- lives in apps/backend/src/lib/chat-thread-service.ts (added in the same
-- PR as this migration). The count cap is NOT enforced at the DB level
-- because the realistic concurrency (a single supervisor double-tapping
-- "New thread") is small enough that a serializable transaction +
-- SELECT-then-INSERT is the right shape. A partial-unique-with-count
-- approach would require a generated column or a trigger, both of which
-- buy nothing over the simpler serializable lock.
--
-- Rollback:
--   DROP INDEX IF EXISTS "axhy"."ChatThread_companyId_supervisorId_active_idx";
--   ALTER TABLE "axhy"."ChatThread" ADD CONSTRAINT
--     "ChatThread_companyId_supervisorId_key"
--     UNIQUE ("companyId", "supervisorId");
--
-- @derives(docs/locked/security-gaps-to-fix.md GAP 8)
-- @derives(docs/locked/chat-sidebar-context-flow.md — sidebar UX needs
--   distinct threads for distinct contexts)
-- @derives(plans/abstract-wandering-kazoo.md Phase 1)

-- 1. Drop the single-thread unique constraint.
ALTER TABLE "axhy"."ChatThread"
  DROP CONSTRAINT IF EXISTS "ChatThread_companyId_supervisorId_key";

-- 2. Add a partial index that scopes lookups + dedup checks to ACTIVE rows
--    (archivedAt IS NULL). The composite is NOT unique — multiple active
--    threads per (companyId, supervisorId) is the whole point of this
--    migration. The index just keeps "find this supervisor's active
--    threads" cheap (single ms scan at 100-supervisor scale).
CREATE INDEX IF NOT EXISTS
  "ChatThread_companyId_supervisorId_active_idx"
  ON "axhy"."ChatThread" ("companyId", "supervisorId")
  WHERE "archivedAt" IS NULL;

-- 3. Keep a separate index for the "all threads (including archived) for
--    this supervisor" lookup the thread-switcher UI needs. archivedAt
--    DESC NULLS FIRST orders active threads above archived in the list.
CREATE INDEX IF NOT EXISTS
  "ChatThread_companyId_supervisorId_archivedAt_idx"
  ON "axhy"."ChatThread" ("companyId", "supervisorId", "archivedAt" DESC NULLS FIRST);
