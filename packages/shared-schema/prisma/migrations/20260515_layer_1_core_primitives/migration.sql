-- Layer 1 core primitives — workflow-design-closure (Active 2026-05-15) §3 + §4.
-- @derives(workflow-design-closure §3 — six core primitives + §3.7 HandoffPackage)
-- @derives(workflow-design-closure §4 — HR pod model)
-- @derives(workflow-design-closure §5 — persona surfaces; surfaces themselves ship later layers)
-- @derives(kickoff-memo §3 — 8 migrations sequenced; this is the single-PR fold for PR 1)
--
-- Adds:
--   * HRPod table + Membership.podId (FK)
--   * Policy table (per-tenant key-value config, append-only)
--   * Notification table (formalises outbox-driven delivery tracking)
--   * Digest table (auto-composed multi-event rollups)
--   * SupervisorDecision additions: originContext (JSONB nullable) + proposedDuringAbsence (BOOLEAN default false)
--   * Worker.preferredLanguage (VARCHAR(8) default 'hi')
--   * QueueItem SQL VIEW (projection over PROPOSED SupervisorDecision + REQUESTED LeaveRequest)
--
-- NOT in this migration (intentional):
--   * SiteSupervisorBinding.handoffPackage — table not yet in schema; folds into the
--     P1.5 SiteSupervisorBinding migration when it lands (per kickoff memo §3 Migration G).
--   * Policy default-value seeds — PolicyService (Stream C, separate PR) loads defaults.
--   * AuditEvent kind enum extension — AuditEvent.kind is a free String column (no DB
--     enum); 15 new kinds catalogued in app-layer Zod (see packages/shared-schema/src/zod/audit-event.ts).
--
-- Backwards-compatibility:
--   * All additions are nullable or have safe defaults — existing rows + queries
--     are unaffected.
--   * Existing routes + tests should pass unchanged; no business logic in this migration.

-- =============================================================================
-- HRPod table
-- =============================================================================

CREATE TABLE "axhy"."HRPod" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "primaryOwnerUserId" UUID NOT NULL,
    "backupOwnerUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRPod_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "axhy"."HRPod" ADD CONSTRAINT "HRPod_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "HRPod_companyId_idx" ON "axhy"."HRPod"("companyId");
CREATE INDEX "HRPod_companyId_primaryOwnerUserId_idx" ON "axhy"."HRPod"("companyId", "primaryOwnerUserId");

-- =============================================================================
-- Membership.podId — FK to HRPod, NULL for non-HR memberships
-- =============================================================================

ALTER TABLE "axhy"."Membership" ADD COLUMN "podId" UUID;

ALTER TABLE "axhy"."Membership" ADD CONSTRAINT "Membership_podId_fkey"
    FOREIGN KEY ("podId") REFERENCES "axhy"."HRPod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Membership_companyId_podId_idx" ON "axhy"."Membership"("companyId", "podId");

-- =============================================================================
-- Policy table (per-tenant config; append-only; current value = most recent setAt)
-- =============================================================================

CREATE TABLE "axhy"."Policy" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "setBy" UUID NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousValueSnapshot" JSONB,
    "category" TEXT NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "axhy"."Policy" ADD CONSTRAINT "Policy_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Policy_companyId_key_setAt_idx" ON "axhy"."Policy"("companyId", "key", "setAt" DESC);
CREATE INDEX "Policy_companyId_category_idx" ON "axhy"."Policy"("companyId", "category");

-- =============================================================================
-- Notification table (delivery-tracked outbox formalisation)
-- =============================================================================

CREATE TABLE "axhy"."Notification" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "audienceUserId" UUID,
    "audienceWorkerId" UUID,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'STANDARD',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "ackedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "axhy"."Notification" ADD CONSTRAINT "Notification_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Notification_companyId_audienceUserId_deliveredAt_idx"
    ON "axhy"."Notification"("companyId", "audienceUserId", "deliveredAt" DESC);
CREATE INDEX "Notification_companyId_audienceWorkerId_deliveredAt_idx"
    ON "axhy"."Notification"("companyId", "audienceWorkerId", "deliveredAt" DESC);
CREATE INDEX "Notification_companyId_kind_idx" ON "axhy"."Notification"("companyId", "kind");
CREATE INDEX "Notification_companyId_scheduledAt_idx" ON "axhy"."Notification"("companyId", "scheduledAt");

-- =============================================================================
-- Digest table (auto-composed multi-event rollups)
-- =============================================================================

CREATE TABLE "axhy"."Digest" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "audienceUserId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "composedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" JSONB NOT NULL DEFAULT '{}',
    "bodyText" TEXT,
    "deliveryChannel" TEXT,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "axhy"."Digest" ADD CONSTRAINT "Digest_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Digest_companyId_audienceUserId_composedAt_idx"
    ON "axhy"."Digest"("companyId", "audienceUserId", "composedAt" DESC);
CREATE INDEX "Digest_companyId_kind_idx" ON "axhy"."Digest"("companyId", "kind");

-- =============================================================================
-- SupervisorDecision additions (DWI per closure spec; codebase still uses
-- SupervisorDecision name — rename refactor is out of scope for PR 1)
-- =============================================================================

ALTER TABLE "axhy"."SupervisorDecision" ADD COLUMN "originContext" JSONB;
ALTER TABLE "axhy"."SupervisorDecision" ADD COLUMN "proposedDuringAbsence" BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================================================
-- Worker.preferredLanguage (default 'hi')
-- =============================================================================

ALTER TABLE "axhy"."Worker" ADD COLUMN "preferredLanguage" VARCHAR(8) NOT NULL DEFAULT 'hi';

-- =============================================================================
-- QueueItem SQL VIEW — read-only projection over actionable rows
--
-- Layer 1 surface: projection only, no lock columns, no priority signal,
-- no escalation. Layer 2 will either materialise this into a physical table
-- (if pod-queue read latency demands it) or extend the VIEW with derived
-- columns. Per closure §3.3 + §8 + kickoff memo §3 Migration H.
-- =============================================================================

CREATE VIEW "axhy"."QueueItem" AS
SELECT
    'dwi'::TEXT                AS "sourceEntity",
    sd."id"::TEXT              AS "sourceId",
    sd."companyId"             AS "companyId",
    sd."supervisorId"          AS "audienceUserId",
    NULL::UUID                 AS "audiencePodId",
    'supervisor'::TEXT         AS "audienceRole",
    sd."tier"                  AS "kindHint",
    sd."createdAt"             AS "createdAt"
FROM "axhy"."SupervisorDecision" sd
WHERE sd."appliedAt" IS NULL
UNION ALL
SELECT
    'leave_request'::TEXT      AS "sourceEntity",
    lr."id"::TEXT              AS "sourceId",
    lr."companyId"             AS "companyId",
    NULL::UUID                 AS "audienceUserId",
    NULL::UUID                 AS "audiencePodId",
    'hr'::TEXT                 AS "audienceRole",
    lr."state"                 AS "kindHint",
    lr."createdAt"             AS "createdAt"
FROM "axhy"."LeaveRequest" lr
WHERE lr."state" = 'REQUESTED';

-- View has no FK / index; queries that need indexing can later add an
-- INDEX MATERIALIZED VIEW or materialise into a physical table per closure §3.3.
