-- F-003 round-2 — partial unique index for BINDING_ENDED_AUTO dedup
--
-- Locked 2026-05-16 after friend's F-003 round-1 review finding P1:
-- The original app-level audit-existence check (findFirst inside the
-- per-row tx, then create) is race-prone under concurrent dispatcher
-- replicas. Two replicas can both findFirst → "no audit yet" → both
-- create → duplicate BINDING_ENDED_AUTO rows.
--
-- This migration moves the dedup guarantee from app code to the DB:
--   * partial unique index on (companyId, kind, targetId) WHERE
--     kind = 'BINDING_ENDED_AUTO' AND targetId IS NOT NULL.
--   * narrow predicate — does not constrain other audit kinds; other
--     audit emits (DWI_PROPOSED, DWI_APPLIED, BINDING_CREATED, etc.)
--     remain duplicate-allowed where their semantics call for it.
--
-- Combined with the app-side catch of P2002 (Prisma unique-constraint
-- violation error code), this gives exactly-once audit emission per
-- binding under any number of concurrent replicas.
--
-- @derives(F-003 scope artifact §4 pick 7, revised 2026-05-16 round-2)
-- @derives(workflow-design-closure §10 2026-05-16 update)
-- @derives(rule 26 — inspect existing repo patterns; partial unique
--   index + ON CONFLICT is the standard Postgres pattern for this race)

CREATE UNIQUE INDEX IF NOT EXISTS "AuditEvent_binding_ended_auto_dedup"
  ON "axhy"."AuditEvent" ("companyId", "kind", "targetId")
  WHERE "kind" = 'BINDING_ENDED_AUTO' AND "targetId" IS NOT NULL;
