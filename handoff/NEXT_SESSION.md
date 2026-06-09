# Next Session

**Last updated:** 2026-06-09 · **Branch:** `chore/handoff-late-2026-05-31` · **NOT pushed** — founder pushes/re-syncs `main`.

## 🔴 FOUNDER ACTIONS (do first)

1. **Rotate `JWT_SECRET`** — prod uses the guessable dev placeholder. `openssl rand -hex 32` → Railway backend env + `apps/backend/.env.local` (jwt.ts:20 already requires it).
2. **Apply the HR migration to prod** — `migrations/20260608_022_site_hr_ownership/migration.sql` (built/tested on lab).
3. **RLS prod activation** — see the runbook below (apply 023+024, set `axhy_app` password, flip the API `DATABASE_URL`). `/mcp` reconnect loads the brain Pool fix (43509bd).

## What was completed (this session — RLS rollout, ledger item #1: COMPLETE in code + lab-verified)

operational-invariants.md INVARIANT 1 (no cross-tenant access, RLS-enforced) is now fully implemented and lab-verified. The app is ready to connect as the non-superuser `axhy_app` role; only the founder's prod-side activation remains. **All lab-built + lab-verified; founder applies migrations to prod.** Commits on the feature branch:

- `e6a1d97` **Phase 1 (DB artifact)** — migration `20260609_023`: `axhy_app` role + grants + `ENABLE/FORCE ROW LEVEL SECURITY` + `tenant_isolation` `USING/WITH CHECK ("companyId"::text = current_setting('axhy.current_company_id', true))` on the **27 tenant tables** (every `companyId` `axhy` table except User/Outbox/IdempotencyKey).
- `7ffe0ee` **Phase 2a (auth-bootstrap GUC)** — migration `20260609_024`: `FOR SELECT` `tenant_self_read` on Membership+Worker keyed on `axhy.current_user_id`. `tenant-context.ts` adds **`withTenantRead`** (company GUC, no ACTIVE gate — reads) + **`withUserContext`** (user GUC — own-row reads). `requireAuth` + `resolveWorkerFromAuth` rewired.
- `9172324` **Phase 2c** — auth.ts/auth-refresh.ts/me.ts bootstrap reads → `withUserContext`; worker OTP transition + login audit writes → `withTenantContext`.
- `3894c4c` + `561be41` + `b9cd2ae` **Phase 2d (domain reads, all 6 files)** — admin-memberships/supervisor-decisions/worker-submit/admin-sites/admin-workers/leave-requests reads → `withTenantRead`. `getHrSiteIds` self-wraps on the base client (covers its 7 call sites); reads directly when given a tx.
- `af8ca9e` **SUPER_ADMIN provisioning** — both flows set the company GUC mid-tx so their AuditEvent + OWNER Membership writes pass WITH CHECK under axhy_app.
- `225263d` **Phase 2f (verification)** — service-level integration test as `axhy_app`. Full RLS suite **15/15**: `rls-tenant-isolation` (8) + `rls-auth-bootstrap` (5) + `rls-superadmin-provision` (2). `tsc` clean throughout.

Every app edit keeps its `companyId` where-clause (defense-in-depth) → **behavior-preserving under the current `postgres` superuser connection**; the GUC only changes outcomes once `DATABASE_URL` points at `axhy_app`.

**Architecture decisions (this session):** the **dispatcher / background outbox worker stays on the `postgres` connection** (trusted server code, no user input, per-company payloads) — only the **API** process switches to `axhy_app`. Helper/service functions that take a `db` client (e.g. `getHrSiteIds`) read tenant tables — they were audited; only `getHrSiteIds` needed the self-wrap (all `xxxService(...)` are only ever called inside `withTenantContext`, so they inherit the GUC).

## RLS prod activation runbook (FOUNDER — the only remaining RLS step)

1. Apply `migrations/20260609_023_rls_tenant_isolation/migration.sql` then `migrations/20260609_024_rls_auth_self_read/migration.sql` to prod as the DB superuser (raw SQL; Prisma can't express roles/policies). Verify: `SELECT count(*) FROM pg_policy WHERE polname='tenant_isolation'` = 27; `… polname='tenant_self_read'` = 2.
2. Set a strong password on the prod `axhy_app` role: `ALTER ROLE axhy_app WITH PASSWORD '…'`.
3. Flip the **API** service `DATABASE_URL` to the `axhy_app` URL (Railway backend env). **Leave the dispatcher/worker on the `postgres` URL.** Smoke-test: login → GET /me → an admin list (GET /admin/sites) → a worker read/submit → optionally a SUPER_ADMIN company create.
4. Rollback (instant): revert the API `DATABASE_URL` to the superuser role → RLS becomes inert again. Or run the embedded rollback blocks in 023/024.

Optional final smoke (nice-to-have, not blocking): boot the live backend on the `axhy_app` URL and curl the above flow — the 15/15 lab suite already proves the code paths.

## Autopilot (this session)

A `Stop` hook was built + isolation-tested (`.claude/autopilot/stop-hook.mjs` + `state.json`) and registered by the founder in `.claude/settings.json`. It is **inert** (`state.json engaged:false`). To run unattended: set `engaged:true` + `goal`/`next` (ask the agent to "engage autopilot for <goal>"). It auto-continues at terminal stops, Telegram-pings on `blocked`/`done`/cap via `~/.axhy_notify.sh`, capped at `maxIterations`. The agent cannot self-register it (auto-mode classifier blocks self-modification of startup config) — founder-registered only.

## Remaining HR waves (unchanged)

- **Wave 5b** — HR site-reassignment maker-checker. Ready-to-build spec (7 mandatory adversarial fixes) in memory `project_hr_wave5b_maker_checker_spec.md`.

## Broader ledger (post-RLS)

- **H6** chat `log_complaint` idempotency — schema `Complaint.dedupKey` + unique index + PRE-CHECK before create.
- **MEDIUM (15) + LOW (11)** + blocker#3 (notificationPrefs migration drift) + outbox batch + otp-pepper hardening. Full ledger: `~/eclean_workspace/axhy-artifacts/reports/PRODUCTION_BUG_LEDGER.md`.

## What is genuinely incomplete

- **RLS:** nothing in code — only the founder prod activation (runbook above). Code + lab verification are done (15/15).
- **H6 + MEDIUM/LOW ledger** items remain (above).

## First action next session

1. Founder: rotate `JWT_SECRET`; apply migration `20260608_022`; then the RLS activation runbook.
2. Then the ledger: **H6** (chat idempotency) → MEDIUM/LOW.
3. Each fix: `check_before_edit` → lab/real-DB test (one file at a time) → `check_before_commit`.

## Test-infra notes

- RLS lab suite (15/15): `cd apps/backend && AXHY_DB_URL=postgresql://axhy_app@localhost:5433/postgres RLS_ADMIN_URL=postgresql://postgres@localhost:5433/postgres RLS_APP_URL=postgresql://axhy_app@localhost:5433/postgres npx vitest run test/rls-tenant-isolation.test.ts test/rls-auth-bootstrap.test.ts test/rls-superadmin-provision.test.ts`. (psql: `/opt/miniconda3/bin/psql`.)
- Other integration tests hit remote Railway; run **one file at a time**.
- Lab has only the `axhy` schema; `axhy_app` connects via local trust auth (no password) on `:5433`.
