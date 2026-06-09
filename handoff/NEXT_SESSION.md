# Next Session

**Last updated:** 2026-06-09 · **Branch:** `chore/handoff-late-2026-05-31` · **NOT pushed** — founder pushes/re-syncs `main`.

## 🔴 FOUNDER ACTIONS (do first)

1. **Rotate `JWT_SECRET`** — prod uses the guessable dev placeholder. `openssl rand -hex 32` → Railway backend env + `apps/backend/.env.local` (jwt.ts:20 already requires it).
2. **Apply the HR migration to prod** — `migrations/20260608_022_site_hr_ownership/migration.sql` (built/tested on lab).
3. **Set the `axhy_app` DB password in prod** before any RLS apply (see RLS runbook below). `/mcp` reconnect loads the brain Pool fix (43509bd).

## What was completed (this session — RLS rollout, ledger item #1)

All lab-built + lab-verified on local PG `postgresql://postgres@localhost:5433/postgres`. **Founder applies migrations to prod.** Five commits on the feature branch:

- `e6a1d97` **RLS Phase 1 (DB artifact)** — migration `20260609_023_rls_tenant_isolation`: ensures non-superuser `axhy_app` role (NOSUPERUSER, NOBYPASSRLS), grants DML+sequence+default-privs on schema `axhy`, and `ENABLE`+`FORCE ROW LEVEL SECURITY` + a `tenant_isolation` policy `USING/WITH CHECK ("companyId"::text = current_setting('axhy.current_company_id', true))` on the **27 tenant tables** (every `companyId`-bearing `axhy` table EXCEPT User/Outbox/IdempotencyKey). Mirrors the migration-017 turn_embeddings GUC. **Lab test `test/rls-tenant-isolation.test.ts` 8/8** (cross-tenant SELECT/INSERT/UPDATE/DELETE blocked as `axhy_app`, NULL-GUC fail-closed, all 27 forced+policy, excluded tables RLS-free).
- `7ffe0ee` **RLS Phase 2a (auth-bootstrap GUC infra)** — migration `20260609_024_rls_auth_self_read`: `FOR SELECT`-only `tenant_self_read` policy on Membership + Worker keyed on a 2nd GUC `axhy.current_user_id` (a user reads their OWN rows across companies — not a leak). `tenant-context.ts` adds **`withUserContext`** (sets current_user_id) and **`withTenantRead`** (company GUC, no ACTIVE gate, for reads → INVARIANT 2). Rewired `requireAuth` membership read + `resolveWorkerFromAuth` through `withUserContext`. **Lab test `test/rls-auth-bootstrap.test.ts` 5/5** running the REAL functions with the prisma singleton as `axhy_app` (via `AXHY_DB_URL`).
- `…` **Phase 2c (auth routes)** — auth.ts/auth-refresh.ts/me.ts: membership enumeration → `withUserContext`; worker OTP transition + login audit writes → `withTenantContext(active.companyId)`.
- `…` **Phase 2d part 1 (domain reads)** — wrapped reads in `withTenantRead(prisma, auth.companyId, …)`: admin-memberships, supervisor-decisions, worker-submit, admin-sites (5 reads).

Every Phase-2 edit KEEPS its existing `companyId` where-clause (defense-in-depth) → **behavior-preserving under the current `postgres` superuser connection**; the GUC only changes outcomes once `DATABASE_URL` points at `axhy_app`. `tsc --noEmit` clean throughout.

## What is genuinely incomplete (RLS — finish before flipping to axhy_app)

The app **must NOT** connect as `axhy_app` until ALL of these are done — RLS is all-or-nothing (any unwrapped tenant read returns 0 rows under `axhy_app` → silent breakage).

1. **Phase 2d part 2 — remaining domain reads** (same `withTenantRead(prisma, auth.companyId, async (tx) => tx.…)` transform; use `async` closures because of nested-relation selects):
   - `routes/admin-workers.ts`: `:106` membership.findMany, `:167` worker.findFirst (nested user→memberships select), `:201` + `:279` assignment.count. Add `withTenantRead` to the tenant-context import (line 19).
   - `routes/leave-requests.ts`: `:202` leaveRequest.findFirst, `:212` assignment.count, `:495` leaveRequest.findMany, `:535` leaveRequest.findFirst, `:566` assignment.count. Add `withTenantRead` to the import (line 35 group).
   - Note: `findUnique/findFirst` with a RELATION in the select must use `async (tx) =>` or the projected type collapses to the base scalar type (seen + fixed in auth-refresh.ts). `findMany`/`count` infer fine either way.
