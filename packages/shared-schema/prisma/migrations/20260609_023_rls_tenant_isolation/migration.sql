-- Migration 023 — Row-Level Security tenant isolation across the 27 axhy tenant tables.
--
-- Makes operational-invariants.md INVARIANT 1 ("Every query is scoped by companyId.
-- RLS policies enforce this at DB level. App-level filtering is defense-in-depth,
-- not the primary mechanism.") DB-enforced for the whole tenant schema, extending the
-- single-table precedent set by migration 017 (axhy_chat.turn_embeddings).
--
-- Mechanism: the app sets the transaction-local GUC `axhy.current_company_id` via
-- set_config('axhy.current_company_id', $companyId, true) (see withTenantContext in
-- apps/backend/src/middleware/tenant-context.ts). Each policy filters
-- "companyId"::text = current_setting('axhy.current_company_id', true). When the GUC
-- is unset, current_setting(..., true) returns NULL and the predicate is NULL (≠ true),
-- so the table is fail-closed: zero rows visible, all writes rejected.
--
-- The teeth come from connecting as the NON-superuser, NON-bypassrls role `axhy_app`.
-- Superusers (postgres) bypass RLS unconditionally, so this migration is a no-op for
-- the current app (which connects as postgres) until DATABASE_URL is switched to
-- axhy_app — a SEPARATE, founder-gated deploy step that depends on the app-side GUC
-- coverage slice (every base-client read of a tenant table must set the GUC first).
--
-- Scope: all 30 axhy-schema tables that carry a `companyId` column, EXCLUDING the three
-- the founder excluded (User, Outbox, IdempotencyKey) — those need legitimate
-- cross-company / no-GUC access (auth lookups, the background dispatcher, idempotency).
-- Company itself has no companyId (its id IS the tenant) and is intentionally NOT in
-- this slice; SUPER_ADMIN cross-tenant Company access is handled in the app-side slice.
--
-- Verification (run as a non-superuser axhy_app connection, before + after):
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='axhy'::regnamespace AND relkind='r' AND relrowsecurity ORDER BY 1;
--   SELECT polrelid::regclass, polname FROM pg_policy WHERE polname='tenant_isolation' ORDER BY 1;
--   -- with GUC set to company A, a SELECT on a tenant table returns only company A rows;
--   -- with no GUC, it returns zero rows; an INSERT for company B is rejected (WITH CHECK).
--
-- Rollback (full):
--   DO $rb$
--   DECLARE t text; tt text[] := ARRAY[
--     'Membership','Site','Worker','Visit','CalendarEntry','Assignment','ChatThread',
--     'ChatMessage','ChatRequestLog','LeaveRequest','AuditEvent','Device','Attendance',
--     'Complaint','ComplaintMessage','ComplaintMessageRead','SwapRequest',
--     'SupervisorDecision','LivingDoc','HRUpdate','VisitPhoto','HRPod','Policy',
--     'Notification','Digest','SiteSupervisorBinding','ReplacementInvite'];
--   BEGIN
--     FOREACH t IN ARRAY tt LOOP
--       EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON axhy.%I', t);
--       EXECUTE format('ALTER TABLE axhy.%I NO FORCE ROW LEVEL SECURITY', t);
--       EXECUTE format('ALTER TABLE axhy.%I DISABLE ROW LEVEL SECURITY', t);
--     END LOOP;
--   END $rb$;
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA axhy FROM axhy_app;
--   REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA axhy FROM axhy_app;
--   REVOKE USAGE ON SCHEMA axhy FROM axhy_app;
--   -- (the axhy_app role itself is left in place; drop separately if truly unwinding)
--
-- @derives(docs/locked/operational-invariants.md INVARIANT 1)
-- @derives(docs/locked/development-code-standards.md — route layer 2: withTenantContext = Postgres GUC + RLS)
-- @derives(packages/shared-schema/prisma/migrations/20260527_017_turn_embeddings_rls_and_cascade)

-- 1. Ensure the non-superuser application role exists (idempotent). It must NOT be a
--    superuser and must NOT have BYPASSRLS, or RLS would not apply to it. No password
--    is set here — the founder sets/rotates the axhy_app password in the prod env.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axhy_app') THEN
    CREATE ROLE axhy_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2. Grant the app role table-level DML on the WHOLE axhy schema. RLS does the per-row
--    tenant filtering; grants only gate table-level access. The excluded tables
--    (User/Outbox/IdempotencyKey) are reachable too — they just have no row filter.
GRANT USAGE ON SCHEMA axhy TO axhy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA axhy TO axhy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA axhy TO axhy_app;

-- Future tables/sequences created by the migration-running role inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA axhy GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO axhy_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA axhy GRANT USAGE, SELECT ON SEQUENCES TO axhy_app;

-- 3. Enable + FORCE RLS and install the tenant_isolation policy on each of the 27
--    tenant tables. FORCE makes the policy apply even to a table owner (defence in depth
--    if ownership ever changes); axhy_app is not the owner, so RLS already applies to it.
--    DROP POLICY IF EXISTS makes the whole block idempotent / re-runnable.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Membership','Site','Worker','Visit','CalendarEntry','Assignment','ChatThread',
    'ChatMessage','ChatRequestLog','LeaveRequest','AuditEvent','Device','Attendance',
    'Complaint','ComplaintMessage','ComplaintMessageRead','SwapRequest',
    'SupervisorDecision','LivingDoc','HRUpdate','VisitPhoto','HRPod','Policy',
    'Notification','Digest','SiteSupervisorBinding','ReplacementInvite'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE axhy.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE axhy.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON axhy.%I', t);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON axhy.%I
        USING ("companyId"::text = current_setting('axhy.current_company_id', true))
        WITH CHECK ("companyId"::text = current_setting('axhy.current_company_id', true))
    $pol$, t);
  END LOOP;
END $$;
