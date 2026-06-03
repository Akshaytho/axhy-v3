# Capture→Submission Flow — QA Bug Log (2026-06-03)

Method: founder strict-QA standard + four-layer SOP. Native emulator (API 34, app.axhy.mobile debug build) driven via adb (android-mcp engine), backend local→Railway DB/Redis, real DB inspection via psql. Capture-don't-fix: log here, batch-fix after full walk.

Worker under test: `+919381378257` (QA Worker Prod), worker_id `b0be64f7-…`, site "QA Launch Site", company `dc8b7586-…`.

Severity: blocking = data loss / security-integrity breach / can't ship · high = wrong behavior visible to user · medium = hidden but recoverable · low = polish.

Status tags: `code-confirmed` = proven by reading source (file:line). `live-confirmed` = reproduced on device with screenshot. `db-confirmed` = proven by row inspection.

---

## BUG-01 [final-review / submit] Minimum-photo floor (≥3 before, ≥3 after) NOT enforced — end to end

- **Severity:** blocking
- **Layer:** UI + Route + Primary DB
- **Status:** code-confirmed + db-confirmed (live pending)
- **Symptom:** A visit can be submitted with fewer than 3 before-photos and/or fewer than 3 after-photos, violating the core anti-gaming evidence floor (07-final-review.md "Submit is disabled if fewer than 3 before-photos / fewer than 3 after-photos").
- **Evidence:**
  - Client: `apps/mobile/app/(worker)/capture/[visitId]/review.tsx:31` — `uploadsReady = totalCaptured > 0 && counts.uploaded === totalCaptured`. Submit enables on "at least one photo total + all uploaded". No `counts.before >= 3 && counts.after >= 3` check.
  - Server: `apps/backend/src/lib/services/worker-submit-service.ts:45-99` — guards ownership + PHOTOS_PENDING state only; inserts whatever photos arrive; sets `photosBefore/photosAfter` to the submitted counts; transitions to AWAITING_VERIFICATION with no min-count rejection.
  - DB: `axhy."Visit"` row `b91e2cbe-…` state=AWAITING_VERIFICATION has **photosBefore=2**, photosAfter=3 — a real <3-before submission was accepted.
- **Reproducer (predicted):** capture 3 before, remove 1 on retake → 2 before remain → reach final review → Submit enabled → server accepts → AWAITING with pb=2.
- **Suspected cause:** floor enforced only at capture-advance (`completed = captured.length >= 3`), not re-checked after removals at final review, and never enforced server-side.
- **Fix scope (later):** client `review.tsx` gate must require `before>=3 && after>=3` with explicit reason copy; server `submitVisit` must reject `photosBefore<3 || photosAfter<3` (new result kind → 4xx). Defense in depth.
- **Connections:** BUG-02, BUG-05.

## BUG-02 [before/after capture] Photo MAX hard-capped at 3 (contract = max 8, "+ Add more")

- **Severity:** high
- **Layer:** UI
- **Status:** code-confirmed (live pending)
- **Symptom:** Worker cannot capture more than 3 photos per phase. Contract 02/05: "minimum 3, maximum 8" and "+ Add more if under the max". The app communicates "N of 3" and silently no-ops the shutter past 3.
- **Evidence:** `components/worker/capture/PhasePhotoCapture.tsx:36` `PHOTOS_PER_PHASE = 3`; `:168` `if (reservedSlotsRef.current.size >= PHOTOS_PER_PHASE) return;`; CameraView `totalSlots={PHOTOS_PER_PHASE}` (=3). No path to add a 4th–8th photo.
- **Impact:** Removes the worker's ability to add coverage; weakens evidence quality and breaks "coverage, not just count" (00-overview Rule B).
- **Connections:** BUG-01.

## BUG-03 [flow structure] Before Review (03) and After Review (06) screens not implemented as steps

- **Severity:** medium (contract divergence — needs founder triage; could be high if dedicated review is required for launch)
- **Layer:** UI / flow
- **Status:** code-confirmed
- **Symptom:** Contract defines 8 screens incl. dedicated Before Review + After Review checkpoints. App implements a 6-step flow: `qr-scan, before-photos, timer, after-photos, review(final), submit` (`lib/api-routes.ts:36-43`). Before/after review are collapsed into inline thumbnail review inside CameraView (retake/remove only).
- **Evidence:** `lib/capture-flow.ts:18` `beforePhaseAdvanceStep` → 'timer' (before-photos goes straight to timer); `review.tsx` header "Capture step 5 — Final Review", goBack→after-photos / goNext→submit (final-only). Step badges read "Step 2 of 6".
- **Impact:** No dedicated "one clean checkpoint" grid review with "+ Add more" before cleaning / before final review as the contract intends.

