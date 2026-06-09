-- Migration 026 — close ledger #37: make the QueueItem view honor RLS.
--
-- axhy.QueueItem (migration 20260515) is a UNION over SupervisorDecision (appliedAt IS
-- NULL) + LeaveRequest (state='REQUESTED'). Both tables are RLS-protected by migration 023,
-- but a Postgres view WITHOUT security_invoker runs with the VIEW OWNER's rights, so RLS on
-- the underlying tables is NOT applied to the querying role — i.e. as axhy_app the view would
-- leak cross-tenant rows. Setting security_invoker = true makes the view evaluate the
-- underlying tables with the CALLER's permissions, so the tenant_isolation policy (keyed on
-- axhy.current_company_id) applies through the view. PG 15+ (server is 17.4).
--
-- CREATE OR REPLACE keeps the exact same projection (columns/types/order) — only the
-- security_invoker option changes — so it is safe whether or not the view already exists.
--
-- Verification (as axhy_app, with set_config('axhy.current_company_id', <A>, true)):
--   SELECT count(*) FROM axhy."QueueItem";   -- returns only company A's actionable rows
--   -- with no GUC set: 0 rows (fail-closed via the underlying tables' RLS).
--
-- Rollback (restores the pre-fix RLS-bypassing behavior):
--   ALTER VIEW "axhy"."QueueItem" SET (security_invoker = false);
--
-- @derives(PRODUCTION_BUG_LEDGER.md #37)
-- @derives(packages/shared-schema/prisma/migrations/20260609_023_rls_tenant_isolation)

CREATE OR REPLACE VIEW "axhy"."QueueItem"
  WITH (security_invoker = true) AS
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

-- The view is (re)created after migration 023's grants, so grant axhy_app SELECT explicitly.
GRANT SELECT ON "axhy"."QueueItem" TO axhy_app;
