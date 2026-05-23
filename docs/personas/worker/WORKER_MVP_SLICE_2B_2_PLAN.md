# Sub-slice 2b-2 — Worker MVP Photo Capture Pipeline

Builds on sub-slice 2b-1 (capture-flow scaffold). Wires the real camera, persists photos to per-user partition, uploads incrementally to Cloudflare R2 via presigned URLs, adds the local `captureMachine`, and renders the 6-tile review grid with retake-per-photo.

**Bucket:** `axhy-worker-photos` (Cloudflare R2, account `a24d2fa15ed41fab6a27bbeaf526db7c` — same account as v2, separate bucket). Endpoint: `https://a24d2fa15ed41fab6a27bbeaf526db7c.r2.cloudflarestorage.com/axhy-worker-photos`. Env vars added to v3 Railway 2026-05-22.

## Source hierarchy

1. `docs/personas/worker/WORKER_MVP_SLICE_2A_PLAN.md` §7 — sub-slice 2b-2 scope row.
2. `handoff/NEXT_SESSION.md` — 6 scope items + open assumptions.
3. `_archive/codebases/eclean-v2-b2b/backend/src/modules/media/` — proven R2 pattern (S3Client singleton, presign batch, x-amz-checksum SDK quirk).
4. `apps/mobile/lib/storage/per-user-partition.ts` — path helpers from 2b-1; I/O lands here in 2b-2.
5. `packages/state-machines/src/{visit,index}.ts` — `captureMachine` joins here; does NOT touch `visitMachine`.
6. `packages/shared-schema/prisma/schema.prisma` — `VisitPhoto` exists from Phase B migration; 2b-2 does NOT write to it (2b-3 Submit owns the DB row).
7. `docs/locked/development-code-standards.md`, `development-anti-cheating.md`, `operational-invariants.md`.

## Scope (6 items, from NEXT_SESSION.md)

1. Wire `expo-camera` into `before-photos.tsx` and `after-photos.tsx` — 3 photos per phase, internal storage only.
2. Per-user-partition I/O — `ensureDir`, `writePhoto`, `listPhotos`, `deletePhoto`. Web no-op fallback.
3. Incremental R2 upload — kicks off as each photo lands, not on Submit. Retry policy + background-tolerant queue.
4. Photo grid review on `review.tsx` with retake-per-photo affordance.
5. `captureMachine` in `packages/state-machines/src/` — local UI progress (idle → on_step → submitted). Does NOT touch `visitMachine`.
6. Backend `/worker/captures/upload-urls` — batch presign route. Mobile uploads directly to R2 with `PUT`. Visit-scoped (returns N URLs in one request).

## Architecture evidence

- **State machines:** `captureMachine` is LOCAL-only (no backend sync). `visitMachine` `PHOTOS_UPLOADED` event fires in 2b-3 Submit, not 2b-2.
- **VisitPhoto:** schema exists from Phase B migration `20260508_phase_b_domain`. 2b-2 does NOT write rows; rows are created in 2b-3 Submit after photos are confirmed in R2.
- **R2 pattern:** ported from `_archive/codebases/eclean-v2-b2b/backend/src/modules/media/media.service.ts`. Same lazy S3Client singleton, same `requestChecksumCalculation: 'WHEN_REQUIRED'` workaround for Cloudflare's signature rejection on auto-injected `x-amz-checksum-*` params, same Zod schema shape (≤20MB, `image/jpeg|png|webp`).
- **Object-key prefix:** `v3-captures/{workerId}/{visitId}/{phase}-{NN}.jpg` — namespaced separately from v2's `uploads/` prefix even though the bucket is different.
- **Auth pattern:** `requireAuth` middleware + WORKER role gate; `workerId` derived from `req.auth.userId`, never accepted from client body (D5 tenant isolation).

## §1 — File list

### Backend — create

- `apps/backend/src/lib/r2-presign.ts` — S3Client singleton + `generateBatchUploadUrls(workerId, visitId, files)` helper.
- `apps/backend/src/routes/worker-captures.ts` — POST `/worker/captures/upload-urls`.
- `apps/backend/src/routes/worker-captures.test.ts` — integration test (real R2 + real Postgres on Railway sandbox: presigned URL is returned and is a valid `r2.cloudflarestorage.com` URL).

### Backend — modify

- `apps/backend/src/server.ts` — register `worker-captures` routes.
- `apps/backend/package.json` — add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (latest stable).

### Shared schema — create

