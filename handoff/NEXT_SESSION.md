# Next Session — Supervisor App Sprint (2026-05-17 PM lock)

> **Read time: 3 minutes. This is the highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` and `MEMORY_V3.md` first, then proceed."

## Mode shift (locked 2026-05-17 PM)

Founder decided: drop the rev-by-rev plan/friend-review cycle for the supervisor app sprint. Reason: friend explicitly said current cadence is ~100x slower than needed. Target: **complete supervisor app in 3 days.**

**What stays:**

- Real-DB integration tests (sandbox), not mocks.
- Typecheck before declaring anything done.
- Panel review for UI per `feedback_no_ui_code_without_panel_approval.md` (BUT runs once at end of sprint, not per slice).
- Production-grade rules (`feedback_production_grade_workflow_rules.md`): invariants enforced, no check-then-act races, no final state before domain effect.
- Friend's planning discipline (`feedback_planning_decision_rules.md`) AT THE CODE LEVEL — every claim points to a real file:line; no fabricated fields/helpers; bootstrap vs reusable distinction.

**What stops:**

- Surfacing every plan rev to friend before execution.
- Asking the user every defensible choice. Make the reasonable call; surface only true blockers.
- Multi-turn AskUserQuestion loops between exploration and code.
- Per-slice panel review. Batch UI panel review at end of Day 3.
- Per-feature feature-queue updates. Update the queue once at end of sprint.

**What I will still surface immediately:**

- A schema decision that would block future work.
- A discovered destructive action (DB drops, prod data risk).
- A real ambiguity in user intent (not engineering choice).

## Current state at session boundary (2026-05-17 PM)

### Done

- **P1.5b** — SiteSupervisorBinding bootstrap-seed core + reusable first-bind helper + reverse query. `axhy-sandbox` has 5 PERMANENT bindings to its sole supervisor `fca29a46-667d-4880-ad35-c67aa4316793`. 23-case test suite green on Railway. Done memo: `handoff/done-memo-p1-5b-bootstrap-seed.md`.
- **F-013** — sandbox fixture cleanup utility. 71 fixture tenants deleted; sandbox down to 2 ACTIVE companies. Done memo: `handoff/done-memo-f013-sandbox-cleanup.md`.

### Approved + ready to execute (NO code yet)

- **Today slice plan** at `/Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md`. Three sub-slices in dependency order. User approved 2026-05-17 PM. Friend did NOT review this plan (sprint-mode shift came after approval). Plan is the source of truth — execute it.

## 3-day sprint scope

### Day 1 — Today end-to-end (from approved plan)

1. **Sub-slice 1 — Q2=B mark-absent hardening** (TDD-first per plan)
2. **Sub-slice 2 — `GET /supervisor/today` aggregator** + 5 real-DB tests
3. **Sub-slice 3 — Today mobile UI** — port R6 components to `apps/mobile/components/today/`, wire `useTodayQuery`, ship MarkAbsentSheet + disabled FlaggedReviewSheet
4. Smoke: log in as Suresh on `axhy-sandbox`, see Today render, mark a worker absent, see 403 toast when cross-supervisor.

### Day 2 — Other supervisor tabs (chat / decisions / updates / profile / summary)

1. **Chat tab** — audit current state (`apps/mobile/app/(supervisor)/chat.tsx` exists from prior waves). Fix anything broken. Wire to live backend.
2. **Decisions tab** — DWI is P1 (schema not shipped). Two options:
   - (a) Land P1 schema migration first (the paused plan in `tranquil-crunching-plum.md` below the separator), THEN build Decisions UI. Adds ~3-4h.
   - (b) Surface existing `SupervisorDecision` placeholder rows read-only; "Coming with P1" empty state if no rows. **Recommend (b)** unless founder asks for full DWI on Day 2.
3. **Updates tab** — HRUpdate is P1 too. Same choice. Recommend skeleton with "Coming with P1" copy + read existing Phase B.2 placeholder rows if any.
4. **Profile tab** — `apps/mobile/app/(supervisor)/profile.tsx` exists. Audit + polish.
5. **Summary tab** — derive from `/supervisor/today` + historical attendance counts (last 7 days). New aggregator route `GET /supervisor/summary` if needed.

### Day 3 — End-to-end + panel + ship

1. Real-life simulation: full Suresh flow on sandbox across all 5 tabs.
2. Bug bash: 500s, 401s, jank, missing empty states.
3. Performance: profile `/supervisor/today` + `/supervisor/summary`; add covering indexes if any slow query found.
4. **Adversarial panel review** (single batch) on full supervisor app via Playwright captures of all 5 tabs. Per `feedback_no_ui_code_without_panel_approval.md`. BLOCKING before founder sees rendered app.
5. Apply panel-surfaced fixes (small batch only).
6. Done memo `axhy-v3/handoff/done-memo-supervisor-sprint.md`.

## Decisions parked for first message of next session

These are choices I'll make on best judgment unless founder redirects:

1. **Decisions + Updates tabs path:** (b) read-only placeholders this sprint; DWI/HRUpdate P1 in a follow-up sprint.
2. **`/supervisor/summary` route:** new aggregator route; same pattern as `/supervisor/today`.
3. **Panel composition for Day 3:** Linear-style designer + Uber-dispatch ops designer + Rapido ops lead, per `feedback_design_quality_bar.md`.
4. **Sandbox real-data load (for meaningful Tier 1 derivation tests):** defer beyond sprint. Sprint runs against current `axhy-sandbox` + `seed-sandbox.ts` outputs.

If founder wants any of these flipped, they'll say so in the first message.

## Read these in order (cold start)

1. **This file** (you're reading it).
2. **`MEMORY_V3.md`** — index + planning-discipline pointers.
3. **`/Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md`** — the approved Today plan.
4. **`handoff/done-memo-p1-5b-bootstrap-seed.md`** — what's already in place (auth primitives, axhy-sandbox bindings).
5. **`handoff/done-memo-f013-sandbox-cleanup.md`** — sandbox state.
6. **`docs/prototypes/supervisor-mobile-r6/project/src/today.jsx`** — design source of truth for Today UI port (710 LOC).
7. **`apps/backend/src/lib/effective-responsibility.ts`** — the 4 routing primitives this sprint composes on.

Skip the old multi-step handoff chain (`README.md` → `STATUS.md` → etc.) for the sprint. Those were for the careful-review pace. Resume them after sprint ends if needed.

## Sandbox connection

Railway project `axhy-v3` is linked. To run anything against the sandbox DB:

```bash
railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec <command>'
```

For test runs:

```bash
cd apps/backend
railway run --service Postgres -- pnpm exec vitest run --reporter=verbose test/<file>
```

JWT for `axhy-sandbox` supervisor `fca29a46-...` — issue via `apps/backend/src/lib/jwt.ts` `issueAccessToken` in test setup; for live web smoke, log in via the mobile app's OTP flow with the sandbox phone.

## Files to expect at end of sprint (rough)

**Add (~20 files):**

- `apps/backend/src/lib/authorization/supervises-worker.ts`
- `apps/backend/src/lib/services/today-service.ts`
- `apps/backend/src/routes/supervisor-today.ts`
- `apps/backend/src/routes/supervisor-summary.ts` (Day 2)
- `apps/backend/test/supervisor-today.test.ts`
- `apps/backend/test/supervisor-summary.test.ts`
- `packages/shared-schema/src/zod/today.ts`
- `packages/shared-schema/src/zod/summary.ts`
- `apps/mobile/lib/queries/use-today.ts`
- `apps/mobile/lib/queries/use-summary.ts`
- `apps/mobile/components/today/*` (~10 component files)
- `apps/mobile/scripts/screenshot-supervisor-sprint.mjs` (5 tabs)
- `apps/mobile/screenshots-supervisor/README.md`
- `axhy-v3/handoff/done-memo-supervisor-sprint.md`

**Modify:**

- `apps/backend/src/lib/services/attendance-service.ts`
- `apps/backend/src/routes/workers.ts`
- `apps/backend/test/mark-absent.test.ts`
- `apps/backend/src/server.ts` (register 2 new routes)
- `packages/shared-schema/src/index.ts` (re-exports)
- `apps/mobile/app/(supervisor)/today.tsx`
- `apps/mobile/app/(supervisor)/summary.tsx` (or new)
- `apps/mobile/app/(supervisor)/decisions.tsx` (read-only placeholder)
- `apps/mobile/app/(supervisor)/updates.tsx` (read-only placeholder)
- `apps/mobile/app/(supervisor)/profile.tsx` (polish only)

## Discipline that still applies — and why

- **Every claim in code points to a real file:line** — friend caught fabricated `Visit.supervisorId`, `Assignment.supervisorId`, `createInitialPermanentBinding` earlier today. Don't repeat that.
- **No stubs that pretend success** — buttons that don't write yet render disabled with "Coming with P1" copy, not log+advance.
- **Real-DB tests against sandbox** — no mocks for service-layer tests. Use the established `calendar-find.test.ts` pattern.
- **Server-derived state, never client-recomputed** — Today's worker state labels derived in `today-service.ts`, not in `WorkerRow.tsx`.

## What to do FIRST in the new session

1. Acknowledge mode shift (1 line).
2. Read the files in the order above.
3. Start Sub-slice 1 (Q2=B) immediately. No re-plan, no re-explore — Phase 1 + Phase 2 work is captured in the plan file already.
4. Batch updates: one summary message at end of Day 1, Day 2, Day 3.

Stop overhead. Ship.