2. **Phase 2f — end-to-end verify under axhy_app**: boot the backend with `DATABASE_URL=postgresql://axhy_app@…` against a seeded lab, then exercise login → /me → an admin list (e.g. GET /admin/sites) → a worker read/submit, confirming non-zero rows + a successful write. (The wrapper PATTERN is already proven by the two RLS tests; this validates the wired routes end-to-end.) Then run the affected route test files against the lab as `axhy_app`.
3. **SUPER_ADMIN cross-tenant routes** (e.g. `routes/super-admin-companies.ts`) read across companies and are NOT yet GUC-handled — they will return 0 rows under `axhy_app`. Decide: platform-admin reads via a dedicated privileged path, or per-company GUC iteration. `Company` table itself was intentionally left out of the 27 (no companyId).

## RLS prod activation runbook (after the above is green on lab)

1. Founder applies `023` then `024` to prod as the DB superuser (raw SQL; Prisma can't express roles/policies). Verify: `SELECT count(*) FROM pg_policy WHERE polname='tenant_isolation'` = 27.
2. Founder sets a strong password on the prod `axhy_app` role (`ALTER ROLE axhy_app WITH PASSWORD '…'`).
3. **Dispatcher decision (made this session):** the background dispatcher/outbox worker KEEPS the `postgres` (superuser) connection — it is trusted server code with no user input and processes per-company outbox rows; it is not a tenant query surface. Only the **API** process switches to `axhy_app`. So set `axhy_app` `DATABASE_URL` for the API service only.
4. Flip the API `DATABASE_URL` to the `axhy_app` URL. Smoke-test login + a tenant read + a write. RLS is now the PRIMARY isolation mechanism (INVARIANT 1) instead of inert (today the API connects as superuser, so RLS is bypassed and only app-level companyId filters protect tenants).
5. Rollback: each migration has an embedded rollback block; or revert the API `DATABASE_URL` to the superuser role (instant, RLS becomes inert again).

## Remaining HR waves (unchanged from prior handoff)

- **Wave 5b** — HR site-reassignment maker-checker. Ready-to-build spec (with 7 mandatory adversarial fixes) in memory `project_hr_wave5b_maker_checker_spec.md`.
- HR model is site-anchored, one-worker-one-HR (memory `project_hr_access_site_based_one_hr_per_worker.md`). Waves 1–5a + 4b shipped.

## Broader ledger (post-RLS)

- **H6** chat `log_complaint` idempotency — schema `Complaint.dedupKey` + unique index + PRE-CHECK before create.
- **MEDIUM (15) + LOW (11)** + blocker#3 (notificationPrefs migration drift) + outbox batch + otp-pepper hardening. Full ledger: `~/eclean_workspace/axhy-artifacts/reports/PRODUCTION_BUG_LEDGER.md`.

## First action next session

1. Founder: rotate `JWT_SECRET`; apply migration `20260608_022` to prod.
2. Finish RLS Phase 2d part 2 (admin-workers.ts + leave-requests.ts — exact sites above), `tsc`, then Phase 2f e2e under `axhy_app` on the lab. `check_before_edit` → lab test (one file at a time) → `check_before_commit`.
3. Resolve SUPER_ADMIN cross-tenant reads, then the activation runbook (founder applies prod).
4. Then the ledger: H6 → MEDIUM/LOW.

## Test-infra notes

- RLS lab tests: `cd apps/backend && AXHY_DB_URL=postgresql://axhy_app@localhost:5433/postgres RLS_ADMIN_URL=postgresql://postgres@localhost:5433/postgres RLS_APP_URL=postgresql://axhy_app@localhost:5433/postgres npx vitest run test/rls-tenant-isolation.test.ts test/rls-auth-bootstrap.test.ts` → 13/13. (psql binary: `/opt/miniconda3/bin/psql`.)
- Other integration tests hit remote Railway; run **one file at a time**.
- The lab has only the `axhy` schema; `axhy_app` connects via local trust auth (no password) on `:5433`.
