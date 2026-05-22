# Next Session — Worker MVP Sub-slice 2b-2 (photo capture pipeline)

> **Read time: 3 minutes. Highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` and `MEMORY_V3.md` first, then proceed."

## Current commit baseline

Sub-slice `worker-d1-s2b-1-capture-scaffold` shipped on `main` 2026-05-22. Builds on `2e876a6` (2a-2 mobile Home + Assignment Detail). Done memo at `done-memo-worker-d1-s2b-1-capture-scaffold.md`.

## What's shipped (this commit)

- **Sub-slice 2b-1 (gate L3+):**
  - 3 Expo SDK 54 deps installed: `expo-location ~19.0.8`, `expo-sensors ~15.0.8`, `expo-file-system ~19.0.22`.
  - `lib/storage/per-user-partition.ts` — pure path helpers for the internal `documentDirectory + /captures/{workerId}/{visitId}/` partition (no I/O this slice; no gallery access).
  - 6-step capture-flow stack under `app/(worker)/capture/[visitId]/` — `qr-scan`, `before-photos`, `timer`, `after-photos`, `review`, `submit` — each rendered via shared `components/worker/capture/CaptureStepShell.tsx` with Back/Next/step-badge chrome.
  - `(auth)/permissions.tsx` grew a Location row alongside Camera (founder lock 2026-05-22 Option B). Continue gated on both grants.
  - `(worker)/index.tsx` ResumeCaptureBanner deep-link rewired from `workerVisitDetail` to `workerCaptureEntry` (qr-scan step).
  - `lib/api-routes.ts` exports `CAPTURE_STEPS` + `NAV_ROUTES.workerCaptureStep(visitId, step)` + `NAV_ROUTES.workerCaptureEntry(visitId)`.
  - `(worker)/_layout.tsx` Tabs gain `href:null` entries for `visit` + `capture` directories.
  - `(worker)/visit/_layout.tsx` Stack wrapper added — also retro-fixes the pre-existing 2a-2 tab-bleed defect.
  - `scripts/qa-worker-d1-s2b-1-capture-scaffold.ts` Playwright capture — 7 screenshots verified.
- **Bonus fix outside slice scope:** `axhy-cognitive-system/src/layer-1-hook/pre-edit-guard.mjs` `wasFileReadRecently` rewritten to glob every `/tmp/axhy-*-read-state.json` bucket (founder-approved hash-mismatch fix; matches the read-side fanout shape of commit 727e6b8 earlier today).

## What starts next: sub-slice 2b-2 (photo capture pipeline)

**Scope (from `WORKER_MVP_SLICE_2A_PLAN.md §7`):**

1. Wire `expo-camera` into the `before-photos` and `after-photos` step screens — 3 photos per phase, internal storage only.
2. Implement `lib/storage/per-user-partition.ts` I/O side: `ensureDir`, `writePhoto`, `listPhotos`, `deletePhoto`. Web no-op fallback.
3. Incremental R2 upload pipeline — kick off uploads as photos land, not on Submit. Retry policy + background-tolerant queue.
4. Photo grid review on the `review` step with retake-per-photo affordance.
5. Capture-state machine (new `captureMachine` in `packages/state-machines/src/`) — tracks step position so 2b-1's ResumeCaptureBanner deep-link can jump to the in-progress step (currently lands on qr-scan unconditionally).
6. Backend route for R2 signed upload URLs (small addition; no Visit state transition yet — that's 2b-3 Submit).

**Estimated:** ~10 files, ~6h. New `captureMachine` state machine + new backend route + new tests.

## Decisions still in force (don't re-debate)

| Decision                                                                                                      | Source                                              |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 3-tab canonical (Home / History / Profile); capture surfaces as Home banner                                   | `DELTA.html` divergence #1 resolved 2026-05-21      |
| Theme picker cut at MVP                                                                                       | `DO_NOT_BUILD_MVP.md` M14                           |
| Photo storage: app-internal only, no gallery, per-user partition, R2 incremental upload, 30-day local cleanup | Founder direction 2026-05-21 — scaffold landed 2b-1 |
| Location permission asked upfront on (auth)/permissions screen alongside Camera                               | Founder lock 2026-05-22 (Option B)                  |
| Sprint mode ON — no per-rev friend review, batch panel review at end of sprint                                | `feedback_supervisor_sprint_mode.md` (carried)      |
| All commits sign with `Co-Authored-By: Claude Opus 4.7 (1M context)`                                          | Convention from existing log                        |

## Discipline gates active

- `check_before_edit` on every code Write/Edit (Layer 1 pre-commit hook enforces).
- `check_before_plan` on every plan/persona/handoff Write/Edit (architecture evidence + source hierarchy required).
- `check_before_done` on every done-memo write (quality gate L3+ required to pass).
- Pre-commit eslint rule `axhy/require-derives` blocks exports without `@derives(ADR-NNNN)` or `@derives(master-plan §X.Y)` JSDoc.
- Pre-commit `docs/personas/` changes need `AXHY_FOUNDER_APPROVED=1`.

## Known caveats from 2b-1

- **Brain build (pgvector) is unavailable from this laptop.** `railway run -- pnpm --filter @axhy/ai-tools brain:build` fails `ENOTFOUND postgres.railway.internal` — the Railway CLI link may need re-establishing. Until fixed, `impactCheck()` returns empty; sessions must rely on direct file Reads + grep for locked-constraint checks.
- **Expo Web duplicate-tab quirk:** the Tabs navigator renders a faint duplicate tab row in the body area of step screens. Not present on real device per Expo Router behavior; ignore for scaffold work.
- **NO real I/O in `per-user-partition.ts` yet** — only path string helpers. `getWorkerCaptureDir` throws on Expo Web (documentDirectory is null). Callers must `Platform.OS` guard or check `CAPTURES_ROOT` before invoking. 2b-2 owns the write/read side.

## What to skip

Don't re-read the older Layer 1 / supervisor-sprint handoff chain (`README.md`, `STATUS.md` legacy sections, `ROADMAP.md`, the `2026-05-17-*` audit memos). They're carried forward but not load-bearing for slice 2b-2.

## Open assumptions for 2b-2

- `expo-camera@~17.0.10` is already installed (slice 1). Web fallback for camera capture during Playwright runs needs a stub or skipped-test marker.
- R2 signed-URL endpoint: backend route shape (`POST /worker/captures/upload-url`?) needs a quick founder decision on whether to make it visit-scoped vs photo-scoped. Default: visit-scoped, returns N URLs at once.
- Capture-state machine: simplest correct shape is `idle → on_step → submitted`. Step persistence to backend or local-only? Local-only is simpler for 2b-2; backend sync lands in 2b-3 Submit.

## First thing to do in next session

1. **Run `pnpm --filter @axhy/ai-tools run audit`** to confirm clean baseline.
2. **Read `WORKER_MVP_SLICE_2A_PLAN.md` §7** for sub-slice 2b-2 scope.
3. **Read this file's "Decisions still in force"** above so no re-debate.
4. **Investigate the Railway brain:build DNS issue.** Either re-link with `railway link` or accept it as a deferred known-issue.
5. **Start 2b-2** with the same shape as 2b-1: Phase 1 read existing camera + storage references, Phase 2 wire camera, Phase 3 R2 upload, Phase 4 review + state machine, Phase final screenshot capture + `check_before_done` + done memo.
