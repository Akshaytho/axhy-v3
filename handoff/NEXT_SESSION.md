# Next Session — Worker MVP Sub-slice 2b-1 (capture-flow scaffold)

> **Read time: 3 minutes. Highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` and `MEMORY_V3.md` first, then proceed."

## Current commit baseline

`2e876a6` on `main` — sub-slices `worker-d1-s1-auth-shell`, `worker-d1-s2a-1-backend-today`, and `worker-d1-s2a-2-mobile-home` shipped.

## What's shipped (this commit)

- **Slice 1** (gate **L5**): F-006b worker-shell, ConsentLog migration, 3-tab scaffold, 20/20 mobile tests + 13/13 real-DB tests.
- **Sub-slice 2a-1** (gate **L3**): `GET /worker/today` + `GET /worker/visits/:id` + `worker-today-service.ts` + Zod schemas + 8/8 real-DB tests on Railway.
- **Sub-slice 2a-2** (gate **L3+**, this commit): Worker Home rewrite, Assignment Detail screen, 4 reusable components (`StateBadge`, `AssignmentCard`, `HomeBellIcon`, `ResumeCaptureBanner`), 2 React Query hooks, Playwright capture suite with 4 screenshots + side-by-side `DELTA.html` (8 PASS / 2 LOCKED / 5 DEFER / 1 PLACEHOLDER / 0 DRIFT / 0 BROKEN).

Done memos: `done-memo-worker-d1-s1-auth-shell.md`, `done-memo-worker-d1-s2a-1-backend-today.md`, `done-memo-worker-d1-s2a-2-mobile-home.md`.

## What starts next: sub-slice 2b-1 (capture-flow scaffold)

**Scope (from `WORKER_MVP_SLICE_2A_PLAN.md` §7):**

1. Install `expo-location` + `expo-sensors` + `expo-file-system` per Expo SDK 54 docs.
2. Create capture-flow route scaffold under `apps/mobile/app/(worker)/capture/` with placeholder steps: `qr-scan`, `before-photos`, `timer`, `after-photos`, `review`, `submit`.
3. Create `apps/mobile/lib/storage/per-user-partition.ts` — internal `documentDirectory + /captures/{workerId}/{visitId}/` layout. NO gallery access (founder lock 2026-05-21).
4. Wire deep-link from `ResumeCaptureBanner` (currently navigates to Assignment Detail) to enter the in-progress capture step.
5. Add `apps/mobile/scripts/qa-worker-d1-s2b-1-capture-scaffold.ts` Playwright capture (placeholder screens only).

**Estimated:** ~8 files, ~4h. No new state machines fire. No backend route. No schema change. R2 upload + GPS/motion fraud detection land in **2b-2 / 2b-3**.

## Decisions still in force (don't re-debate)

| Decision                                                                                                      | Source                                                 |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 3-tab canonical (Home / History / Profile); capture surfaces as Home banner                                   | `DELTA.html` divergence #1 resolved 2026-05-21         |
| Theme picker cut at MVP                                                                                       | `DO_NOT_BUILD_MVP.md` M14                              |
| Photo storage: app-internal only, no gallery, per-user partition, R2 incremental upload, 30-day local cleanup | Founder direction 2026-05-21 — implemented in slice 2b |
| Sprint mode ON — no per-rev friend review, batch panel review at end of sprint                                | `feedback_supervisor_sprint_mode.md` (carried)         |
| All commits sign with `Co-Authored-By: Claude Opus 4.7 (1M context)`                                          | Convention from existing log                           |

## Discipline gates active

- `check_before_edit` on every code Write/Edit (Layer 1 pre-commit hook enforces).
- `check_before_plan` on every plan/persona/handoff Write/Edit (architecture evidence + source hierarchy required).
- `check_before_done` on every done-memo write (quality gate L3+ required to pass).
- Pre-commit eslint rule `axhy/require-derives` blocks exports without `@derives(ADR-NNNN)` or `@derives(master-plan §X.Y)` JSDoc.
- Pre-commit `docs/personas/` changes need `AXHY_FOUNDER_APPROVED=1`.

## What to skip

Don't re-read the older Layer 1 / supervisor-sprint handoff chain (`README.md`, `STATUS.md` legacy sections, `ROADMAP.md`, the `2026-05-17-*` audit memos). They're carried forward but not load-bearing for slice 2b-1.

## Open assumption for 2b-1

`expo-location` requires the location permission flow — slice 1 already shipped `(auth)/permissions` covering camera; location permission gets a similar one-line ask before the first capture-flow tap. The exact copy and screen placement (before-first-capture toast vs upfront permissions page) lands as a 2b-1 founder decision.

## First thing to do in next session

1. **Run `pnpm --filter @axhy/ai-tools run audit`** to confirm clean baseline.
2. **Read `WORKER_MVP_SLICE_2A_PLAN.md` §7** for sub-slice 2b-1 scope.
3. **Read this file's "Decisions still in force"** above so no re-debate.
4. **Start 2b-1** with the same shape as 2a-2: Phase 1 read storage + existing capture references, Phase 2 install Expo modules, Phase 3-N batched `check_before_edit` approvals, Phase final screenshot capture + `check_before_done` + done memo.
