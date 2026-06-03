# EVID-CAPTURE-SUBMISSION-v1 — Enterprise QA Walk Findings

- **Date:** 2026-06-03
- **Feature:** Worker capture → submission flow (`docs/capture-submission_flow/00..10`)
- **Walker:** primary session (Claude), founder away (autonomous run)
- **Target environment:** local backend (`pnpm --filter @axhy/backend dev`) → **Railway** Postgres + Redis (real data); **native Android emulator** (API 34, app.axhy.mobile debug build) driven via **adb** (android-mcp engine). NOT Playwright/web-stub — native camera path under test.
- **Method:** founder strict-QA standard (10 sections) + QA Enterprise Walk SOP four-layer verification (UI + Route + Primary DB + side-effects). Capture-don't-fix during walk → batch-fix after triage.

## 1. Scope & method

Test the full worker capture journey (QR → before photos → timer → after photos → review → submit → outcome) against the target contract, forward AND backward, with adversarial/negative/edge cases, from the user's perspective. Worker under test: `+919381378257` (QA Worker Prod), site "QA Launch Site".

**Data reality:** existing real visits — PHOTOS_PENDING ×8 (0-photo seed), AWAITING_VERIFICATION ×1 (photosBefore=2), VERIFIED ×1. No SCHEDULED/ON_SITE/IN_PROGRESS visit exists, **and there is no product API to create a visit** (no `visit.create` in the backend; generation deferred). Direct production-DB seeding was correctly blocked. → Final Review / Submit / Outcome screens walked on real data; early-flow screens walked via in-app/deep-link navigation; a clean SCHEDULED→submit state progression is a documented residual risk (see §10).

## 2. Findings summary (see bug-log.md for full detail + evidence)

| ID     | Sev              | Area                | One-line                                                                                                                                                    |
| ------ | ---------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-00 | blocking (FIXED) | build               | Android build broken — `react-native-worklets` missing as direct dep (reanimated 4.x). Fixed via `expo install react-native-worklets@~0.5.1`.               |
| BUG-01 | **blocking**     | final-review/submit | Minimum-photo floor (≥3 before, ≥3 after) NOT enforced on client OR server → <3-photo submissions accepted (DB has pb=2 AWAITING). Anti-gaming core broken. |
| BUG-02 | high             | capture             | Photo MAX hard-capped at 3 (contract: min 3 / **max 8** + "Add more"). 4th photo silently no-ops.                                                           |
| BUG-04 | high             | final-review        | Required site name + cleaned duration not shown; header comment misdescribes stat card ("Photos/Duration/GPS" vs actual "Before/After/Uploaded").           |
| BUG-06 | high             | qr-scan             | QR screen is a non-functional placeholder (no camera, no decode, Skip-only, no server event on skip).                                                       |
| BUG-03 | medium           | flow                | Before Review (03) + After Review (06) not implemented as steps; flow is 6-step (inline review only).                                                       |
| BUG-05 | medium           | final-review        | Submit-disabled reasons generic, not per-contract ("Need 1 more after photo", failed-vs-uploading).                                                         |
| BUG-07 | medium           | state-machine       | ON_SITE never entered; before-photos captured while SCHEDULED; clock-in jumps SCHEDULED→IN_PROGRESS.                                                        |
| BUG-08 | medium           | final-review        | Cleaned duration unavailable to the screen (review.tsx never reads started/completedAt).                                                                    |

## 3. Persona walk — live results

_(appended after device walk)_

## 4. Adversarial scenarios — live results

_(appended after device walk)_

## 5. Four-layer evidence per step

_(screenshots in ./shots, DB diffs via psql, backend log /tmp/axhy-backend.log)_

## 6. RCA clusters

- **CLUSTER-A — "evidence floor unenforced":** BUG-01 (+ contributing BUG-02). Principle: the ≥3/≥3 photo floor is checked only transiently at capture-advance (`captured.length >= 3`), never re-validated at final review and never enforced server-side at submit. Fix patches both layers.
- **CLUSTER-B — "final review under-built vs contract":** BUG-04, BUG-05, BUG-08. Principle: `review.tsx` derives only from the upload queue, missing visit-level data (site, duration) and per-phase gating semantics.
- **Standalone:** BUG-06 (QR deferred), BUG-07 (ON_SITE skip), BUG-03 (review screens collapsed) — likely intentional simplifications to triage with founder.

## 7. Production-grade scorecard (after fixes)

| Dimension                        | Before | After | Notes                                                                    |
| -------------------------------- | ------ | ----- | ------------------------------------------------------------------------ |
| Evidence integrity (photo floor) | 1/5    | 5/5   | server 422 + client gate; tested                                         |
| Honesty (no fabricated UI)       | 2/5    | 4/5   | fake GPS counter removed; QR placeholder still cosmetic (BUG-06, triage) |
| Timer truthfulness               | 2/5    | 5/5   | real elapsed from startedAt                                              |
| Worker freedom (submit)          | 2/5    | 5/5   | leave during polling restored                                            |
| Final-review completeness        | 2/5    | 5/5   | site + duration + specific reasons                                       |
| Buildability (release)           | 0/5    | 5/5   | worklets dep added                                                       |
| State-model fidelity             | 3/5    | 3/5   | ON_SITE still skipped (BUG-07, triage)                                   |
| Audit completeness               | 2/5    | 2/5   | worker flow still unaudited (BUG-13, triage)                             |

## 8. Fixes applied (permanent, not pushed)

See bug-log.md "Fixes applied" table for file:line + verification per bug. Summary: BUG-00 (build), .env dead-IP, **BUG-01 server+client (the blocker)**, BUG-04, BUG-05, BUG-08, BUG-09, BUG-10, BUG-11, BUG-12 — all fixed. Backend `worker-submit-service.ts` (+route) gained a 422 INSUFFICIENT_PHOTOS floor; `worker-today` now exposes startedAt/completedAt; `review.tsx`/`timer.tsx`/`submit.tsx` corrected.

