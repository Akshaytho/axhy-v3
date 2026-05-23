# Next Session — Worker MVP Sub-slice 2b-4 (30-day sweep + reinstall rehydration)

> **Read time: 3 minutes. Highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` and `MEMORY_V3.md` first, then proceed."

## Current commit baseline

Sub-slice `worker-d1-s2b-3-timer-submit` shipped 2026-05-23. Builds on the 2b-2 capture pipeline. All 10 tasks complete: shared Zod schemas, backend submit service + routes, 7 real-DB integration tests, mobile api-submit.ts client, real timer screen (count-up + GPS + keep-awake), submit + verify-polling screen, and QA Playwright script with SPA-nav fix.

## What's shipped in 2b-3

- **Backend:**
  - `apps/backend/src/lib/r2-presign.ts` — `buildObjectKey` parameter widened from `UploadUrlFile` to `Pick<UploadUrlFile, 'phase' | 'index' | 'contentType'>` so the submit service can reconstruct keys without `fileSize`. Resolves deferred item #3 from 2b-2 (server-side key reconstruction).
  - `apps/backend/src/lib/services/worker-submit-service.ts` — validates worker ownership + PHOTOS_PENDING guard, creates `VisitPhoto` rows (translating Zod lowercase `'before'/'after'` → Prisma `'BEFORE'/'AFTER'`), updates visit to `AWAITING_VERIFICATION`. Returns discriminated union `{ kind: 'OK' | 'NOT_FOUND' | 'WRONG_WORKER' | 'WRONG_STATE' }`. Resolves deferred item #5 from 2b-2 (phase case mismatch).
  - `apps/backend/src/routes/worker-submit.ts` — `POST /worker/visits/:visitId/submit` (WORKER-only, `withTenantContext` wrapper, maps result kinds to 200/403/404/409/400) + `GET /worker/visits/:visitId/verify-status` (WORKER-only, returns visitState + photos array with aiVerifyStatus).
  - `apps/backend/src/server.ts` — registered `registerWorkerSubmitRoutes(app)`.
  - `apps/backend/test/worker-submit.test.ts` — 7 real-DB integration tests (unauthenticated/wrong-role/wrong-worker/wrong-state/empty-photos/happy-path/verify-status). Requires `AXHY_DB_URL` / `DATABASE_PUBLIC_URL` / `DATABASE_URL` — run via `railway run -- pnpm --filter @axhy/backend test:integration`.
- **Mobile:**
  - `apps/mobile/lib/api-routes.ts` — added `workerSubmit` + `workerVerifyStatus` entries to `API_ROUTES`.
  - `apps/mobile/lib/api-submit.ts` — `submitVisit()` + `fetchVerifyStatus()` typed against shared Zod schemas.
  - `apps/mobile/app/(worker)/capture/[visitId]/timer.tsx` — real count-up MM:SS timer (setInterval, 1 s tick). `KeepAwake` inner component conditionally mounts on native (expo-keep-awake, tag `'axhy-timer'`). GPS sampled at mount and on "Done cleaning" tap via expo-location (Platform.OS guard, console.log only — no backend column yet, deferred to 2b-4+).
  - `apps/mobile/app/(worker)/capture/[visitId]/submit.tsx` — state machine `idle → submitting → polling → done | error`. Reads `r2UploadQueue.snapshot()` filtered to visitId + status='done'. Polls `fetchVerifyStatus` every 3 s (max 40 polls). `mountedRef` guards state updates on unmount.
- **Shared:**
  - `packages/shared-schema/src/zod/worker-submit.ts` — `WorkerSubmitPhotoSchema`, `WorkerSubmitRequestSchema`, `WorkerSubmitResponseSchema`, `VerifyStatusPhotoSchema`, `VerifyStatusResponseSchema`.
  - `packages/shared-schema/src/index.ts` — re-exports `./zod/worker-submit.js`.
- **QA:** `apps/mobile/scripts/qa-worker-d1-s2b-3-timer-submit.ts` — Playwright script (gitignored). SPA-nav fix: navigates between capture steps via button clicks (`page.getByRole('button', { name: ... }).click()`) instead of `page.goto()`, keeping the in-memory `r2UploadQueue` alive. Intercepts: `upload-urls` → fake presign, `mock-r2.dev PUT` → 200 OK, `submit` → fake AWAITING_VERIFICATION, `verify-status` → AWAITING_VERIFICATION on first call / VERIFIED on second. 10 screenshots.

## Deferred from 2b-3 — bring back for future slices

1. **Batch presigns** — carried from 2b-2. Mobile still sends single-file requests; backend supports up to 20/batch.
2. **`FileSystem.uploadAsync` streaming PUT** — carried from 2b-2. Current path loads full file into JS heap.
3. **GPS persist + motion guard** — timer.tsx logs GPS coords at start/end but no backend column yet. Motion check (accelerometer) deferred to 2b-4+.
4. **Upload-queue persistence** — r2UploadQueue is still in-memory only. 30-day local sweep + reinstall rehydration land in 2b-4.
5. **`MAX_PHOTO_BYTES` collision** — shared-schema exports 20MB; mobile uploads export 8MB. No consumer imports both today; rename if needed.
6. **Upload-queue `emit()` churn on retry path** — cosmetic, deferred.

## Decisions still in force (don't re-debate)

| Decision                                                                                                      | Source                                              |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 3-tab canonical (Home / History / Profile); capture surfaces as Home banner                                   | `DELTA.html` divergence #1 resolved 2026-05-21      |
| Theme picker cut at MVP                                                                                       | `DO_NOT_BUILD_MVP.md` M14                           |
| Photo storage: app-internal only, no gallery, per-user partition, R2 incremental upload, 30-day local cleanup | Founder direction 2026-05-21 — pipeline landed 2b-2 |
| Location permission asked upfront on (auth)/permissions screen alongside Camera                               | Founder lock 2026-05-22 (Option B)                  |
| Sprint mode ON — no per-rev friend review, batch panel review at end of sprint                                | `feedback_supervisor_sprint_mode.md` (carried)      |
| All commits sign with `Co-Authored-By: Claude Opus 4.7 (1M context)`                                          | Convention from existing log                        |

## Discipline gates active

- `check_before_edit` on every code Write/Edit (Layer 1 pre-commit hook enforces).
- `check_before_plan` on every plan/persona/handoff Write/Edit (architecture evidence + source hierarchy required).
- `check_before_done` on every done-memo write (quality gate L3+ required to pass).
- Pre-commit eslint rule `axhy/require-derives` blocks exports without `@derives(ADR-NNNN)` or `@derives(master-plan §X.Y)` JSDoc.
- Pre-commit `docs/personas/` changes need `AXHY_FOUNDER_APPROVED=1`.

## Known caveats carried forward

- **Brain build works locally via `.env.local`.** `axhy-v3/.env.local` (gitignored, repo root) holds `DATABASE_PUBLIC_URL` + `OPENAI_API_KEY`. Run: `set -a && source .env.local && set +a && pnpm --filter @axhy/ai-tools brain:build`. Confirmed working 2026-05-23.
- **Expo Web duplicate-tab quirk:** the Tabs navigator renders a faint duplicate tab row in the body area of step screens. Not present on real device; ignore for scaffold work.
- **Backend integration tests require Railway DB.** Run via `railway run -- pnpm --filter @axhy/backend test:integration` or with `.env.local` exported.

## What starts next: sub-slice 2b-4 (30-day local sweep + reinstall rehydration)

**Scope:**

1. 30-day photo sweep — delete `per-user-partition` photos older than 30 days on app resume (run once per day, keyed by last-sweep timestamp in AsyncStorage).
2. Reinstall rehydration — on app cold-start, scan `per-user-partition` for photos whose upload status is unknown, attempt re-upload, populate queue from local state.
3. Persist r2UploadQueue state to AsyncStorage so in-progress uploads survive app kills.
4. GPS persist — once a backend column exists, wire the timer.tsx GPS samples to the submit payload.

## First thing to do in next session

1. **Run `pnpm --filter @axhy/ai-tools run audit`** to confirm clean baseline.
2. **Run brain:build** to load semantic memory: `set -a && source .env.local && set +a && pnpm --filter @axhy/ai-tools brain:build`.
3. **Read this file's "Deferred from 2b-3"** list so carry-forward items don't get re-discovered.
4. **Read `WORKER_MVP_SLICE_2A_PLAN.md` §7** for sub-slice 2b-4 scope.
5. **Start 2b-4** per the plan.
