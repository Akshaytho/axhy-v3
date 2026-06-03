# Next Session

**Last updated:** 2026-06-04 IST (early morning)
**Branch:** unchanged — **nothing pushed** (founder standing instruction: fix, do not push).
**Rule:** single rolling handoff. Do not create dated `NEXT_SESSION*.md` / `STATUS.md`.

**Evidence:** `qa-audit-2026-06-03/capture-submission/` — `bug-log.md` (Session 1/2/3), `EVID-CAPTURE-SUBMISSION-v1.md` (§12/§13), `shots/` (`s2-*`, `v2-60..64`).

---

## What shipped this run (all verified, NOT pushed)

Founder answered two product forks (multiple-choice): **photo ceiling → 8**, **build dedicated review screens**. Other items resolved from the brain. Three guarded slices.

### Session 2 — capture hardening (HIGH-12 / CRIT-5 / CRIT-6 / GPS honesty)

- **HIGH-12** upload PUT timeout (new `lib/uploads/r2-put.ts`, 5 unit tests), **CRIT-5** poll-pileup guard, **CRIT-6** capture-crash fix, removed fabricated "GPS LOCKED" pill. CRIT-4/CRIT-7/E6-persistence verified already-fixed. Backend graceful degradation verified (fail-open rate-limit, Postgres-only critical path, /health).

### Session 3 — features

- **BUG-02** photo ceiling **3 → 8** (+ "Add more"). `capture-flow.ts` MIN_PHOTOS_PER_PHASE/MAX_PHOTOS_PER_PHASE; CameraView shutter to 8, "N OF 8 · MIN 3". Device: shot v2-60.
- **BUG-03** dedicated **Before-Review + After-Review** screens — new `components/worker/capture/PhaseReview.tsx` (dynamic grid, tap-to-remove, "+ Add more" replacement loop, floor-gated CTA), new route files `before-photos-review.tsx` / `after-photos-review.tsx`, 8-step `CAPTURE_STEPS`, `PhotoGridReview` made dynamic (up to 8/phase). **Clock-in relocated** to Before-Review "Start cleaning". Device: shots v2-61 / v2-62.
- **BUG-13** worker **audit events** `VISIT_CLOCKED_IN` / `VISIT_CLOCKED_OUT` / `VISIT_SUBMITTED`, written immutably inside each transition's transaction, real-transition-only. `kind` is a free String column (schema.prisma:549) — **no migration**. Test asserts the submit row.
- **BUG-06** **QR made honest** — `qr-scan.tsx` is now a truthful "SITE CHECK-IN / Start your visit / Continue" screen (no fake scan-line / no camera pretense). Device: shot v2-64.
- **sign-out timeout** — `identity-lifecycle.ts` uses `fetchWithTimeout(8s)` so a dead network can't hang sign-out.

### Gates (all green)

mobile typecheck · **mobile vitest 123/123** · backend typecheck · **worker-submit 10/10** (incl. VISIT_SUBMITTED audit assertion) · `check_before_build` E1–E14 PASSED ×4 · `check_before_done`.

---

## ⚠️ Documented deviations from the contract — FOUNDER TO RATIFY

1. **ON_SITE not introduced.** `visit.ts` only allows `EN_ROUTE → WORKER_ARRIVE → ON_SITE` (no `SCHEDULED → ON_SITE`); doing ON_SITE faithfully needs a **locked state-machine change** (add a transition + tests). Deferred (you accepted this). Pre-cleaning state stays SCHEDULED; clock-in goes SCHEDULED→IN_PROGRESS leniently as before.
2. **Clock-out stays at Timer "Done"** (not After-Review "Continue" as the contract's after-phase=IN_PROGRESS model says). Chosen for **accurate cleaning duration** + **deterministic resume** (IN_PROGRESS→timer, PHOTOS_PENDING→review). Trade-off: the contract's "back to timer from after-capture" isn't supported; After-Review "Continue" just navigates. If you want the literal contract model, it's a follow-up slice (resume disambiguation needed).

## On-device verification honesty

New screens + 8-counter + honest QR verified by **deep-link screenshots** (v2-60..64). The **full clock-in→timer→submit lifecycle was NOT driven on-device** this run: date rolled to Jun 4 → the QA worker had no "today" visit to start, and the live-camera screen ANR-storms this emulator. Lifecycle correctness rests on typecheck + 123 mobile + 10 backend tests + the relocated-but-unchanged clock-in code. **Do a final phone walk with a real assigned visit before launch.**

## Environment state

- Disk was at 100% mid-session (a local release build) which crashed build/backend/emulator. Freed ~14G of **regenerable** caches OUTSIDE the project (`~/.gradle/caches`, `~/.cache`, `~/.npm`) — **project, pnpm store, and AVD untouched**. Now ~9–10G free.
- Backend + Metro running; emulator up but ANR-prone (interactive walking is slow — use deep-links + `adb exec-out screencap`).
- LAN IP: `apps/mobile/.env.local` → set to your machine's current LAN IP (10.0.2.2 / adb-reverse don't deliver on this macOS).

## Remaining / follow-ups (specced, not done)

- **Same-class sign-out/upload-timeout** still open in **supervisor/chat** surfaces: `lib/uploads/photo-upload.ts:195`, `lib/audio/transcribe.ts:113/194`. Apply `fetchWithTimeout` in the supervisor pass.
- **Full QR** (camera decode + `qrSkipped`/`qrCheckedIn` server event + per-site QR flag) — deferred per the locked "no QR by default" decision.
- **ON_SITE + literal after-phase model** — a deliberate state-machine slice if you want the contract verbatim.
- **Streaming PUT** (expo-file-system createUploadTask) — memory optimization, not a launch bug.