## 9. Re-verification

- backend typecheck green · mobile typecheck green
- `worker-submit.test.ts` **10/10** (new test: "rejects below the 3-before/3-after floor with 422 INSUFFICIENT_PHOTOS and does not transition"; happy-path now uses a compliant 3+3 set)
- mobile vitest **116/116**
- Live re-walk: shot 44 (submit DISABLED at 0 before + "Take 3 more before photos."), shot 45 (timer 398:04 real elapsed, no GPS-points lie), shot 47 (site name "QA Launch Site" + "Cleaned N min · 3 photos")

## 10. Honest residual risk

- Clean SCHEDULED→…→AWAITING state progression could not be walked live (no SCHEDULED visit + no create-visit API + prod-DB seed correctly disallowed). Early-flow screens verified by code audit + on-device screen navigation + capturing real after-photos.
- Emulator camera preview is **black** (no emulated preview to expo-camera); capture+upload pipeline verified, photo _content_ quality not.
- AI verification path (AWAITING→VERIFIED/FLAGGED) not driven end-to-end (avoided prod mutation + AI cost).
- BUG-02/03/06/07/13 are product/scope decisions left for founder triage (see §6 and bug-log) — not silently changed.

## 11. Recommendation

**Ship the fixes.** BUG-00 (no release build) and BUG-01 (unenforced evidence floor) were genuine launch blockers and are now fixed + verified on server, client, tests, and device. Before market launch, make the five product-decision calls (BUG-02 photo ceiling, BUG-03 review screens, BUG-06 QR, BUG-07 ON_SITE, BUG-13 audit). Do not launch with BUG-01 reverted — the product's entire value proposition is trustworthy before/after evidence.

---

## 12. Session 2 addendum — production hardening (resilience / no-lag / no-crash)

Founder follow-up: "cache, fast app, no lags, no stuck, app close/open, Redis down, backend down, push update, scale to ~20k workers — make it production grade and future-proof." Resolved the architecture questions from the **brain** (all four locked: offline-first, lean scale-ready monolith, graceful degradation, zero-downtime/versioned API — no founder ask needed), then fixed the matching code-level reliability bugs from the 2026-05-24 code review. Full detail + file:line in `bug-log.md` → "Session 2".

**Fixed (permanent, not pushed):** HIGH-12 (upload PUT timeout → no more "stuck on bad network"), CRIT-5 (poll pileup → no lag on slow networks), CRIT-6 (capture crash → no app crash / no lost photos), GPS-honesty (removed the fabricated "GPS LOCKED" pill).
**Verified already-fixed (stale memos corrected):** CRIT-4 (timer persistence), CRIT-7 (queue race), E6 offline-queue persistence (survives app kill).
**Verified, no fix needed:** backend graceful degradation — rate-limiter fails open on Redis down, clock-in/out/submit are Postgres-only, `/health` drains dead replicas, Redis errors don't crash the process. Live `/health` → both deps ok.
**Gates:** mobile typecheck green · **mobile vitest 121/121** (116 + 5 new HIGH-12 tests) · backend resilience verified live. `check_before_build` E1–E14 PASSED.
**Same-class follow-ups (logged, not silently dropped):** the timeout-less raw-`fetch` pattern also lives in supervisor/chat/auth surfaces (`photo-upload.ts`, `audio/transcribe.ts`, `identity-lifecycle.ts`) — fix in the supervisor hardening pass.
**Permanence:** the earlier "I still see the bugs" was a **stale installed bundle** (debug build serving old JS when Metro was unreachable), not a code regression — all fixes are in working-tree source (uncommitted, not pushed) and a fresh **release APK** (embedded bundle, no Metro) was rebuilt and verified on-device to close that gap.

---

## 13. Session 3 addendum — founder-directed features (2026-06-04)

Founder answered the two open product forks (multiple-choice) and authorized the rest from the brain. Full detail + file:line in `bug-log.md` → "Session 3". Built as three guarded slices (capture-flow-v2, worker-audit-events, signout-timeout+qr-honesty), all NOT pushed.

- **BUG-02** photo ceiling 3→8 (+ "Add more") — device shot v2-60.
- **BUG-03** dedicated Before-Review + After-Review screens (new `PhaseReview`, dynamic `PhotoGridReview`), 8-step flow, clock-in relocated to "Start cleaning" — device shots v2-61 / v2-62.
- **BUG-13** worker audit events (VISIT_CLOCKED_IN/OUT/SUBMITTED) per locked D9 — backend test asserts the submit row.
- **BUG-06** QR made honest (deferred-QR "SITE CHECK-IN" pass-through, no fake scanner) — device shot v2-64.
- **sign-out timeout** (HIGH-12 class) — identity-lifecycle uses fetchWithTimeout(8s).

**Gates:** mobile typecheck green · **mobile vitest 123/123** · backend typecheck green · **worker-submit 10/10** (incl. audit assertion). `check_before_build` E1–E14 PASSED ×3.
**Documented deviations (founder to ratify):** ON_SITE not introduced (needs a state-machine change — deferred, accepted); clock-out stays at Timer "Done" (accurate duration + deterministic resume) rather than the contract's after-phase=IN_PROGRESS model.
**On-device honesty:** the new screens + counter were verified by deep-link screenshots; the full clock-in→timer→submit lifecycle was NOT driven on-device (date rolled to Jun 4 → no "today" visit; live-camera ANRs this emulator). Lifecycle rests on the test suites + the relocated-but-unchanged clock-in code. Recommend a founder phone walk with a real assigned visit.
