# MAP — worker-screens (LIVING file — feature level)

> Editable across walks. Next walk reads THIS instead of re-reading the codebase.
> Scope: the full worker persona surface — onboarding (OTP→permissions→consent) → home → capture flow → visit detail → history → profile → leave request.

**Created:** 2026-06-10 23:45 IST · **Last verified against code:** 2026-06-10 23:45 IST (by walk [2026-06-10-2345](2026-06-10-2345/)) · **Verified at commit:** `02eae2f`

## 1. Footprint — files this feature touches (THE staleness list)

Any commit touching these paths makes the latest walk STALE.

| Kind          | Path                                                                                                                                                                                           | Note                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| screen        | apps/mobile/app/index.tsx                                                                                                                                                                      | entry redirect (auth/role routing)                              |
| screen        | apps/mobile/app/(auth)/phone.tsx, otp.tsx, permissions.tsx, consent.tsx, \_layout.tsx                                                                                                          | onboarding                                                      |
| screen        | apps/mobile/app/(worker)/\_layout.tsx                                                                                                                                                          | worker stack                                                    |
| screen        | apps/mobile/app/(worker)/(tabs)/\_layout.tsx, index.tsx, capture-launcher.tsx, history.tsx, profile.tsx                                                                                        | tabs (history tab HIDDEN — href: null at \_layout.tsx:96)       |
| screen        | apps/mobile/app/(worker)/capture/\_layout.tsx + capture/[visitId]/{qr-scan, before-photos, before-photos-review, timer, after-photos, after-photos-review, review, submit}.tsx                 | 8-step capture flow                                             |
| screen        | apps/mobile/app/(worker)/visit/\_layout.tsx, visit/[id].tsx                                                                                                                                    | visit detail                                                    |
| screen        | apps/mobile/app/(worker)/leave-request.tsx                                                                                                                                                     | self-service leave                                              |
| component     | apps/mobile/components/worker/ (AssignmentCard, NextSiteCard, ResumeCaptureBanner, StatCard, StateBadge, SyncPill, TimelineRow, TimerRing, WCard, WorkerDrawer, HomeBellIcon)                  |                                                                 |
| component     | apps/mobile/components/worker/capture/ (CameraView, CaptureStepShell, PhasePhotoCapture, PhaseReview, PhotoGridReview)                                                                         |                                                                 |
| client lib    | apps/mobile/lib/api.ts, api-routes.ts, auth-store.ts, auth-pending-phone.ts                                                                                                                    | fetch + token core                                              |
| client lib    | apps/mobile/lib/api-capture.ts, api-submit.ts, api-lifecycle.ts, api-leave.ts, capture-flow.ts, capture-retake-state.ts, r2-upload-queue.ts, worker-today-helpers.ts                           | feature libs                                                    |
| backend route | apps/backend/src/routes/auth.ts, auth-refresh.ts, me.ts                                                                                                                                        | login/refresh/profile                                           |
| backend route | apps/backend/src/routes/worker-today.ts, worker-visit.ts, worker-history.ts, worker-captures.ts, worker-submit.ts, worker-lifecycle.ts, worker-consent.ts                                      | worker reads/writes                                             |
| backend route | apps/backend/src/routes/leave-requests.ts                                                                                                                                                      | POST self-leave (decide paths belong to supervisor/HR features) |
| service       | apps/backend/src/lib/services/worker-today-service.ts, worker-submit-service.ts, worker-lifecycle-service.ts, worker-otp-verified-service.ts, leave-request-service.ts, refresh-token-store.ts |                                                                 |
| lib/helper    | apps/backend/src/lib/r2-presign.ts, otp-store.ts, otp-bypass.ts, whatsapp-otp.ts, jwt.ts, worker-rate-limits.ts, audit-event.ts, outbox.ts, ist-date.ts, effective-responsibility.ts           |                                                                 |
| middleware    | apps/backend/src/middleware/tenant-context.ts (requireWorkerRole, resolveWorkerFromAuth, GUC wrappers)                                                                                         |                                                                 |
| dispatcher    | apps/backend/src/dispatcher/handlers/ai.ts (ai.verify) + dispatcher/index.ts                                                                                                                   | verification loop                                               |
| state machine | packages/state-machines/src/visit.ts, worker.ts, capture.ts                                                                                                                                    |                                                                 |
| shared schema | packages/shared-schema/prisma/schema.prisma (models below) + zod worker/auth/leave inputs                                                                                                      |                                                                 |

