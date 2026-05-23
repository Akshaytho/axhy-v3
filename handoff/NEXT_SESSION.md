# Next Session — Worker MVP Sub-slice 2b-3 (timer + Submit + Verify polling)

> **Read time: 3 minutes. Highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` and `MEMORY_V3.md` first, then proceed."

## Current commit baseline

Sub-slice `worker-d1-s2b-2-capture-pipeline` shipped on `main` 2026-05-23. Builds on the 2b-1 capture scaffold. The 2b-2 commit also rolled in 6 bug fixes surfaced during simplify-skill code review + Playwright QA (see "Bug fixes shipped with 2b-2" below).

## What's shipped in 2b-2

- **Backend:**
  - `apps/backend/src/lib/r2-presign.ts` — Cloudflare R2 batch presign helper (S3-compat SDK with `requestChecksumCalculation: 'WHEN_REQUIRED'` workaround). ContentLength intentionally not signed — R2 rejects body-length mismatches at PUT time.
  - `apps/backend/src/routes/worker-captures.ts` — `POST /worker/captures/upload-urls`, WORKER-only, tenant-exempt (workerId-keyed). Returns N presigned PUT URLs at once; backend supports `MAX_PHOTOS_PER_BATCH = 20`.
  - `apps/backend/test/worker-captures.test.ts` — 5 real-DB + real-R2 integration tests (auth / role gate / bad input / empty files / happy path). Falls back to the 503 R2_NOT_CONFIGURED contract assertion when R2 env vars are absent.
- **Mobile:**
  - `apps/mobile/components/worker/capture/CameraView.tsx` — expo-camera native wrapper + web Simulate-capture stub. Logs `console.warn` if `takePictureAsync` returns no URI.
  - `apps/mobile/components/worker/capture/PhasePhotoCapture.tsx` — shared 3-photo surface for before + after phases. Synchronous slot reservation via `reservedCountRef` (race-free). `KeepDeviceAwake` inner component conditionally mounted on native only.
  - `apps/mobile/components/worker/capture/PhotoGridReview.tsx` — 6-tile review grid with per-tile upload status + retake.
  - `apps/mobile/lib/r2-upload-queue.ts` — module-singleton serial upload queue with exponential backoff. **In-memory only**; persistence lands in 2b-4.
  - `apps/mobile/lib/api-capture.ts` — typed `requestUploadUrls(visitId, files)` client.
  - `apps/mobile/lib/storage/per-user-partition.ts` — I/O layer added (`ensureDir`, `writePhoto`, `listPhotos`, `deletePhoto`) using expo-file-system v19 class API; web no-op fallback preserved from 2b-1.
  - `apps/mobile/app/(worker)/capture/[visitId]/{before-photos,after-photos,review}.tsx` — wired the 2b-1 scaffold step screens to the new capture components.
- **Shared:**
  - `packages/shared-schema/src/zod/worker-captures.ts` — `PhotoPhaseSchema`, `UploadUrlsRequestSchema`, `UploadUrlsResponseSchema`, etc. Caps: 1–3 slot index, 1B–20MB fileSize, max 20 photos/batch.
  - `packages/state-machines/src/capture.ts` — `captureMachine` (xstate v5, IDLE → CAPTURING → SUBMITTED). Uses `assign()` for all context updates; 9 tests passing.
- **QA:** `apps/mobile/scripts/qa-worker-d1-s2b-2-capture-pipeline.ts` Playwright capture — 9 screenshots (camera-stub / 3-photos-captured / review-grid / placeholders). See "Known QA fidelity gap" below for one screen that under-tests.

## Bug fixes shipped with 2b-2

Surfaced during simplify-skill code review + Playwright QA, all bundled into this commit:

1. **xstate context mutation → `assign()`** (`capture.ts`) — previous transitions mutated `context.step` directly inside arrow-fn actions, bypassing xstate v5's immutable snapshot contract. Tests passed by accident (same object ref let subscribers see the mutation). Fix: replaced all four mutation sites with `assign()`.
2. **Slot-index race + stale closure in `PhasePhotoCapture.onCapture`** — two rapid shutter presses could read the same `captured.length` between `await writePhoto` and `setCaptured`, clobbering one slot. Fix: synchronous reservation via `reservedCountRef`; `useCallback` deps no longer include `captured.length` so the callback identity is stable. Also replaced the hardcoded `fileSize = 500_000` lie with `new File(localUri).size` (web stub keeps the default).
3. **R2 ContentLength signature mismatch** (`r2-presign.ts`) — `PutObjectCommand` was signing `ContentLength: file.fileSize`. R2 rejects with `SignatureDoesNotMatch` when actual body bytes ≠ signed value, which would happen on every real upload because mobile cannot reliably know the post-write file size in advance. Fix: dropped ContentLength from the signed command; the 20MB cap is still enforced upstream by the Zod schema.
4. **`INVALID_INPUT` → `BAD_INPUT`** (`worker-captures.ts` + test) — all 13 other worker routes return `{ error: 'BAD_INPUT', message: parsed.error.message }`; this route diverged. Now matches.
5. **Silent camera no-URI failure** (`CameraView.tsx`) — `takePictureAsync` returning no URI silently reset `capturing` with no log. Worker would tap shutter, nothing happens, no signal anywhere. Fix: `console.warn` with the raw result so device logs surface the issue.
6. **`useKeepAwake` web crash** (`PhasePhotoCapture.tsx`) — surfaced by Playwright QA: expo-keep-awake's Wake Lock acquisition is denied in headless Chromium, and Expo's RedBox renders a fullscreen dev-error overlay that intercepted pointer events for the Simulate-capture button on every capture screen. Fix: extracted a `KeepDeviceAwake` inner component (so the hook is still unconditional inside it), mounted only when `Platform.OS !== 'web'`. Production native behavior unchanged.

## Deferred from code review — bring back for 2b-3 / future

1. **Batch presigns** — mobile sends N single-file requests; backend already supports up to 20 per batch. Refactor in `r2-upload-queue.ts` to collect idle items per pump cycle and presign in one call.
2. **`FileSystem.uploadAsync` streaming PUT** — current path is `fetch(localUri).blob() → fetch(PUT, body: blob)`. Loads the full file into JS heap on every retry. Switch to expo-file-system's native upload (`uploadType: BINARY_CONTENT`) for memory + background-upload support.
3. **`objectKey` leak in presign response** — route returns `objectKey` to the client; a tampered client could claim arbitrary keys at Submit time. Either keep server-side and have Submit reconstruct by `(workerId, visitId, phase, index, contentType)` deterministically, or sign an opaque token.
4. **Extract `CaptureStepShell` slot pattern** — `PhasePhotoCapture` and `review.tsx` each re-implement the Back / step-badge / Next chrome inline. Drift-prone. Extend the shell with a children/body slot so both can mount their body content while inheriting chrome + nav.
5. **`PhotoPhase` case mismatch** — Zod uses lowercase `'before' | 'after'`; Prisma `VisitPhoto.side` is `BEFORE | AFTER`. Pick one at the 2b-3 Submit boundary (translate at the route handler when writing rows).
6. **`MAX_PHOTO_BYTES` collision** — `packages/shared-schema/...zod/worker-captures.ts` exports 20MB; `apps/mobile/lib/uploads/photo-upload.ts` exports 8MB (chat). Theoretical only — no file imports both today. Rename one to disambiguate if a consumer ever needs both.
7. **Upload-queue `emit()` churn on retry path** — `uploadOne` emits twice per retry (once with `uploading + lastError` mid-state, once after sleep with `idle`). Cosmetic; gated by the serial-by-design queue.

## Known QA fidelity gap — fix before next visual verification

The Playwright QA script uses `gotoRoute(page, '/(worker)/capture/.../<step>')` between every capture step. `page.goto` does a full HTTP reload and wipes the in-memory `r2UploadQueue` (module singleton). On real devices the worker SPA-navigates between before / after / review within one app session, so the queue persists; in QA it doesn't. Net effect: the review-grid screenshot shows all 6 tiles as "Not captured" even though the simulate-capture clicks did fire on the previous pages. The footer button visually obscures the bottom two tiles' status text — misleading at first glance.

**Action for next session before 2b-3 visual verification:** replace `gotoRoute(page, '/...')` between capture steps with SPA navigation — `await page.getByRole('button', { name: /^Next$/ }).click()`. The qr-scan + timer scaffold screens between phases need their own Next-button locators if they don't already render one. With SPA nav the queue persists and the review screenshot will show the actual populated state.

**Note:** the empty "Not captured" state IS by design until 2b-4 ships reinstall rehydration (see `r2-upload-queue.ts` header comment) — the QA just makes the limitation more visible than it would be in practice. Production native is unaffected.

## What starts next: sub-slice 2b-3 (cleaning timer + Submit + Verify polling)

**Scope (from `WORKER_MVP_SLICE_2A_PLAN.md §7`):**

1. Cleaning-timer step screen — countdown / count-up timer, GPS sample at start + end, motion check.
2. Submit step — writes `VisitPhoto` rows from the captured slots (translates lowercase Zod phase → uppercase Prisma `side` per deferred item #5); fires `visitMachine.PHOTOS_UPLOADED`; reconstructs object keys server-side per deferred item #3.
3. Verify polling — admin/supervisor side gets the photos for review; mobile polls a status endpoint to know when Verify completes.
4. While we're here: fix the QA navigation per "Known QA fidelity gap" so the populated review grid screenshot becomes load-bearing again.

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

- **Brain build (pgvector) is unavailable from this laptop.** `railway run -- pnpm --filter @axhy/ai-tools brain:build` fails `ENOTFOUND postgres.railway.internal` from the local network — Railway CLI link may need re-establishing. Until fixed, `impactCheck()` returns empty; sessions must rely on direct file Reads + grep for locked-constraint checks.
- **Expo Web duplicate-tab quirk:** the Tabs navigator renders a faint duplicate tab row in the body area of step screens. Not present on real device per Expo Router behavior; ignore for scaffold work.

## First thing to do in next session

1. **Run `pnpm --filter @axhy/ai-tools run audit`** to confirm clean baseline.
2. **Read this file's "Deferred from code review" + "Known QA fidelity gap"** so the carry-forward items don't get re-discovered.
3. **Read `WORKER_MVP_SLICE_2A_PLAN.md` §7** for sub-slice 2b-3 scope (timer + Submit + Verify polling).
4. **Start 2b-3** with the QA-script fix first so visual verification is honest from the start, then timer screen, then Submit + Visit state transition, then Verify polling.
