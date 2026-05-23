# Done Memo — worker-d1-s2b-3-timer-submit

**Date:** 2026-05-23
**Slice:** `worker-d1-s2b-3`
**Quality gate:** L3 Senior (0 CRITICAL, 2 HIGH remaining — both false positives)
**Commits:**

- `890eb53` feat: shared Zod schemas + r2-presign widening + submit service + routes + mobile client + timer + submit screens (T1–T8)
- `61c406d` fix(backend): resolve Worker DB row from userId in submit + verify-status routes + handoff update
- `c08eea8` fix(mobile): console.log → console.warn for GPS telemetry in timer.tsx
- `b4ab563` refactor(backend): requireWorkerRole middleware + quality gate fixes
- `64e58a5` fix(backend): try/catch + HTTP_FORBIDDEN constant in requireWorkerRole
- `c561f9b` refactor(backend): extract route paths to ROUTES constant in worker-submit
- `dc58eb5` fix: add try/catch to submitVisit service and api-submit client functions

---

## What shipped

### Backend

- `packages/shared-schema/src/zod/worker-submit.ts` — `WorkerSubmitPhotoSchema`, `WorkerSubmitRequestSchema`, `WorkerSubmitResponseSchema`, `VerifyStatusPhotoSchema`, `VerifyStatusResponseSchema`
- `packages/shared-schema/src/index.ts` — re-exports worker-submit schemas
- `apps/backend/src/lib/r2-presign.ts` — `buildObjectKey` parameter widened from `UploadUrlFile` to `Pick<UploadUrlFile, 'phase' | 'index' | 'contentType'>` (server-side key reconstruction, resolves 2b-2 deferred #3)
- `apps/backend/src/lib/services/worker-submit-service.ts` — `submitVisit()`: validates ownership + PHOTOS_PENDING guard, bulk-inserts VisitPhoto rows (lowercase→uppercase phase translation), updates Visit to AWAITING_VERIFICATION, returns discriminated union `{ kind: 'OK' | 'NOT_FOUND' | 'WRONG_WORKER' | 'WRONG_STATE' }`
- `apps/backend/src/routes/worker-submit.ts` — `POST /worker/visits/:visitId/submit` + `GET /worker/visits/:visitId/verify-status`, both WORKER-gated via `requireWorkerRole` preHandler, ROUTES constant for path strings
- `apps/backend/src/server.ts` — registered `registerWorkerSubmitRoutes(app)`
- `apps/backend/src/middleware/tenant-context.ts` — added `requireWorkerRole` preHandler combining `requireAuth` + WORKER role assertion; `HTTP_FORBIDDEN` constant; try/catch
- `apps/backend/test/worker-submit.test.ts` — 7 real-DB integration tests: requests without token (401), SUPERVISOR (403 WRONG_ROLE), wrong worker (403 WRONG_WORKER), wrong state (409 WRONG_STATE), empty photos (400 BAD_INPUT), happy path (200 AWAITING_VERIFICATION), verify-status (200)

### Mobile

- `apps/mobile/lib/api-routes.ts` — added `workerSubmit` + `workerVerifyStatus` entries
- `apps/mobile/lib/api-submit.ts` — `submitVisit()` + `fetchVerifyStatus()` typed against shared Zod schemas
- `apps/mobile/app/(worker)/capture/[visitId]/timer.tsx` — real count-up MM:SS timer (setInterval 1 s tick); `KeepAwake` component (expo-keep-awake, tag `axhy-timer`, native only); GPS sampled at mount + Done tap via expo-location (console.warn, no backend column yet)
- `apps/mobile/app/(worker)/capture/[visitId]/submit.tsx` — state machine `idle → submitting → polling → done | error`; reads r2UploadQueue filtered to visitId+status=done; polls fetchVerifyStatus every 3 s (max 40 polls); mountedRef guards unmount

---

## Key bug caught and fixed

`worker-submit.ts` originally compared `auth.userId` (User table row ID from JWT) to `visit.workerId` (Worker table row ID — different UUID namespace). This caused 3/7 integration tests to return 403 WRONG_WORKER instead of correct responses. Fix: `prisma.worker.findFirst({ where: { userId: auth.userId, companyId: auth.companyId } })` in both route handlers, mirroring the pattern at `worker-today-service.ts:92`.

---

## Quality gate notes

The `hardcoded_route` HIGH fires on the ROUTES constant string values themselves (lines 26–27 of worker-submit.ts) — the checker flags `'/worker/` anywhere in the file including inside the constant declaration. This is a calibration gap in the quality gate: it asks for a ROUTES constant but then flags the constant's own values. Noted as known false positive.

The `unhandled_async` HIGH fires on `submit.tsx:60` (handleSubmit) — the function has try/catch at lines 73-83 but not as the very first statement. Quality gate does not scan for try/catch within the function body.

---

## Deferred to 2b-4+

1. GPS coords persist to backend column (timer.tsx logs at start+end, no DB column yet)
2. r2UploadQueue AsyncStorage persistence (in-memory only, survives app kill)
3. Batch presigns (single-file requests, backend supports up to 20/batch)
4. `FileSystem.uploadAsync` streaming PUT (current path loads full file into JS heap)
5. Motion guard (accelerometer check before GPS sample)

---

## Handoff

- `axhy-v3/handoff/NEXT_SESSION.md` — updated to 2b-4 scope
- `axhy-v3/handoff/STATUS.md` — 2b-3 marked DONE 2026-05-23