## BUG-04 [final-review] Missing required UI: site name + cleaned duration; header comment misdescribes the stat card

- **Severity:** high
- **Layer:** UI + honesty
- **Status:** code-confirmed (live pending)
- **Symptom:** 07-final-review requires site name + a summary line with **cleaned duration** and total photos. `review.tsx` shows neither site name nor duration; stat cards are Before/After/Uploaded.
- **Evidence:** `review.tsx:1-11` header comment claims a "3-stat card (Photos / Duration / GPS)" but `:76-80` renders StatCards "Before / After / Uploaded" — code does not match its own doc, and the contract's duration/site-name are absent.
- **Impact:** Worker can't see how long they cleaned or which site at the decisive submit step; doc/code mismatch is an honesty-audit hit.

## BUG-05 [final-review] Submit-disabled reasons not specific per contract

- **Severity:** medium
- **Layer:** UI
- **Status:** code-confirmed (live pending)
- **Symptom:** Contract 07 requires explicit reasons: "Waiting for 2 uploads", "1 photo failed — retry or remove it", "Need 1 more after photo". `review.tsx:110-116` only shows generic "Wait for all uploads to finish (x/y ready)" or "Take your required photos…". No per-phase "need N more" and no distinct failed-vs-uploading message.
- **Connections:** BUG-01.

---

## BUG-06 [qr-scan] QR screen is a non-functional visual placeholder (no camera, no decode, no server event)

- **Severity:** high (contract gap; brain note says "QR infra deferred" — founder triage on whether launch needs it)
- **Layer:** UI + Route · **Status:** code-confirmed (live pending)
- **Symptom:** `qr-scan.tsx` renders a static dark box (`#2a221a`) + corner brackets + animated scan line. **No `<CameraView>`, no camera, no QR decode.** Only forward action is **Skip QR**. None of contract 01's behavior exists: no real camera, no continuous scan, no expected/wrong/non-Axhy validation, no "scan success → ON_SITE".
- **Evidence:** `qr-scan.tsx:1-16` comment "Real camera + decode logic lands in slice 2b-2"; `:55-60` `skip()` only `router.replace`s — no API call; no expo-camera import.
- **Sub-bug:** Contract 01 "Tap Skip → record `qrSkipped=true` on the server." Implementation writes **no server event** on skip.

## BUG-07 [state-machine] ON_SITE never entered; before-photos captured while visit still SCHEDULED

- **Severity:** medium (lifecycle semantics) · **Layer:** Route + Primary DB state · **Status:** code-confirmed
- **Symptom:** Contract state model: QR→ON_SITE, before capture/review in ON_SITE, Start cleaning→IN_PROGRESS. Implementation: QR skip changes nothing (stays SCHEDULED); before-photos captured in SCHEDULED; before-photos "Done" clock-in goes **SCHEDULED→IN_PROGRESS directly**, skipping ON_SITE.
- **Evidence:** `worker-lifecycle-service.ts:108-116` clock-in always sets `state:'IN_PROGRESS'`; `worker-today-helpers.ts:101` routes ON_SITE→before-photos but nothing ever sets ON_SITE (dead branch).
- **Impact:** SCHEDULED visit accrues before-photos (worker appears not-yet-arrived); no "on site, not cleaning" state ever shown.

## BUG-08 [final-review] Cleaned duration unavailable to the screen (part of BUG-04)

- **Severity:** medium · **Status:** code-confirmed
- **Symptom:** Contract 07 requires summary line with cleaned duration. `review.tsx` never reads `startedAt`/`completedAt` (only upload-queue counts), so duration can't be shown though the data exists on Visit.

## BUG-09 [submit] Worker trapped on verifying spinner — cannot leave until verdict/timeout (violates "worker does not wait for AI")