## 2. API surface (from apps/mobile/lib/api-routes.ts — verified 2026-06-10)

| Route                            | Method | Called from                     | Auth gate                                                       |
| -------------------------------- | ------ | ------------------------------- | --------------------------------------------------------------- |
| /auth/otp/request                | POST   | (auth)/phone                    | public (per-phone 3/15min)                                      |
| /auth/otp/verify                 | POST   | (auth)/otp                      | public (NO per-phone attempt cap — known gap S1)                |
| /auth/sign-out                   | POST   | WorkerDrawer sign-out           | refresh token                                                   |
| /me                              | GET    | entry routing / profile         | requireAuth                                                     |
| /worker/consent                  | POST   | (auth)/consent                  | requireWorkerRole, 10/min                                       |
| /worker/today                    | GET    | (tabs)/index home               | requireWorkerRole, 60/min — **RLS-bare (activation gap)**       |
| /worker/visits/:id               | GET    | visit/[id]                      | requireWorkerRole — **RLS-bare**                                |
| /worker/history                  | GET    | (tabs)/history                  | requireWorkerRole — **RLS-bare; screen is ORPHANED**            |
| /worker/captures/upload-urls     | POST   | capture photos steps            | requireWorkerRole, 120/min                                      |
| /worker/captures/upload          | POST   | upload proxy fallback           | requireWorkerRole, 120/min                                      |
| /worker/visits/:id/clock-in      | POST   | timer entry                     | requireWorkerRole                                               |
| /worker/visits/:id/clock-out     | POST   | timer exit                      | requireWorkerRole                                               |
| /worker/visits/:id/submit        | POST   | capture submit                  | requireWorkerRole                                               |
| /worker/visits/:id/verify-status | GET    | submit screen polling           | requireWorkerRole                                               |
| /leave-requests                  | POST   | leave-request screen            | requireAuth + WORKER self-only bind (leave-requests.ts:117-133) |
| /auth/refresh                    | POST   | lib/api.ts single-flight on 401 | refresh token, 10/min/IP                                        |

## 3. Functions / services / external

| Name                                          | File                                 | Role                                                                             | External             |
| --------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- | -------------------- |
| apiFetch + refresh mutex                      | apps/mobile/lib/api.ts:90-95,189-280 | all HTTP, single-flight refresh, AbortController 15s                             | —                    |
| r2-upload-queue                               | apps/mobile/lib/r2-upload-queue.ts   | disk-persisted serial photo upload, backoff ×7                                   | Cloudflare R2        |
| generateBatchUploadUrls / uploadCaptureObject | apps/backend/src/lib/r2-presign.ts   | presigned PUTs keyed v3-captures/{workerId}/                                     | R2                   |
| submitVisit                                   | worker-submit-service.ts             | VisitPhoto rows + AWAITING_VERIFICATION + outbox ai.verify                       | —                    |
| clockInVisit/clockOutVisit                    | worker-lifecycle-service.ts          | IN_PROGRESS / PHOTOS_PENDING, one-active-timer                                   | —                    |
| handleAiVerify                                | dispatcher/handlers/ai.ts            | photos → gpt vision verdict → VERIFIED/FLAGGED, ₹1 ceiling, budget+circuit gated | OpenAI               |
| issueOtp/verifyOtp + sendOtpWhatsApp          | otp-store.ts / whatsapp-otp.ts       | login                                                                            | Redis, Meta WhatsApp |
| refresh-token-store                           | lib/services/refresh-token-store.ts  | axrt\_ rotation, compromise→epoch bump                                           | Redis cache          |

## 4. DB — tables this feature writes/reads