- `packages/shared-schema/src/zod/worker-captures.ts` — `UploadUrlsRequestSchema`, `UploadUrlsResponseSchema` (Zod, exported via shared-schema index for backend + mobile reuse).

### State machines — create

- `packages/state-machines/src/capture.ts` — `captureMachine` (`idle → on_step → submitted` with step-position context).
- `packages/state-machines/src/capture.test.ts` — transition tests.

### State machines — modify

- `packages/state-machines/src/index.ts` — export `captureMachine` + types.

### Mobile — create

- `apps/mobile/components/worker/capture/CameraView.tsx` — wraps `expo-camera` with capture-on-tap; returns `{ uri, width, height }` to caller; renders web-stub placeholder when `Platform.OS === 'web'`.
- `apps/mobile/components/worker/capture/PhotoGridReview.tsx` — 6-tile grid (3 before + 3 after) with retake affordance per tile.
- `apps/mobile/lib/r2-upload-queue.ts` — incremental upload queue. Persists state in `expo-file-system`; retries on failure with exponential backoff; surfaces per-photo status.
- `apps/mobile/lib/api-capture.ts` — `requestUploadUrls(visitId, files)` mobile API client.

### Mobile — modify

- `apps/mobile/lib/storage/per-user-partition.ts` — add I/O: `ensureDir(workerId, visitId)`, `writePhoto(workerId, visitId, phase, index, sourceUri)`, `listPhotos(workerId, visitId, phase)`, `deletePhoto(workerId, visitId, phase, index)`. Web no-op fallback when `CAPTURES_ROOT` is `null`.
- `apps/mobile/app/(worker)/capture/[visitId]/before-photos.tsx` — replace placeholder with `CameraView` + photo counter + `writePhoto` + enqueue upload.
- `apps/mobile/app/(worker)/capture/[visitId]/after-photos.tsx` — same as before-photos with `phase='after'`.
- `apps/mobile/app/(worker)/capture/[visitId]/review.tsx` — replace placeholder with `PhotoGridReview`; retake deletes local file + re-enqueues.
- `apps/mobile/lib/api-routes.ts` — add `API_ROUTES.workerCapturesUploadUrls`.

### QA — create

- `scripts/qa-worker-d1-s2b-2-capture-pipeline.ts` — Playwright capture (web stub of camera; verify grid + retake UX).

### Handoff — modify (at slice end)

- `handoff/NEXT_SESSION.md` — point at 2b-3 (timer + GPS + motion + Submit).
- `handoff/STATUS.md` — mark 2b-2 DONE, advance row.

## §2 — Phases (atomic; each ends with `pnpm typecheck` + `pnpm lint` + tests green)

**Phase 1 — Backend R2 plumbing**

