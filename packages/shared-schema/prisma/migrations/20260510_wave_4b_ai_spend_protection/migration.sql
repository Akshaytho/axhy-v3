-- Wave 4b Phase 1 — Per-tenant daily AI cost protection
-- Spec anchor: axhy-v3/docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md §9
-- @derives(spec-2 §9.1, §9.4) @derives(ADR-0023) @derives(ADR-0009)
--
-- Section 1: Company.aiSpendDailyInr — daily AI spend counter, reset at UTC midnight
--   • Decimal(12, 4) matches existing money convention (ChatMessage.costInr)
--   • NOT NULL DEFAULT 0 → existing rows are valid immediately
--   • No PII annotation — financial counter, not personal data (Vinod DPDP scoping)
--
-- Section 2: Outbox.idempotencyKey — at-most-once enqueue dedup
--   • Nullable; existing rows coexist freely (NULL allowed)
--   • UNIQUE(companyId, idempotencyKey) — Postgres treats NULLs as distinct by default,
--     so multiple rows with NULL key are allowed; only non-NULL keys are deduped per tenant.
--   • Used by dispatchBudgetAlert: key shape is "${companyId}:budget_${kind}:YYYYMMDD"
--
-- Rollback:
--   ALTER TABLE "axhy"."Outbox" DROP CONSTRAINT "Outbox_companyId_idempotencyKey_key";
--   ALTER TABLE "axhy"."Outbox" DROP COLUMN "idempotencyKey";
--   ALTER TABLE "axhy"."Company" DROP COLUMN "aiSpendDailyInr";

-- Section 1: Company.aiSpendDailyInr
ALTER TABLE "axhy"."Company"
  ADD COLUMN "aiSpendDailyInr" DECIMAL(12, 4) NOT NULL DEFAULT 0;

-- Section 2: Outbox.idempotencyKey + unique constraint
ALTER TABLE "axhy"."Outbox"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Outbox_companyId_idempotencyKey_key"
  ON "axhy"."Outbox"("companyId", "idempotencyKey");
