# Next Session

**Last updated:** 2026-06-05 (evening) · **Branch:** `chore/handoff-late-2026-05-31` (pushed to GitHub, ~52 commits ahead of `main`). · **Deploy state:** NOT on `main`/Railway yet — founder-owned step (see First action).

This run took the apps to **real-market production readiness**. Seeded production-shaped data, ran an exhaustive 33-agent adversarial audit, and **fixed + verified every finding** (20 fixes across 8 commits, all pushed). Evidence: `docs/evidence/2026-06-05/worker-supervisor-release/`.

> **Env truth:** emulator app → local backend on host `:4000` → Railway prod DB. No paying customers yet (founder-confirmed); prod data is fake; seeding sanctioned. Emulator is too weak on this host (1 vCore) for sustained UI driving, so verification was route+DB-level (reliable) + code audit + targeted tests.

---

## What was completed (all verified — typecheck green throughout; tests/route-probes as noted)

**Security (the big one):**

- 14 supervisor-surface routes + all 4 calendar routes were `requireAuth`-only → gated to SUPERVISOR (calendar also scoped to `supervisorId`). `supervisor-route-role-gates.test.ts` **29/29** prod-DB.
- **BLOCKING** `POST /assignments` ungated → a worker could fabricate assignments. Gated SUPERVISOR+HR (live: worker→403).

**Data-loss / correctness:**

- **BLOCKING** photo index cap 3→8 + submit array 6→16 — photos 4-8 could never upload (locked doc max 8). Live: presign idx 4→200, idx 9→400.
- replacement-invite: send candidate **User.id** not Worker.id (every invite 404'd) — E2E proven (User.id→201, Worker.id→404).
- worker FLAGGED reason now returned by verify-status (live-confirmed).
- chat won't card a hallucinated worker/site (RULE 4 guard).
- payroll recompute fires on any attendance change (not only deductions).

**State machine (both bypasses fixed):**

- `chat.ts` propose_termination → conditional update guarded on the 7 legal `TERMINATE` source states (worker.ts) + race-safe.
- `anonymize` → **two-step** (founder: HR finalizes a `TERMINATION_PENDING`, never direct). New `WORKER_NOT_PENDING_TERMINATION`→409. `admin-workers` + `hr-water-flow` **6/6**.
- `ai.ts` dispatcher visit-state write → first-writer-wins conditional update (TOCTOU closed).

**Scale / perf:**

- **Outbox multi-replica atomic claim** — conditional `nextRetryAt`-lease claim (no schema change); a 2nd replica skips claimed rows. `outbox-dispatcher` + `owner-budget-outbox` **12/12**. _(Founder: "don't lose clients" → done before any replica scale-up.)_
- supervisor-decisions N+1 (~600 queries) → single batched site-name Map.

**Robustness / doc-truth:**

- Global UUID path-param guard → malformed id returns **400** not 500 (live-verified).
- Removed dead supervisor "Resign" docstring/styles; fixed build-stamp + stale `visits.ts`/`capture/_layout.tsx` docstrings; lint lineage.

**Repo hygiene:** all 107 QA screenshots removed from git **and scrubbed from history** (force-pushed, founder-approved); `.gitignore` blocks future ones. Backup tag `backup-pre-scrub-2026-06-05`.

---

## What is genuinely incomplete

- **Nothing from the audit.** Every confirmed finding (2 blocking, all high, all medium/low, all 3 critic-gaps) is fixed + verified + pushed.
- **Pre-existing test flakes (NOT this session's work):** `supervisor-today` happy-path (time-of-day 'late' vs 'on_site' — the test's own comment predicts it); `chat-swap` (NOT_RESPONSIBLE responsibility model); `supervisor-decisions-union-all` (beforeAll fixture); `wave-1-replacement` (expiry CHECK constraint). Triage separately.
- **Optional hardening:** dedicated two-racer concurrency tests for the outbox claim + chat-termination guard (logic is sound + behavior-preserving tests pass, but a racer test would lock the property).

---

## First action next session

**Deploy (founder-owned).** Everything is committed + pushed to the branch but NOT on `main`. To go live:

1. Set **`AXHY_REDIS_NAMESPACE`** to a distinct value per prod Railway env (RCA-G boot guard — prod refuses to boot without it).
2. Merge `chore/handoff-late-2026-05-31` → `main`. Railway auto-deploys.
3. Smoke-verify the live server (`/health`, an authed route).

## Method notes

- Prod DB; route+DB verification is the reliable instrument on this host. Multi-company + isolation always.
- Seed: `apps/backend/scripts/seed-qa-comprehensive.ts` (loginable Suresh `+919999999999` / Ravi `+919900000002`, OTP `123456`; all 13 visit states; 2 companies).
- Host kept awake via `caffeinate`.
