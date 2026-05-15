-- F-002 — Chat extractor writes PROPOSED SupervisorDecision rows.
-- This migration adds the DISMISSED side of the lifecycle: the responsible
-- supervisor (via F-001 binding routing) can explicitly reject a PROPOSED
-- decision rather than apply it. Discriminator stays as the pair
-- (appliedAt, dismissedAt); full state ENUM column deferred per scope Q4=(b).
--
-- Source of truth: F-002 scope artifact at handoff/feature-queue/scopes/F-002.md
-- (approved 2026-05-15 evening with all 5 default picks).
--
-- @derives(F-002 scope §3c, §7-Q3, §7-Q4)
-- @derives(workflow-design-closure §3.2 — SupervisorDecision lifecycle PROPOSED → APPLIED/DISMISSED)
--
-- This migration adds:
--   * SupervisorDecision.dismissedAt        TIMESTAMP nullable
--   * SupervisorDecision.dismissedReason    TEXT nullable
--   * Index (companyId, dismissedAt) for queue projections + dismissed-row scans
--
-- NOT in this migration (intentional):
--   * state ENUM column. Q4=(b) defer; appliedAt + dismissedAt is enough today.
--   * SUPERVISOR_DECISION_PROPOSED / APPLIED / DISMISSED kinds — AuditEvent.kind
--     is a free String column (no DB enum). The 3 new kinds + typed helpers land
--     in the app layer.
--   * Backfill for existing rows. None needed — every existing row stays in its
--     current state (appliedAt null/set, dismissedAt always null).
--
-- Backwards-compatibility:
--   * Both new columns are nullable; existing rows + queries unaffected.
--   * The PROPOSED predicate (used by F-001's GET /decisions/proposed-for-me)
--     remains `appliedAt IS NULL`; F-002 will tighten it to
--     `appliedAt IS NULL AND dismissedAt IS NULL`.

-- =============================================================================
-- SupervisorDecision: dismiss columns
-- =============================================================================

ALTER TABLE "axhy"."SupervisorDecision"
    ADD COLUMN "dismissedAt" TIMESTAMP(3),
    ADD COLUMN "dismissedReason" TEXT;

-- Index supports:
--   * "show me decisions I dismissed in the last N days" queue projections
--   * dismissed-row scans for the Activity tab + audit reconstruction
CREATE INDEX "SupervisorDecision_companyId_dismissedAt_idx"
    ON "axhy"."SupervisorDecision" ("companyId", "dismissedAt");
