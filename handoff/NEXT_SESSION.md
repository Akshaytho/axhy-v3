# Next Session — Worker MVP Slice 2a-2 (mobile half of Worker Home + Assignment Detail)

> **Read time: 3 minutes. Highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` and `MEMORY_V3.md` first, then proceed."

## Current commit baseline

`af926ab feat(worker-mvp): slice 1 auth shell + slice 2a-1 today/visit backend` on `main`.

## What's shipped (this commit)

- **Slice 1** (`worker-d1-s1-auth-shell`, gate **L5**): F-006b worker-shell relaxation in `identity-lifecycle.ts`; first production wiring of `workerMachine.OTP_VERIFIED` in `auth.ts`; `ConsentLog` migration `20260528_018` applied on Railway; `(worker)/_layout` + 3 placeholder tabs; `(auth)/permissions` + `(auth)/consent` screens; 20/20 mobile tests + 13/13 real-DB tests; 7 screenshots captured.
- **Slice 2a-1** (`worker-d1-s2a-1-backend-today`, gate **L3**): `GET /worker/today` + `GET /worker/visits/:id` with `worker-today-service.ts` composer; `WorkerTodayOutput` + `WorkerVisitDetailOutput` Zod; 8/8 real-DB tests on Railway sandbox.

Done memos: `done-memo-worker-d1-s1-auth-shell.md`, `done-memo-worker-d1-s2a-1-backend-today.md`. Plans: `docs/personas/worker/WORKER_MVP_SPRINT_PLAN.md`, `WORKER_MVP_SLICE_2A_PLAN.md`, `DO_NOT_BUILD_MVP.md`. Design delta: `apps/mobile/screenshots-worker-d1-s1-design/DELTA.html`.

## What starts next: sub-slice 2a-2 (mobile half of slice 2a)

**Scope (from `WORKER_MVP_SLICE_2A_PLAN.md` §1 + §7):**

1. Rewrite `apps/mobile/app/(worker)/index.tsx` from placeholder to real Worker Home that consumes `GET /worker/today` via a new `use-worker-today` React Query hook.
2. Create `apps/mobile/app/(worker)/visit/[id].tsx` (Assignment Detail) consuming `GET /worker/visits/:id`.
3. Create 4 reusable components: `AssignmentCard`, `ResumeCaptureBanner`, `HomeBellIcon`, `StateBadge`.
4. Add `apps/mobile/scripts/qa-worker-d1-s2a-home-detail.ts` (Playwright capture of 3 Home states + Assignment Detail).
5. Wire `tap-to-call supervisor` (`tel:` link) on Assignment Detail. "Can't make this" button = disabled stub ("Coming with leave & swap").
6. Resume-capture banner predicate = `visit.state IN (EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING)`.

**Estimated:** ~9 files, 4–6h. No new state machines fire. No schema change.

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

Don't re-read the older Layer 1 / supervisor-sprint handoff chain (`README.md`, `STATUS.md` legacy sections, `ROADMAP.md`, the `2026-05-17-*` audit memos). They're carried forward but not load-bearing for slice 2a-2.

## Open assumption for 2a-2

`use-worker-today` and `use-worker-visit` React Query hooks need a `QueryClient` provider. `apps/mobile/app/_layout.tsx` already mounts `QueryClientProvider` (verified during slice 1) — no new infra. Stale time + retry policy default to React Query defaults; if mobile perf reveals re-fetch storms during pull-to-refresh, tune in a follow-up.

## First thing to do in next session

1. **Run `pnpm --filter @axhy/ai-tools run audit`** to confirm clean baseline.
2. **Read `WORKER_MVP_SLICE_2A_PLAN.md` §1 + §7** for sub-slice 2a-2 scope.
3. **Read this file's "Decisions still in force"** above so no re-debate.
4. **Start 2a-2** with the same shape as 2a-1: Phase 1 read existing components + tokens, Phase 2 touch new files, Phase 3-N batched `check_before_edit` approvals, Phase final screenshot capture + `check_before_done` + done memo.