- **Severity:** high · **Layer:** UI · **Status:** code-confirmed (live pending)
- **Symptom:** During the `polling` state (contract 08 State B "Submitted, verifying"), back-nav is locked AND no "Back to home" CTA is shown, so the worker must wait up to `POLL_MAX×POLL_INTERVAL = 40×3s = 120s` (or a verdict) before they can leave. Contract 08: State B "primary CTA: **Back to home →**", "leaving must be the default safe behavior"; back-nav "State B: worker exits via Back to home →". Core Rule D / 00-overview: "Submit success frees the worker."
- **Evidence:** `submit.tsx:74-81` `NON_IDLE_STATES` includes `'polling'`; `:101` `backLocked`; `:113-119` Android BackHandler returns `true`; `:231` `gestureEnabled: !backLocked`; footer `:424-462` renders "Back to home" only for `isTerminal` (verified/flagged/closed/timeout), nothing during `polling`.
- **Suspected cause:** back-lock intended to stop re-entering /review + re-submit, but over-applies to the benign post-submit polling wait. Correct design: block re-entry to /review + re-submit, but allow "Back to home" during polling and terminal.
- **Note:** Otherwise submit.tsx is strong — honest outcome-specific states (verified/flagged/closed/timeout), no blanket "verified" lie, iOS+Android lock against re-submit. Only the leave-during-polling affordance is missing.

## BUG-10 [timer] Timer display resets to 00:00 on resume/reopen — real elapsed session not preserved

- **Severity:** high · **Layer:** UI · **Status:** code-confirmed (live pending)
- **Symptom:** The elapsed clock is local `useState(0)` counting up from mount; it never derives from the visit's `startedAt`. A worker who cleans 20 min, leaves (visit stays IN_PROGRESS), and reopens the timer sees **00:00** counting from zero, not ~20:00. Violates contract 04 "Resume rule: reopen the timer with the real elapsed session preserved" and "survives reopen without losing meaningful time" / "must NOT silently lose the timer on exit."
- **Evidence:** `timer.tsx:74` `const [elapsed,setElapsed]=useState(0)`; `:90-92` `setInterval(()=>setElapsed(s=>s+1),1000)`; no read of `visit.startedAt` anywhere. (Server duration via startedAt/completedAt is correct; only the worker-facing timer lies/resets.)
- **Impact:** Worker distrust — looks like cleaning time was lost; the contract warns this makes leaving "feel risky" and pushes workers to keep the screen open artificially.

## BUG-11 [timer] "GPS tracking active — N POINTS COLLECTED" is fabricated (screen lies)