- Install `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- Add `packages/shared-schema/src/zod/worker-captures.ts` (request + response schemas).
- Write `apps/backend/src/lib/r2-presign.ts`.
- Write `apps/backend/src/routes/worker-captures.ts`.
- Register in `server.ts`.
- Real-DB integration test against Railway sandbox: presign returns valid `r2.cloudflarestorage.com` URL with correct bucket + key prefix.

**Phase 2 — `captureMachine` in @axhy/state-machines**

- Write `capture.ts` + `capture.test.ts`.
- Add export to `index.ts`.
- Vitest pure transition tests (no DB).

**Phase 3 — per-user-partition.ts I/O**

- Add `ensureDir`, `writePhoto`, `listPhotos`, `deletePhoto` to existing file.
- Web no-op fallback per existing `CAPTURES_ROOT === null` guard.
- Vitest unit tests against `expo-file-system` (mocked module-level — `expo-file-system` itself can be jest-mocked since it's not a service-layer dep).

**Phase 4 — Mobile camera wire-up**

- Build `CameraView` component with native + web-stub modes.
- Replace `before-photos.tsx` + `after-photos.tsx` placeholders.
- Visual verify via Playwright web (stub) + manual real-device check.

**Phase 5 — R2 upload queue**

- Build `r2-upload-queue.ts` with persistent state under `${CAPTURES_ROOT}/queue.json`.
- Exponential backoff (1s, 2s, 4s, 8s, max 60s).
- Surface per-photo status to consumers.
- Wire into before/after-photos screens.

**Phase 6 — Review screen + retake**

- Build `PhotoGridReview` component (6 tiles).
- Replace `review.tsx` placeholder.
- Retake: `deletePhoto` + re-navigate to capture step (preserving step position via `captureMachine`).

**Phase 7 — Verification + done memo**

- Playwright capture (web stub on camera).
- `check_before_done` quality gate.
- Write done memo.

## §3 — Open assumption resolutions (this plan decides)

| Open assumption (from NEXT_SESSION.md)                     | This plan's decision                                                                                                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 signed-URL endpoint shape: visit-scoped vs photo-scoped | **Visit-scoped batch.** `POST /worker/captures/upload-urls` accepts `{ visitId, files: [...] }`, returns N URLs in one call. Mirrors v2's `/media/presign-batch` (max 20 per call). |
| `captureMachine` persistence: local-only vs backend sync   | **Local-only.** `captureMachine` is UI progress; backend sync lands in 2b-3 Submit. Simpler shape for 2b-2.                                                                         |
| Web camera fallback                                        | **Web-stub placeholder** on `CameraView`. Playwright exercises the grid + retake UX with seeded local files via direct `writePhoto` calls.                                          |

## §4 — Hard rules / D-rules carryover

- **D1 schema is law** — `VisitPhoto` exists; 2b-2 does not write it.
- **D2 state machines are invariants** — `captureMachine` has real tests, NOT stubs.
- **D5 tenant isolation** — `workerId` from `req.auth.userId`, never from body.
- **D7 errors specific** — `R2_NOT_CONFIGURED`, `OBJECT_KEY_INVALID`, `FILE_TOO_LARGE`, `BATCH_TOO_LARGE`.
- **D9 audit everything** — structured log per request: `{ companyId, workerId, visitId, objectKey, fileSize, contentType }`.
- **D10 one tx or none** — presign route is read-only; no transaction.
- **Anti-cheat 1** — no `TODO` in committed code.
- **Anti-cheat 4** — no optimistic frontend; queue marks photo as `pending` until R2 `PUT` returns 200.

## §5 — Risks + rollback

| Risk                                                                   | Mitigation                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare R2 SDK quirk (auto-checksum middleware rejects signed URLs) | Lifted from v2 — `requestChecksumCalculation: 'WHEN_REQUIRED'` + `responseChecksumValidation: 'WHEN_REQUIRED'` on `S3Client`.        |
| Mobile retry-storm overwhelms backend if R2 is down                    | Exponential backoff in upload queue (1s, 2s, 4s, 8s, max 60s). Backend rate-limit already applies.                                   |
| Expo Web cannot exercise `expo-camera`                                 | Web-stub on `CameraView`; Playwright verifies grid + retake UX with seeded fixture files written via `writePhoto` directly.          |
| Founder rotates R2 keys                                                | Keys are env vars in Railway; rotation is a Railway-only change, no code edit.                                                       |
| Object-key collision                                                   | Bucket dedicated to v3 (`axhy-worker-photos`). Prefix `v3-captures/{workerId}/{visitId}/{phase}-{NN}.jpg` is workerId-scoped on top. |

**Rollback:** revert the slice commit. Existing 2b-1 scaffold (placeholders) is left intact under git history. Backend route removal is non-destructive (no DB writes happened in this slice).

## §6 — Stop conditions

- Any phase fails `pnpm typecheck` or `pnpm lint` → stop, fix.
- `check_before_edit` blocks → fix the offending intent or refactor.
- Playwright screenshot diverges visibly from R6 tokens → stop, panel review, fix tokens first.
- R2 `PUT` returns anything other than 200 → log + retry per queue policy; do NOT swallow.
- `captureMachine` transition test fails → stop, fix the machine before any mobile wire-up.

## §7 — Coverage matrix (target for done-memo)

| Scope item                        | Verification                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. expo-camera wired              | Playwright screenshot of before-photos with web stub placeholder.                          |
| 2. per-user-partition I/O         | Vitest unit tests: `ensureDir` creates dir; `writePhoto` persists; `listPhotos` returns N. |
| 3. Incremental R2 upload          | Integration: presign call returns valid URL; mobile `PUT` succeeds (manual real-device).   |
| 4. Photo grid review + retake     | Playwright screenshot of review screen with 6 tiles.                                       |
| 5. `captureMachine`               | Vitest transition tests: `idle → on_step → submitted`.                                     |
| 6. `/worker/captures/upload-urls` | Integration test (real-DB): WORKER role required; returns batch of presigned URLs.         |

**Status:** 2b-2 plan APPROVED 2026-05-22 (founder confirmed bucket + endpoint in chat). Phase 1 begins next.
