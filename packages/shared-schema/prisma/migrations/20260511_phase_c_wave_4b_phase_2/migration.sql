-- Wave 4b Phase 2 — LivingDoc moat + 3-tier cache + cost observability
-- Spec anchor: axhy-v3/docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md §3.5, §6, §8
-- @derives(spec-2 §3.5, §6, §8) @derives(ADR-0023)
--
-- Pre-flight verified: SupervisorDailyContext row count = 0 (greenfield;
-- zero data loss from column drops). Table renamed + restructured + new
-- ChatMessage.cacheTokens column + ai_cost_daily Postgres view, all
-- atomic in this single migration apply.
--
-- Rollback:
--   DROP VIEW "axhy"."ai_cost_daily";
--   ALTER TABLE "axhy"."ChatMessage" DROP COLUMN "cacheTokens";
--   DROP INDEX "axhy"."LivingDoc_companyId_supervisorId_key";
--   ALTER TABLE "axhy"."LivingDoc" DROP COLUMN "siteRules", "workerNotes",
--     "clientPreferences", "recurringTasks", "freeNotes", "version",
--     "lastArchivedAt", "archivedSnapshot";
--   ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "snapshot" JSONB DEFAULT '{}',
--     "chatHistory" JSONB DEFAULT '[]', "loadedAt" TIMESTAMP(3),
--     "date" DATE;
--   ALTER TABLE "axhy"."LivingDoc" RENAME TO "SupervisorDailyContext";
--   CREATE UNIQUE INDEX "SupervisorDailyContext_supervisorId_date_key"
--     ON "axhy"."SupervisorDailyContext"("supervisorId", "date");
--   CREATE INDEX "SupervisorDailyContext_companyId_idx"
--     ON "axhy"."SupervisorDailyContext"("companyId");
--   CREATE INDEX "SupervisorDailyContext_companyId_date_idx"
--     ON "axhy"."SupervisorDailyContext"("companyId", "date");

-- Section 1a: drop ALL existing indexes on SupervisorDailyContext before rename
-- (3 indexes from schema.prisma:704-706: 1 unique + 2 standard).
DROP INDEX "axhy"."SupervisorDailyContext_supervisorId_date_key";
DROP INDEX "axhy"."SupervisorDailyContext_companyId_idx";
DROP INDEX "axhy"."SupervisorDailyContext_companyId_date_idx";

-- Section 1b: rename table + drop columns no longer in spec
ALTER TABLE "axhy"."SupervisorDailyContext" RENAME TO "LivingDoc";
ALTER TABLE "axhy"."LivingDoc" DROP COLUMN "snapshot";
ALTER TABLE "axhy"."LivingDoc" DROP COLUMN "chatHistory";
ALTER TABLE "axhy"."LivingDoc" DROP COLUMN "loadedAt";
ALTER TABLE "axhy"."LivingDoc" DROP COLUMN "date";

-- Section 1c: add 5-section structure + version + archive cols per Spec 2 §3.5
ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "siteRules" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "workerNotes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "clientPreferences" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "recurringTasks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "freeNotes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "lastArchivedAt" TIMESTAMP(3);
ALTER TABLE "axhy"."LivingDoc" ADD COLUMN "archivedSnapshot" JSONB;

-- Section 1d: new unique constraint (companyId+supervisorId; no longer date-scoped).
-- One LivingDoc per (tenant × supervisor); rules accumulate over time, not per-day.
CREATE UNIQUE INDEX "LivingDoc_companyId_supervisorId_key"
  ON "axhy"."LivingDoc"("companyId", "supervisorId");

-- Section 2: ChatMessage.cacheTokens for cache-hit observability (Spec 2 §8.3)
-- OpenAI returns usage.prompt_tokens_details.cached_tokens; persist for view query.
ALTER TABLE "axhy"."ChatMessage" ADD COLUMN "cacheTokens" INTEGER;

-- Section 3: ai_cost_daily view (Spec 2 §8.3 cost dashboard query)
-- Per-tenant + per-supervisor + per-day aggregation. Joined to ChatThread
-- to recover supervisorId since ChatMessage doesn't carry it directly.
-- Standard view (not materialized) — Phase 2 message volume is small;
-- materialized view considered if/when the table grows.
CREATE VIEW "axhy"."ai_cost_daily" AS
SELECT
  cm."companyId",
  ct."supervisorId",
  DATE_TRUNC('day', cm."createdAt") AS day,
  cm."modelUsed",
  SUM(cm."costInr")::numeric(12, 4) AS cost_inr,
  SUM(COALESCE(cm."cacheTokens", 0)) AS cached_tokens,
  COUNT(*) AS message_count
FROM "axhy"."ChatMessage" cm
JOIN "axhy"."ChatThread" ct ON ct.id = cm."threadId"
WHERE cm."costInr" IS NOT NULL
GROUP BY 1, 2, 3, 4;
