-- Migration 013 — IdempotencyKey table (Cluster F follow-up)
--
-- Sprint 1 deep-review Cluster F fix (2026-05-18). The codebase had
-- per-route idempotency baked into the chat surface (`ChatRequestLog`,
-- migration ~2026-04-30) but no generic mechanism for the other
-- state-changing routes. A supervisor on Slow 3G double-tapping
-- `POST /supervisor/replacement-invites` creates TWO invite rows;
-- double-tapping `POST /complaints/:id/messages` creates TWO threaded
-- replies. The founder explicitly flagged Slow 3G as a 30-day-sim
-- walkthrough condition, so this is a P1 user-facing concern, not a
-- nice-to-have.
--
-- Mirrors the `ChatRequestLog` pattern (composite PK on (companyId,
-- routeKey, idempotencyKey), cached response, expiresAt sweep) — the
-- only delta is the addition of `routeKey` so one table serves all
-- HTTP routes that opt in.
--
-- TTL is 10 minutes: short enough to avoid storing duplicate-tap caches
-- forever, long enough that a flaky-network retry within the realistic
-- bound returns the cached response.
--
-- Rollback:
--   DROP TABLE "axhy"."IdempotencyKey";
--
-- @derives(2026-05-18-sprint-1-deep-review.md Cluster F)
-- @derives(master-plan §G — supervisor surface)
-- @derives(feedback_production_grade_workflow_rules.md — P8 retries/double-taps)

CREATE TABLE IF NOT EXISTS "axhy"."IdempotencyKey" (
  "companyId"      UUID      NOT NULL,
  --e.g. "POST:/supervisor/replacement-invites"
  "routeKey"       TEXT      NOT NULL,
  --Client-supplied UUID from the Idempotency-Key header.
  "idempotencyKey" TEXT      NOT NULL,
  --HTTP status code of the cached response.
  "responseStatus" INTEGER   NOT NULL,
  --Full JSON response body the client saw on the first call.
  "responseJson"   JSONB     NOT NULL,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  --createdAt + 10 minutes.
  "expiresAt"      TIMESTAMP NOT NULL,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("companyId", "routeKey", "idempotencyKey")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'IdempotencyKey_companyId_fkey'
  ) THEN
    ALTER TABLE "axhy"."IdempotencyKey"
      ADD CONSTRAINT "IdempotencyKey_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "axhy"."Company" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Sweep index — `WHERE expiresAt < NOW()` for the periodic cleanup job.
CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx"
  ON "axhy"."IdempotencyKey" ("expiresAt");
