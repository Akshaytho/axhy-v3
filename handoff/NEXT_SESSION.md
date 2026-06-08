# Next Session

**Last updated:** 2026-06-08 · **Branch:** `chore/handoff-late-2026-05-31` · **NOT pushed** — founder pushes/re-syncs `main`.

## 🔴 FOUNDER ACTIONS (do first)

1. **Rotate `JWT_SECRET`** — prod uses the guessable dev placeholder `axhy-dev-only-jwt-secret-rotate-before-launch-...` (forgeable auth, any role). `openssl rand -hex 32` → Railway backend env + `apps/backend/.env.local`. Code already requires it (jwt.ts:20).
2. **Apply the HR migration to prod** — `packages/shared-schema/prisma/migrations/20260608_022_site_hr_ownership/migration.sql` (adds `Site.ownerHrUserId` + index + sole-HR backfill). Built/tested on the lab; founder applies prod.
3. `/mcp` reconnect (loads the brain Pool fix from commit 43509bd).

## Commits this session (all gated + lab-tested, on the feature branch)

- `43509bd` — production-hardening batch: brain pg.Pool fix, 2 launch blockers, 6 HIGH (H4/H5/H7/H8/H9/H11), 5 test-infra, artifact-sentinel guardrail.
- `54a4299` — HR site-ownership **wave 1+2**: `Site.ownerHrUserId` schema + migration; one-worker-one-HR **write invariant** (`validateWorkerHrInvariant`, FOR UPDATE race lock) on all 4 write paths (assignments, /chat/apply, replacement-cover, calendar) → WORKER_DIFFERENT_HR 409.
- `cec0b6e` — HR **wave 3a**: `getHrSiteIds` helper + H8 complaint site-scoping (HR=their sites, OWNER=company-wide).
- `e590d94` — HR **wave 3b**: read-side site-scoping for admin-workers / admin-memberships / leave-requests (worker via `assignments→site`, supervisor via binding).
- `0a0c1c1` — HR **wave 4**: closed 3 HR leaks — worker-anonymize, bindings read, bindings create now site-scoped.

**Lab DB:** local PG `postgresql://postgres@localhost:5433/postgres`, synced via `prisma db push`. Run the HR test there: `cd apps/backend && DATABASE_URL="postgresql://postgres@localhost:5433/postgres" npx vitest run test/hr-site-invariant.test.ts` → **6/6 green**.

## HR model (LOCKED — founder doc 15, simplified 2026-06-08)

Site-anchored, **one worker = one HR**. `Site.ownerHrUserId` = the single HR per site. A worker's sites must all belong to one HR (enforced at assignment; reject cross-HR). HR sees only workers/leave/complaints/bindings on their sites; OWNER is company-wide. **No pods, no primary-site snapshot, no routedSiteId, no soft-claim** (founder dropped that complexity). `HRPod`/`Membership.podId` left dead-but-present (no destructive drop).

## Remaining HR waves

- **Wave 4b** — `POST /assignments` caller-owns-target-site (HR-A assigning a fresh/HR-less worker onto HR-B's site). Lower severity (wave-2 invariant already blocks splitting an _existing_ worker); nuanced because supervisors also create assignments.
- **Wave 5 (makes the model usable)** — `PATCH /admin/sites/:id/hr` OWNER-only endpoint to set `Site.ownerHrUserId` (+ optional unassign), + `adminAssignSiteHrService` (assert target user is an ACTIVE HR in the company) + audit `SITE_HR_ASSIGNED` + **reassign-split validation** (reject if re-pointing a site's HR would leave a worker on it split across two HRs — the critic's open risk #5). Without this, only sole-HR tenants get sites (via the backfill); multi-HR tenants can't assign.
- **Wave 6 (brain capstone)** — edit `HR-portal-final/15_OWNERSHIP_MODEL_DECISION.md` to the simplified one-worker-one-HR rule (drop the primary-site/routedSiteId/soft-claim "3 rules"); add SUPERSEDED banners to the 3 pod source docs the brain ingests (`docs/specs/2026-05-15-workflow-design-closure.md` §4.x/§8, `docs/plans/2026-05-15-implementation-kickoff-layer-1.md` HRPod, `docs/superpowers/specs/2026-05-29-hr-a1-thin-portal-design.md`); rebuild the brain (`pnpm --filter @axhy/ai-tools brain:build` with DATABASE_URL set); save a project memory; **delete the now-dead `apps/backend/src/middleware/pod-scope.ts`** (getMyPodIds — no longer imported anywhere after wave 3b).

## Broader ledger (from the 38-bug audit, post-HR)

- **H6** chat `log_complaint` idempotency — schema `Complaint.dedupKey` + plain unique index + PRE-CHECK before create (do NOT catch P2002 inside the interactive tx).
- **#1 RLS rollout** — develop on the lab (non-superuser `axhy_app` role + FORCE RLS + USING/WITH CHECK on ~27 tenant tables, exclude User/Outbox/IdempotencyKey); founder applies prod. Locked-doc-mandated pre-launch.
- **MEDIUM (15) + LOW (11)** + blocker#3 (notificationPrefs migration drift) + outbox batch + otp-pepper hardening. Full ledger: `~/eclean_workspace/axhy-artifacts/reports/PRODUCTION_BUG_LEDGER.md`.
- **Post-commit brain hook (the "last" item)** — DIAGNOSED: the hook shell has no DATABASE_URL so `post-commit.mjs` always skips the brain rebuild + writes a stale marker. Fix: source `apps/backend/.env.local` in `.husky/post-commit` before the `node post-commit.mjs` line. Do this LAST.

## Test-infra notes

- Integration tests hit remote Railway; run **one file at a time** (parallel `beforeAll` contends for connections).
- The QA fixture (Company `2d2f1ccb…` + User `17285e17…`) some auth tests need was seeded via psql; re-seed if a DB reset wipes it.
- `union-all` perf microbenchmark gated local-only.

## First actions next session

1. Founder: rotate `JWT_SECRET` + apply migration 20260608_022 to prod.
2. Wave 5 (OWNER assign endpoint) → makes the HR model usable. Then wave 4b, wave 6 (brain + delete pod-scope.ts).
3. Then the ledger: H6 → RLS-on-lab → MEDIUM/LOW → post-commit hook last.
4. Each fix: `check_before_edit` → lab/real-DB test (one file at a time) → `check_before_commit`.
