-- P1.5 — SiteSupervisorBinding (single table for ACTING + PERMANENT bindings)
--
-- Source of truth: supervisor responsibility model §7 Option A + §5.8 invariant.
-- Closure spec §4 + §3.1 + §3.7 HandoffPackage. Locked picks 1-9 (esp. 5+6).
--
-- This migration ships the table only. It does NOT include:
--   * Bootstrap-seed step from pick 8 (lands with HR portal slice).
--   * HandoffPackage composer logic (column is added nullable; composer is a later slice).
--   * Cron `binding-expire-sweep` (kickoff Stream F).
--   * Read-time routing rewires to DWI / Today / Decisions queries.
--   * Any HR portal / admin-web UI work.
--
-- createdBy is intentionally a plain UUID with no FK to User. Audit-trail
-- durability requires this row to survive the User row being deleted.
-- Follows the existing Attendance.markedBySupervisorId / AuditEvent.actorId
-- convention in this schema.

-- ---------------------------------------------------------------------------
-- Extension: btree_gist is required for the EXCLUDE USING gist no-overlap
-- constraint below. Combines btree-equality (on siteId + kind discriminator)
-- with gist-range overlap (on tstzrange of effective window) in one index.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Table + columns + per-row CHECK
-- ---------------------------------------------------------------------------

CREATE TABLE "axhy"."SiteSupervisorBinding" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "actingForUserId" UUID,
    "effectiveFrom" TIMESTAMPTZ(6) NOT NULL,
    "effectiveUntil" TIMESTAMPTZ(6),
    "reason" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(6),
    "endedReason" TEXT,
    "handoffPackage" JSONB,

    CONSTRAINT "SiteSupervisorBinding_pkey" PRIMARY KEY ("id"),

    -- effectiveUntil semantics:
    --   * Acting (actingForUserId IS NOT NULL): effectiveUntil REQUIRED.
    --   * Permanent (actingForUserId IS NULL): effectiveUntil OPTIONAL —
    --     NULL = open-ended; non-NULL = future-dated planned switch.
    -- endedAt is reserved for manual early termination / supersession /
    -- correction — distinct from a planned future end (which uses effectiveUntil).
    CONSTRAINT "SiteSupervisorBinding_acting_requires_until_chk"
      CHECK ("actingForUserId" IS NULL OR "effectiveUntil" IS NOT NULL),

    -- A binding cannot end before it begins (sanity).
    CONSTRAINT "SiteSupervisorBinding_until_after_from_chk"
      CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom"),

    -- Acting bindings reference a different supervisor than the actor
    -- (cannot "act for yourself"); permanent rows have actingForUserId IS NULL.
    CONSTRAINT "SiteSupervisorBinding_no_self_acting_chk"
      CHECK ("actingForUserId" IS NULL OR "actingForUserId" <> "userId")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "SiteSupervisorBinding_companyId_idx"
  ON "axhy"."SiteSupervisorBinding"("companyId");

CREATE INDEX "SiteSupervisorBinding_siteId_effectiveFrom_idx"
  ON "axhy"."SiteSupervisorBinding"("siteId", "effectiveFrom" DESC);

CREATE INDEX "SiteSupervisorBinding_userId_idx"
  ON "axhy"."SiteSupervisorBinding"("userId");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- (createdBy intentionally has NO FK — see header note + Attendance precedent)
-- ---------------------------------------------------------------------------

ALTER TABLE "axhy"."SiteSupervisorBinding"
  ADD CONSTRAINT "SiteSupervisorBinding_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "axhy"."SiteSupervisorBinding"
  ADD CONSTRAINT "SiteSupervisorBinding_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "axhy"."Site"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "axhy"."SiteSupervisorBinding"
  ADD CONSTRAINT "SiteSupervisorBinding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "axhy"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "axhy"."SiteSupervisorBinding"
  ADD CONSTRAINT "SiteSupervisorBinding_actingForUserId_fkey"
  FOREIGN KEY ("actingForUserId") REFERENCES "axhy"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- No-overlap invariant (responsibility model §5.8 hard rule)
--
-- "At most one ACTIVE binding of each kind per site at any moment."
-- "Kind" = ACTING (actingForUserId IS NOT NULL) vs PERMANENT
-- (actingForUserId IS NULL). The two kinds may legitimately stack — that is
-- the override case (sick-leave acting-coverage over baseline portfolio).
-- Two bindings of the SAME kind covering the same (siteId, time-window) are
-- forbidden.
--
-- "Active" = endedAt IS NULL. Once a binding is manually ended, supersededed,
-- or corrected, its endedAt is set and it stops constraining new bindings.
--
-- Implementation:
--   * btree_gist makes (siteId, kind) usable as btree-equality keys inside
--     a gist index.
--   * (CASE WHEN "actingForUserId" IS NULL THEN 'PERMANENT' ELSE 'ACTING' END)
--     is an immutable expression — depends only on column values, no time/locale.
--   * tstzrange(effectiveFrom, COALESCE(effectiveUntil, 'infinity'), '[)') is the
--     row's effective window. Open-ended permanent rows extend to +infinity.
--   * `WITH &&` is gist's range-overlap operator. Two rows match the EXCLUDE
--     constraint iff their (siteId, kind) tuples are equal AND their time
--     ranges overlap.
--   * `WHERE ("endedAt" IS NULL)` is the partial-index predicate: rows with
--     endedAt set are not enforced (they are historical / corrected).
-- ---------------------------------------------------------------------------

ALTER TABLE "axhy"."SiteSupervisorBinding"
  ADD CONSTRAINT "SiteSupervisorBinding_no_overlap_active_excl"
  EXCLUDE USING gist (
    "siteId" WITH =,
    (CASE WHEN "actingForUserId" IS NULL THEN 'PERMANENT' ELSE 'ACTING' END) WITH =,
    tstzrange("effectiveFrom", COALESCE("effectiveUntil", 'infinity'::timestamptz), '[)') WITH &&
  )
  WHERE ("endedAt" IS NULL);
