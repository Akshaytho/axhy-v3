# Next Session

**Last updated:** 2026-06-09 · **Branch:** `chore/handoff-late-2026-05-31` · **NOT pushed** — founder pushes/re-syncs `main`.

## 🔴 FOUNDER ACTIONS (do first)

1. **Rotate `JWT_SECRET`** — prod uses the guessable dev placeholder. `openssl rand -hex 32` → Railway backend env + `apps/backend/.env.local` (jwt.ts:20 requires it).
2. **Apply migrations to prod** (in order; all lab-built + lab-verified this session) — see the prod-activation runbook below.
3. `/mcp` reconnect loads the brain Pool fix (43509bd).

## What was completed (this session — all gated + lab-verified + committed)

### A. RLS tenant-isolation rollout — COMPLETE + lab-verified (15/15)

Makes operational-invariants INVARIANT 1 DB-enforced. App is `axhy_app`-ready; only the founder's prod connection switch remains.

- **023** non-superuser `axhy_app` role + grants + `FORCE RLS` + `tenant_isolation` USING/WITH CHECK on the **27 tenant tables** (companyId tables except User/Outbox/IdempotencyKey).
- **024** `tenant_self_read` (FOR SELECT, GUC `axhy.current_user_id`) on Membership+Worker for the auth bootstrap.
- App GUC coverage: `tenant-context.ts` (`withTenantRead`/`withUserContext`); auth routes (login/refresh/me); all 6 domain route files; `getHrSiteIds` self-wraps; SUPER_ADMIN provisioning sets the company GUC mid-tx.
- Verified as `axhy_app`: `rls-tenant-isolation` (8) + `rls-auth-bootstrap` (5) + `rls-superadmin-provision` (2) = **15/15**; tsc clean.
- Validated the ledger `[GUC]` items: **#17 budget gate is benign** under this design (reads only Company + writes Outbox — both RLS-excluded); **#10/#21/#27 admin-read GUC gaps closed** by the Phase-2d wraps.

### B. Ledger items cleared

- **H6 (HIGH) — chat `log_complaint` idempotency** (025): `Complaint.dedupKey` + unique `(companyId,dedupKey)` + service pre-check (no P2002-in-tx); chat passes `${idempotencyKey}:hash(siteId|kind|text)`. Lab 3/3.
- **#37 — QueueItem view RLS bypass** (026): recreated `WITH (security_invoker=true)` so the view honors RLS. Verified as `axhy_app`: GUC=A → only A's rows; no GUC → 0.
- **BLOCKER #3 — Membership.notificationPrefs migration** (027): column was in schema.prisma + lab (db push) but had no migration → prod `/me` 500s. Added idempotent `ADD COLUMN IF NOT EXISTS … jsonb NOT NULL DEFAULT '{}'`. Verified backfill on a clone.

### C. Autopilot (founder-requested)

`Stop` hook (`.claude/autopilot/stop-hook.mjs` + `state.json`) registered by founder in `.claude/settings.json`, **armed** this session (`engaged:true`). Auto-continues at terminal stops; Telegram-pings (`~/.axhy_notify.sh`) on `blocked`/`done`/iteration-cap. Disarm: `state.json engaged:false`. The agent cannot self-register/self-arm via settings.json (classifier blocks self-modification of startup config) — founder-registered.

## RLS + DB prod activation runbook (FOUNDER)

1. Apply, as DB superuser, in order: `20260609_023` → `024` → `025` → `026` → `027` (raw SQL).
   Verify: `pg_policy` has 27 `tenant_isolation` + 2 `tenant_self_read`; `QueueItem` reloptions `{security_invoker=true}`; `Membership.notificationPrefs` exists.
2. `ALTER ROLE axhy_app WITH PASSWORD '…'`.
3. Flip the **API** service `DATABASE_URL` → `axhy_app` URL. **Dispatcher/worker stays on `postgres`** (trusted background, no user input). Smoke: login → /me → GET /admin/sites → worker read → a super-admin create.
4. Rollback: revert API `DATABASE_URL` (RLS inert again); each migration has an embedded rollback block.

## What is genuinely incomplete

- **RLS:** code done; founder prod activation only (above).
- **Remaining ledger (lower priority):** MEDIUM/LOW in `axhy-artifacts/reports/PRODUCTION_BUG_LEDGER.md`. Bounded, good autonomous candidates: **#14** VisitPhoto unique (visitId,r2Key), **#25** notifications.ts uses its own PrismaClient (use shared singleton), **#26** owner-budget/reset audit dedup, **#13** mark-absent rate-limit/idempotency, **#19** idempotency-reservation-released-on-transient-error. **Need founder design (do NOT auto-grind):** **#20** build leave/swap/complaint state machines, **#23** global default-deny auth hook. LOW (#28–38) are mostly verified-low / opportunistic.
- HIGH items [4][5][7][8][9][11] were closed earlier (commit 43509bd); [12] HRPod is obsolete (HR moved to site-anchored — pods dead-but-present by design).

## First action next session

1. Founder: rotate JWT, apply migrations 023–027, flip API DATABASE_URL.
2. Continue ledger: #14 → #25 → #26 → #13 → #19 (bounded), then schedule #20/#23 as designed sessions.
3. Each fix: `check_before_edit` → lab/real-DB test (one file at a time) → `check_before_commit`.

## Test-infra notes

- RLS suite (15/15): `cd apps/backend && AXHY_DB_URL=postgresql://axhy_app@localhost:5433/postgres RLS_ADMIN_URL=postgresql://postgres@localhost:5433/postgres RLS_APP_URL=postgresql://axhy_app@localhost:5433/postgres npx vitest run test/rls-tenant-isolation.test.ts test/rls-auth-bootstrap.test.ts test/rls-superadmin-provision.test.ts`.
- H6: `DATABASE_URL=postgresql://postgres@localhost:5433/postgres npx vitest run test/complaint-idempotency.test.ts` (3/3). psql: `/opt/miniconda3/bin/psql`.
- Other integration tests hit remote Railway; run one file at a time. Lab has only `axhy` schema; `axhy_app` connects via local trust auth on :5433.