- **Severity:** high (honesty) · **Layer:** UI · **Status:** code-confirmed (live pending)
- **Symptom:** The timer shows a "GPS tracking active" card with "N POINTS COLLECTED" that increments every 30s, implying continuous GPS logging. It is a cosmetic counter, not real GPS, and **nothing is persisted**.
- **Evidence:** `timer.tsx:114-119` `setInterval(()=>setGpsPoints(n=>n+1),30_000)` with comment "Simulate periodic GPS sampling"; `:204-212` renders "GPS tracking active / {gpsPoints} POINTS COLLECTED"; real `getCurrentPositionAsync` is called once at start/end and only `console.warn`'d in `__DEV__` (top comment: "no backend column yet").
- **Impact:** Direct "screens never lie" violation (00-overview Rule 3 / edge-cases "five things that must always hold" #5). A worker/supervisor would believe GPS proof exists when it does not.

## BUG-12 [timer] Android hardware/system back bypasses the exit-confirmation sheet

- **Severity:** medium · **Layer:** UI · **Status:** code-confirmed (live pending)
- **Symptom:** Only the home-icon `onPress` opens the "Leave cleaning?" confirm sheet. There is no `BackHandler`, so Android hardware back is not intercepted — contract 04 requires "Tap exit / **system back** → Open a small confirmation sheet."
- **Evidence:** `timer.tsx:176-184` home icon → `setConfirmExitVisible(true)`; no `BackHandler.addEventListener` in the file.

## BUG-13 [audit] No AuditEvent written for worker clock-in / clock-out / submit (audit completeness gap)

- **Severity:** medium · **Layer:** Side-effect/audit · **Status:** code-confirmed + db-confirmed
- **Symptom:** The worker capture lifecycle (clock-in, clock-out, submit) writes no `AuditEvent`. `axhy."AuditEvent"` has **0 rows** in the whole DB. An audit helper (`lib/audit-event.ts`) exists and other flows use it (decisions-service, supervisor-updates, owner-budget — 4 call sites), so the pattern is established but not applied to the worker evidence flow.
- **Evidence:** `worker-submit-service.ts` / `worker-lifecycle-service.ts` contain no `auditEvent.create`; `select count(*) from axhy."AuditEvent"` = 0. SOP Section 7 / strict-QA: "After ANY write, an AuditEvent row exists."
- **Impact:** No tamper-evident trail for the core evidence-submission + clock events of an evidence-integrity product.

---

## Build/infra finding (already FIXED — production blocker)

## BUG-00 [build] Android build broken: react-native-worklets missing as direct dependency (FIXED)

- **Severity:** blocking (release build)
- **Status:** FIXED this session (permanent), pending re-verify.
- **Symptom:** Gradle `assembleDebug` failed at `react-native-reanimated/android/build.gradle:53` — `node require.resolve('react-native-worklets/package.json')` threw. Reanimated 4.x requires `react-native-worklets` as a direct dependency; `apps/mobile/package.json` declared `react-native-reanimated ~4.1.1` but not worklets. pnpm `shamefully-hoist=false` left the peer unresolvable, breaking every clean Android build (incl. EAS release).
- **Fix applied:** `expo install react-native-worklets` → added `react-native-worklets ~0.5.1` (Expo-SDK-54 pin, in reanimated 4.1.7 peer range 0.5–0.8). `check_before_edit` approved. Rebuild succeeded → APK produced.

---

## Live-walk confirmations (native emulator, app.axhy.mobile, worker +919381378257)

Environment fixes needed to even run the app (all permanent, see BUG-00 + below):

- BUG-00: react-native-worklets added (build was broken).
- `.env.local` `EXPO_PUBLIC_API_BASE_URL` was a **dead IP `172.20.10.6`** → every API call timed out ("Could not send OTP"). Proven via `/proc/net/tcp` (app dialed `172.20.10.6:4000`, SYN_SENT). Updated to the live host LAN IP `192.168.1.6:4000` (`.bak-qa-2026-06-03` saved). Note: 10.0.2.2 (slirp) and 127.0.0.1 (adb reverse) both accept the TCP SYN but do NOT deliver data to the host backend on this macOS setup — only the host LAN IP works. **Founder action: set this to your machine's current LAN IP per network.**

Login path verified end-to-end: phone → OTP (magic `123456`, AXHY_OTP_BYPASS) → permissions (camera+location) → privacy consent → worker home. All 200s.

- **BUG-01 — CONFIRMED LIVE (blocker).** On a PHOTOS_PENDING visit I captured 0 before + 3 after photos; after all 3 uploaded, "Submit for verification" became `enabled=true clickable=true` ("AI will verify within 30 seconds") with stat cards reading **0 BEFORE / 3 AFTER / 3 UPLOADED**. A worker can submit with **zero before-photos**. Screenshot: `shots/41-submit-gate.png`. (Did not tap submit — avoided prod mutation + AI cost; client bug proven by enabled button, server gap by code + DB pb=2 row.)
- **BUG-02 — CONFIRMED LIVE.** After-photos capture showed "PHOTO 1 OF 3" / "0/3 MINIMUM"; 4 shutter taps produced only **3** captured photos (4th blocked). Max is 3, not 8. Screenshots `shots/39`,`40`.
- **BUG-03 — CONFIRMED LIVE.** Step badge reads "Step 4 of 6 — After photos"; back from Final Review ("Back to after photos") lands directly on the After-Photos **capture** screen — no dedicated After-Review screen. 6-step flow.
- **BUG-04 — CONFIRMED LIVE.** Final Review header "Review & submit"; stat cards are **Before / After / Uploaded** — **no site name, no cleaning duration** anywhere on screen. Screenshot `shots/38`.
- **BUG-05 — CONFIRMED LIVE.** Disabled-reason copy seen: "Take your required photos before you submit." and "Wait for all uploads to finish (2/3 ready)." — generic, no per-phase "need N more before/after".
- Camera preview renders **black** on the emulator (expo-camera gets no live preview from the emulated camera) but capture+upload pipeline works (black frames uploaded to R2). Residual risk: photo-content quality not verifiable on emulator.
- Worker home matches contract (grouped Submit-pending/Verifying/Completed, NextSiteCard hero "Review work", stats 1 Done/10 Planned, no fake name). No new home findings.

---

## Fixes applied this session (permanent, NOT pushed)

Gates after all fixes: backend typecheck green · mobile typecheck green · backend `worker-submit.test.ts` **10/10** (incl. new floor test) · mobile vitest **116/116**.

| Bug          | Status                    | Fix                                                                                                                                              | Verified                                                               |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| BUG-00       | FIXED                     | `expo install react-native-worklets@~0.5.1` (was missing → Android build broken)                                                                 | Android x86_64 build succeeded; app runs                               |
| .env dead IP | FIXED                     | `.env.local` → `192.168.1.6:4000` (`.bak-qa-2026-06-03` saved)                                                                                   | login reaches backend (200s)                                           |
| **BUG-01**   | **FIXED (server+client)** | server `worker-submit-service` returns 422 INSUFFICIENT_PHOTOS for <3/<3 before any write; client `review.tsx` gate requires before≥3 && after≥3 | server test green; **live** shot 44: submit now disabled with 0 before |
| BUG-04       | FIXED                     | `review.tsx` shows site name (exposed startedAt/completedAt)                                                                                     | **live** shot 47: "QA Launch Site"                                     |
| BUG-05       | FIXED                     | `review.tsx` specific hint "Take N more before/after photos."                                                                                    | **live** shot 44/47                                                    |
| BUG-08       | FIXED                     | `review.tsx` shows "Cleaned N min · M photos"                                                                                                    | **live** shot 47                                                       |
| BUG-09       | FIXED                     | `submit.tsx` renders "Back to home" during `polling` (lock on re-submit kept)                                                                    | typecheck green                                                        |
| BUG-10       | FIXED                     | `timer.tsx` elapsed derived from Visit.startedAt                                                                                                 | **live** shot 45: 398:04 real elapsed                                  |
| BUG-11       | FIXED                     | `timer.tsx` removed fabricated GPS counter; honest card only on real sample                                                                      | **live** shot 45: no GPS-points lie                                    |
| BUG-12       | FIXED                     | `timer.tsx` BackHandler opens the exit-confirm sheet on hardware back                                                                            | typecheck green                                                        |

### Needs founder design decision (product choices, not silently changed)

- **BUG-02** — capture is hard-capped at 3 photos/phase; contract says max 8 with "+ Add more". The ≥3 floor is now enforced; raising the ceiling to 8 (and the "add more" UX) is a product call. **Recommend:** allow up to 8.
- **BUG-03** — flow is 6 steps; contract specifies dedicated Before-Review + After-Review screens. Inline thumbnail review exists. **Recommend:** confirm whether the inline review is acceptable for launch or build the two dedicated review screens.
- **BUG-06** — QR screen is a Skip-only visual placeholder (no camera/scan, no server event). Brain says QR infra is deferred. **Recommend:** for launch either hide the QR step where a site has no QR, or build real scan + a `qrSkipped` server event.
- **BUG-07** — ON_SITE state is never entered (clock-in jumps SCHEDULED→IN_PROGRESS); before-photos accrue while SCHEDULED. **Recommend:** decide if ON_SITE matters for supervisor visibility; if yes, set ON_SITE on QR/skip.
- **BUG-13** — no AuditEvent for worker clock-in/clock-out/submit (0 rows in DB). **Recommend:** emit AuditEvent on submit + clock transitions for compliance (the audit-event helper already exists).

---

# Session 2 — production hardening (2026-06-03, founder asked for "no lag / no stuck / app-close / no crash / production grade")

Driven by the founder's resilience concerns + the 2026-05-24 product code review (CRIT/HIGH items) retrieved from the brain. Every item below was re-verified against **current** source before acting (the brain memos were partly stale). Slice `worker-capture-hardening-2026-06-03`; `check_before_build` E1–E14 PASSED; `check_before_edit` approved. **Not pushed.**

## Fixed this session (permanent) — file:line

| ID              | Sev  | Maps to founder worry       | Fix                                                                                                                                                                                                                                                                                                      | Verified                                      |
| --------------- | ---- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **HIGH-12**     | high | "no stuck on bad network"   | R2 PUT had **no timeout** → a 2MB upload on a patchy network hung forever, backoff never fired. Extracted unit-testable `lib/uploads/r2-put.ts` (`fetchWithTimeout` 60s + `putFileToR2`); wired into `r2-upload-queue.ts` `putToR2` + `putViaBackendProxy`. Stalled socket now aborts → backoff retries. | **r2-put.test.ts 5/5**; mobile vitest 121/121 |
| **CRIT-5**      | crit | "no lag"                    | `submit.tsx` poll was `setInterval(async)` with no in-flight guard → overlapping verify-status fetches piled up on slow networks. Added `pollInFlightRef` guard (skips a tick while a poll is in flight; `count` only advances on a poll that fired).                                                    | typecheck green; device                       |
| **CRIT-6**      | crit | "no crash / no lost photos" | `PhasePhotoCapture.onCapture` re-threw into `CameraView`'s uncaught `void handleShutter()` → unhandled rejection **crashed Android**, losing all photos. Now frees just that slot + shows inline "Couldn't save that photo — try again"; `CameraView.handleShutter` also catches defensively.            | typecheck green; device                       |
| **GPS honesty** | high | founder honesty rule        | Removed the fabricated **"GPS LOCKED"** pill from `CameraView` (it read no location — a static lie, same class as the timer's fake GPS counter the founder caught).                                                                                                                                      | device                                        |

## Verified ALREADY fixed in current code (stale memos corrected — doc-truth)

- **CRIT-4** (timer elapsed lost on Back) — `timer.tsx:82,104-117` already derives elapsed from `Visit.startedAt`; survives reopen. ✓ (fixed session 1)
- **CRIT-7** (queue `pump()` race → duplicate uploads) — `r2-upload-queue.ts:135-136` now sets `running` **before** any `await`, so overlapping pumps can't happen. ✓
- **E6 offline-first persistence** (the old "in-memory only" memo) — `lib/storage/queue-persistence.ts` + `local-kv.ts` persist idle/failed/done items to `documentDirectory/axhy-kv/` on every change and rehydrate on cold-start (`(worker)/_layout.tsx:24,41-42,55-57`); `uploading→idle` reset on restore. Queue **survives app kill** (locked E6 satisfied). ✓ Header comment in `r2-upload-queue.ts` corrected to match.

## Backend graceful degradation — VERIFIED (no fix needed)

Founder worry "what if Redis / backend down". The worker critical path already degrades gracefully per the locked "never error the worker due to infra" decision:

- **Rate-limiter fails OPEN on Redis down** (`redis-rate-limit.ts:132` "Redis unreachable — failing open" → worker allowed through; only fails closed if `AXHY_RATE_LIMIT_FAIL_CLOSED=1`).
- **Clock-in/out/submit are Postgres-only** (`worker-lifecycle-service.ts` has no `getRedis` call) → a Redis outage cannot block them.
- `/health` returns 503 + the failing dep so a load balancer drains dead replicas; Redis client errors **don't crash the process** (`redis.ts` `on('error')` just warns); SIGTERM does a graceful `closeRedis` with timeout.
- Live: `GET /health` → `{"ok":true,"checks":{"postgres":"ok","redis":"ok"}}`.

## Same-class latent bugs found by pattern-grep (out of THIS slice — supervisor/auth surfaces, logged honestly)

The timeout-less raw `fetch` pattern (HIGH-12 class) also exists at: `lib/uploads/photo-upload.ts:195` (chat photo PUT), `lib/audio/transcribe.ts:113/194` (voice), `lib/identity-lifecycle.ts:344` (sign-out). These are supervisor/chat/auth surfaces, not the worker capture flow — **fix in the supervisor hardening pass** (the sign-out one is worker-facing too but best-effort/awaited-with-fallback). Flagged so they are not silently forgotten.

## Architecture decisions (founder's resilience questions) — resolved from brain, all LOCKED

- **Offline-first**: locked (P0-13 offline queue; locked E6). Already implemented (persisted queue + local files + timeout+retry).
- **Lean scale-ready monolith, no microservices/Python yet**: locked ("Microservices forbidden until measured pain at >10K rps"; horizontal Railway replicas; Redis/BullMQ async). Heavy tasks already isolated behind queues so they can move to a Python worker later without refactoring callers.
- **Graceful degradation**: locked (verified above).
- **Zero-downtime + versioned API**: locked direction (multi-replica zero-downtime; unversioned routes flagged as a break risk — future versioning work).

## Deferred (honest, not a launch blocker)

- **Streaming PUT** (`expo-file-system` `createUploadTask`) instead of loading the blob into JS heap. Uploads are **serial** (one ~2MB file at a time → bounded peak heap), so this is an optimization, not a launch bug. Documented, not claimed done.

---

# Session 3 — founder-directed features (2026-06-04): BUG-02, BUG-03, BUG-13, BUG-06, sign-out

Founder picked (multiple-choice): **BUG-02 → allow up to 8**; **BUG-03 → build dedicated review screens**. The other three resolved from the brain. Three slices, each `check_before_build` PASSED + `check_before_edit` approved. **Not pushed.**

## Fixed + verified

| ID                   | What                                                                                                                                                                                                                                                                                                                          | Verification                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BUG-02**           | Photo ceiling 3 → **min 3 / max 8** (+ "Add more"). CameraView shutter captures until 8; "Done" enables at 3; counter "N OF 8 · MIN 3".                                                                                                                                                                                       | mobile typecheck + **vitest 123** (capture-flow tests); **on-device shot v2-60** ("PHOTO 1 OF 8", "0 OF 8 · MIN 3", "Step 2 of 8", "Capture at least 3 (up to 8)") |
| **BUG-03**           | Dedicated **Before-Review** + **After-Review** screens (new `PhaseReview`: dynamic grid, tap-to-remove, "+ Add more" replacement loop, floor-gated CTA). 8-step flow. Final-review grid (`PhotoGridReview`) made **dynamic** (shows up to 8/phase).                                                                           | **on-device shots v2-61 / v2-62** (both screens render: "0 of 8 photos · minimum 3", empty-state, "+ Add more", "Take N more … to continue")                       |
| **BUG-03 lifecycle** | **Clock-in relocated** from before-photos "Done" → Before-Review **"Start cleaning"** (contract's transition point; no state-machine change — backend already does SCHEDULED→IN_PROGRESS).                                                                                                                                    | typecheck; ACTIVE_TIMER_EXISTS guard carried over                                                                                                                  |
| **BUG-13**           | **Audit events** for the worker evidence lifecycle: `VISIT_CLOCKED_IN` / `VISIT_CLOCKED_OUT` / `VISIT_SUBMITTED`, written immutably inside each transition's transaction, only on the real transition (not idempotent retries). `kind` is a free String column (no migration).                                                | backend typecheck + **worker-submit 10/10** incl. a new assertion that a `VISIT_SUBMITTED` row is created on submit                                                |
| **BUG-06**           | **QR made honest**: removed the fake animated scan-line + "point at the QR code" pretense (it read no camera, decoded nothing). Now a truthful **"SITE CHECK-IN / Start your visit / Continue"** screen. Full QR (camera decode + qrSkipped event + per-site flag) stays deferred per the locked "no QR by default" decision. | **on-device shot v2-64** ("SITE CHECK-IN", "Continue", no scan-line)                                                                                               |
| **sign-out timeout** | identity-lifecycle sign-out POST now uses `fetchWithTimeout` (8s) so a dead network can't hang sign-out before clearTokens (HIGH-12 class).                                                                                                                                                                                   | mobile typecheck + **vitest 123** (identity-lifecycle 22 green)                                                                                                    |

## Documented deviations from the contract (founder to ratify)

- **ON_SITE not introduced.** The visit machine only allows `EN_ROUTE → WORKER_ARRIVE → ON_SITE` (no `SCHEDULED → ON_SITE`); introducing ON_SITE needs a locked state-machine change. Deferred (founder-accepted). Pre-cleaning state stays SCHEDULED; clock-in goes SCHEDULED→IN_PROGRESS leniently as before.
- **Clock-out stays at Timer "Done"** (not After-Review "Continue" as the contract's after-phase=IN_PROGRESS model says). Reason: keeps cleaning **duration accurate** and **resume deterministic** (IN_PROGRESS→timer, PHOTOS_PENDING→review). Trade-off: the contract's "back to timer from after-capture" is not supported. After-Review's "Continue to final review" navigates.

## On-device verification honesty

8-photo counter + both review screens + honest QR were verified by **deep-link screenshots** (v2-60..64) on the emulator. The **full clock-in→timer→submit lifecycle was NOT driven on-device** this run: the date rolled to June 4 so the QA worker had no "today" visit to start, and the live-camera screen ANR-storms this emulator. Lifecycle correctness rests on typecheck + 123 mobile tests + 10 backend tests (incl. audit) + the relocated-but-unchanged clock-in code. Founder: do a final phone walk with a real assigned visit.