| Table        | Writes                                                                                                                           | Reads                               | Machine           | RLS (mig 023)           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------- | ----------------------- |
| User         | create on first OTP login                                                                                                        | phone/locale                        | —                 | excluded                |
| Membership   | tokenEpoch (compromise)                                                                                                          | status/role/epoch every requireAuth | —                 | FORCE + self-read       |
| RefreshToken | create/rotate/revoke                                                                                                             | validate                            | —                 | excluded (no companyId) |
| ConsentLog   | append (userId, policyVersion)                                                                                                   | dedup check                         | —                 | no companyId            |
| Worker       | state (PENDING_ACTIVATION→ACTIVE via OTP_VERIFIED)                                                                               | resolveWorkerFromAuth               | worker.ts         | FORCE + self-read       |
| Visit        | state transitions (clock-in/out, submit, AI verdict), startedAt/completedAt, photosBefore/After, verificationText/Model, flagged | today/detail/history/verify-status  | visit.ts          | FORCE                   |
| VisitPhoto   | createMany skipDuplicates (visitId+r2Key unique), aiVerifyStatus/Text                                                            | verify-status                       | —                 | FORCE                   |
| Site         | —                                                                                                                                | name/address for cards + AI prompt  | site              | FORCE                   |
| LeaveRequest | create REQUESTED (self)                                                                                                          | —                                   | none (ledger #20) | FORCE                   |
| AuditEvent   | AUTH_LOGIN, WORKER_ACTIVATION_TRANSITION_FAILED, submit/lifecycle audits                                                         | —                                   | —                 | FORCE                   |
| Outbox       | ai.verify enqueue (in submit tx)                                                                                                 | dispatcher drain                    | —                 | excluded                |

## 5. Data flow (plain words)

OTP login (WhatsApp or bypass phone) → tokens (SecureStore) → /me routes worker to home → home shows today's visits from /worker/today (Visit+Site+Worker) → worker opens visit → QR scan → BEFORE photos (presigned R2 upload via disk queue) → clock-in (IN_PROGRESS) → timer → clock-out (PHOTOS_PENDING) → AFTER photos → review → submit (VisitPhoto rows + AWAITING_VERIFICATION + outbox ai.verify, all one tx) → dispatcher calls OpenAI vision → VERIFIED or FLAGGED (+photos PASS/NEEDS_REVIEW/FLAGGED) → worker polls verify-status; supervisor sees flags on their surface; visit becomes billable (BILLABLE_VISIT_STATES); leave-request: worker files self → supervisor/HR decide (their features).

## 6. Personas connected

| Persona     | Touchpoint                                                                                             | When                   |
| ----------- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| Worker      | every screen                                                                                           | always                 |
| Supervisor  | flagged visits → their review surface; today composition; supervisor phone tap-to-call shown to worker | post-submit / on-shift |
| HR          | created the Worker+assignment that produce visits; decides worker's leave                              | upstream / on leave    |
| Owner       | pays AI verify cost (aiSpendDailyInr); visit billable                                                  | per submit             |
| SUPER_ADMIN | provisioned company                                                                                    | upstream               |

## 7. Connected features

| Feature                      | Direction               | Through                              |
| ---------------------------- | ----------------------- | ------------------------------------ |
| supervisor-decisions / today | we feed it              | Visit.flagged, states                |
| ai-verification              | we trigger it           | Outbox ai.verify                     |
| payroll/attendance           | leave + absence feed it | Attendance, payroll.recompute outbox |
| hr-portal                    | feeds us                | Worker, Assignment, Site rows        |
| billing                      | we feed it              | billable visit states                |

## 8. Known sharp edges (from 2026-06-10 deep review — re-check first every walk)

1. **RLS activation gap:** worker-today.ts:60 / worker-visit.ts:66 / worker-history.ts:51 bare prisma — break under axhy_app role (findings doc §1).
2. **UTC "today"** defaults (chat absent-marking; watch any date display at 00:00-05:29 IST).
3. **Photos uncompressed** (CameraView quality 0.85, no manipulateAsync) — slow on real worker networks.
4. **Orphan history screen** (tabs/\_layout.tsx:96 href: null, no nav anywhere).
5. **No OTA update path** for shipped APKs.
6. OTP verify lacks per-phone attempt cap (S1).
7. One-active-timer rule (ACTIVE_TIMER_EXISTS 409) — test two visits same day.
8. Resume-capture pointer (RESUME_PRIORITY in worker-today-service) must match mobile's step routing.

## Change log (never delete lines)

| At (IST)             | By                             | What changed                                                                   |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| 2026-06-10 23:45 IST | walk 2026-06-10-2345 (session) | created from template; footprint/API/DB filled from code verified this session |
