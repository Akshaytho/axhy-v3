-- Migration 024 — self-read RLS policy for the auth bootstrap (Membership + Worker).
--
-- The auth bootstrap reads the CALLER'S OWN rows across companies, with no single
-- company in scope yet:
--   - login / refresh / GET me enumerate a user's ACTIVE Memberships across companies
--     (the company switcher) — src/routes/auth.ts, auth-refresh.ts, me.ts.
--   - requireAuth verifies the caller's own Membership by id — tenant-context.ts.
--   - resolveWorkerFromAuth resolves the caller's Worker by the globally-unique userId
--     — tenant-context.ts.
-- Under migration 023's tenant_isolation policy (company-only) these would return zero
-- rows when the app connects as axhy_app, breaking login + every worker request.
--
-- Fix: a FOR SELECT-only permissive policy keyed on a second GUC, axhy.current_user_id,
-- set transaction-locally by withUserContext (apps/backend/src/middleware/tenant-context.ts).
-- A user only ever sees their OWN membership/worker rows by userId — this is the caller's
-- own identity, not a cross-tenant leak. Permissive policies OR-combine, so this only
-- ADDS self-rows to SELECT; with current_user_id unset (every normal company-scoped
-- query) the predicate is NULL/false and nothing changes. Writes remain company-only:
-- tenant_isolation is FOR ALL and still governs INSERT/UPDATE/DELETE; this policy is
-- FOR SELECT and cannot widen them.
--
-- Verification (as axhy_app):
--   -- with set_config('axhy.current_user_id', <userId>, true): SELECT on Membership/Worker
--   -- returns only that user's rows (across their companies), never another user's, never
--   -- another company's non-self rows. INSERT for another company still rejected.
--
-- Rollback:
--   DROP POLICY IF EXISTS tenant_self_read ON axhy."Membership";
--   DROP POLICY IF EXISTS tenant_self_read ON axhy."Worker";
--
-- @derives(docs/locked/operational-invariants.md INVARIANT 1)
-- @derives(packages/shared-schema/prisma/migrations/20260609_023_rls_tenant_isolation)

DROP POLICY IF EXISTS tenant_self_read ON axhy."Membership";
CREATE POLICY tenant_self_read ON axhy."Membership" FOR SELECT
  USING (
    "companyId"::text = current_setting('axhy.current_company_id', true)
    OR "userId"::text = current_setting('axhy.current_user_id', true)
  );

DROP POLICY IF EXISTS tenant_self_read ON axhy."Worker";
CREATE POLICY tenant_self_read ON axhy."Worker" FOR SELECT
  USING (
    "companyId"::text = current_setting('axhy.current_company_id', true)
    OR "userId"::text = current_setting('axhy.current_user_id', true)
  );
