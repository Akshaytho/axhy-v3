# Multi-tenant invariants

These invariants are NEVER violated. ESLint, RLS, and integration tests enforce.

## The five rules

1. **Every domain table has `companyId`.** No exceptions in v3.0.
2. **Server-side gateway injects `companyId` from the authenticated session.** It is read from JWT, not from request body. LLM tool input is never trusted for `companyId`.
3. **Every query MUST filter by `companyId`.** ESLint custom rule `axhy/companyid-enforcement` enforces. Postgres RLS is defense in depth.
4. **Every backend integration test asserts cross-tenant isolation.** A test that verifies endpoint X must include a setup with two tenants and an assertion that tenant A cannot read tenant B's data via X.
5. **Per-tenant rate limits at API gateway.** Default: 100 rpm per tenant; per-route overrides.

## Why these are non-negotiable

V2 had zero of these as enforced rules. Result: cross-tenant leak risks compounded as the codebase grew. v3 has all five enforced from day 1, in three layers:
- ESLint (compile-time)
- Integration tests (per-PR runtime)
- Postgres RLS (production runtime)

## When you're tempted to relax

You aren't. If a feature seems to require cross-tenant data access (for example, a Super Admin tool):
1. Use a separate, narrowly-scoped `super_admin_*` table or view
2. Authenticate via a separate JWT scope (`super.read`, `super.write`)
3. Audit-log every super-admin access with target tenant ID
4. Never weaken the RLS rule for the customer-facing path

## Lineage

Master plan §E (multi-tenant rules). ADR-0004. Owned forever.
