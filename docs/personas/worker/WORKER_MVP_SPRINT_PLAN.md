# Worker App — 3-Day Implementation Plan (DRAFT — not approved)

**Status:** AWAITING FOUNDER APPROVAL of first slice. No code until approved.
**Authority:** `MVP_V2_ALIGNED_PLAN.md` (canonical) + `DO_NOT_BUILD_MVP.md` (cut list) + visual reference HTML at `~/Downloads/Axhy Worker App _standalone_.html` + `.claude/rules/state-machines.md` (discipline).
**Scope:** 17 screens, 3 tabs, 22 endpoints, 3 new tables, **5 server state machines** (2 existing + 3 new for worker MVP).
**Sprint length:** 3 active days from approval. Pilot polish + Maestro + i18n catalogues run beyond Day 3.

> **Correction to canonical plan §7.** The canonical doc says "WorkerState, LeaveRequestState, SwapRequestState, AssignmentState stay server-side as enum fields." That phrasing is wrong by `.claude/rules/state-machines.md`:
>
> - `workerMachine` (15-state XState v5) already exists at `packages/state-machines/src/worker.ts` — `WorkerEvent.OTP_VERIFIED`, `LEAVE_APPROVED`, `SUSPEND` are real events.
> - `visitMachine` (12-state XState v5) exists at `packages/state-machines/src/visit.ts` — drives the capture flow.
> - `AssignmentState` has `canTransition()` guard at `packages/state-machines/src/assignment.ts`.
> - `LeaveRequestState`, `SwapRequestState`, `ReplacementInviteState`, `GrievanceState` do **not** exist yet — the worker MVP introduces them. They must be machines, not raw enums with direct DB writes.
>
> Every status mutation in this plan goes through the machine's transition function. No direct `prisma.x.update({ state })`. Every machine transition gets a real-DB test that proves the legal/illegal pair.

> The MVP plan in the source repo says "6 weeks build + 2 pilot". A 3-day sprint targets the **first complete vertical slice** (auth → home → capture → submit happy path) on the new tokens, not the whole 6-week scope. Day 3 ends with a real worker walking the happy path on a real device against `axhy-sandbox`, plus a documented punch list for Week 2+.

---

## §A — Architecture Inventory (checked before writing this plan)

> **Guardrail rule:** Every implementation plan must document existing architecture it builds upon.
> This section was checked against live code at plan-writing time. The `check_before_plan` guardrail
> tool enforces this inventory requirement — plans without it are blocked.

### Existing state machines (`packages/state-machines/src/`)

| Machine                 | File            | States                    | Key events used by this plan                                                                                                                  |
| ----------------------- | --------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `workerMachine`         | `worker.ts`     | 15 states (XState v5)     | `OTP_VERIFIED`, `LEAVE_APPROVED`, `LEAVE_RETURNED`, `SUSPEND`                                                                                 |
| `visitMachine`          | `visit.ts`      | 12 states (XState v5)     | `NOTIFY`, `WORKER_DEPART`, `WORKER_ARRIVE`, `CLOCK_IN`, `PHOTOS_UPLOADED`, `CLOCK_OUT`, `AI_VERIFIED`, `AI_FLAGGED`, `CANCEL`, `MARK_NO_SHOW` |
| `AssignmentState` guard | `assignment.ts` | guard + `canTransition()` | reads only at MVP                                                                                                                             |
| `calendarMachine`       | `calendar.ts`   | —                         | not touched by worker MVP                                                                                                                     |
| `conflictsMachine`      | `conflicts.ts`  | —                         | not touched by worker MVP                                                                                                                     |

### Existing Prisma schema (`packages/shared-schema/prisma/schema.prisma`)

Key tables this plan reads/writes: `User`, `Worker`, `Site`, `Assignment`, `SiteVisit`, `Photo`, `GpsTrailPoint`, `Notification`.
New tables introduced by this plan: `Grievance`, `WorkerDevicePush`, `ConsentLog`.

### Existing backend routes (`apps/backend/src/routes/`)

Reused: `/auth/otp/request`, `/auth/otp/verify`, `/auth/sign-out`, `/me`, `/worker/today`, `/worker/visits/:id/checkin`, `/worker/visits/:id/submit`, `/worker/visits/:id/photo`, `/worker/visits/:id/verify`, `/media/presign-batch`, `/worker/history`, `/worker/payroll/summary`.
New: `/worker/visits/:id`, `/worker/attendance`, `/worker/leave-requests`, `/worker/swaps`, `/worker/replacement-invites/:id/accept`, `/worker/replacement-invites/:id/decline`, `/worker/notifications`, `/worker/grievances`, `/worker/push/register`, `/worker/consent`.

### Existing mobile structure (`apps/mobile/app/`)

`(supervisor)/` tab group exists from supervisor sprint. `(auth)/` flow shared.
Worker gets sibling `(worker)/` tab group with 3 tabs: Home, History, Profile.

### Locked docs checked (`docs/locked/`)

Relevant: `security-gaps-to-fix.md` (DPDP consent requirement), `development-code-standards.md`, `operational-invariants.md`, `verification-checklists.md`.

### UI tokens (`packages/ui-tokens/src/`)

`native.ts` exports terracotta/paper/ink tokens. Worker screens use these; no new tokens created.

### Source hierarchy for this plan

| Tier        | Source                                        | Role in this plan                            |
| ----------- | --------------------------------------------- | -------------------------------------------- |
| 1 (highest) | `docs/locked/security-gaps-to-fix.md`         | DPDP consent requirement                     |
| 2           | `packages/state-machines/src/*.ts`            | Existing machines — plan MUST NOT contradict |
| 2           | `packages/shared-schema/prisma/schema.prisma` | Existing tables — plan reads these           |
| 3           | `MVP_V2_ALIGNED_PLAN.md`                      | Canonical product spec                       |
| 4           | `docs/personas/worker/*.md`                   | UI reference only (NOT implementation truth) |
| 5           | This file                                     | Generated sprint plan — lowest authority     |

> **⚠️ SUPERSEDED LANGUAGE:** The canonical plan §7 originally said "WorkerState, LeaveRequestState,
> SwapRequestState, AssignmentState stay server-side as enum fields." That phrasing is **wrong** and
> **superseded** by the existing state machine architecture (tier 2). See correction note at top of this file.
> All state mutations go through machine transition functions, not raw enum updates.

## §0 — State machine discipline (THE SPINE)

### Machines this sprint touches

| Machine                    | Location                                    | Status      | Worker MVP events fired                                                                                                                                |
| -------------------------- | ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workerMachine`            | `packages/state-machines/src/worker.ts`     | exists      | `OTP_VERIFIED` (D1), `LEAVE_APPROVED` (D2), `LEAVE_RETURNED` (D2), `SUSPEND` (D3 mark-absent)                                                          |
| `visitMachine`             | `packages/state-machines/src/visit.ts`      | exists      | `NOTIFY`, `WORKER_DEPART`, `WORKER_ARRIVE`, `CLOCK_IN`, `PHOTOS_UPLOADED`, `CLOCK_OUT`, `AI_VERIFIED`, `AI_FLAGGED`, `CANCEL`, `MARK_NO_SHOW` (all D2) |
| `AssignmentState` guard    | `packages/state-machines/src/assignment.ts` | exists      | reads only at MVP (no transitions worker-side)                                                                                                         |
| `replacementInviteMachine` | **NEW** D3                                  | needs build | `INVITE_SENT` (server), `ACCEPTED`, `DECLINED`, `EXPIRED` (server TTL), `CANCELLED`                                                                    |
| `leaveRequestMachine`      | **NEW** D2                                  | needs build | `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`                                                                                                       |
| `swapRequestMachine`       | **NEW** D2                                  | needs build | `SUBMITTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`                                                                                                       |
| `grievanceMachine`         | **NEW** D3                                  | needs build | `OPENED`, `ACKNOWLEDGED`, `IN_REVIEW`, `RESOLVED`, `CLOSED`                                                                                            |

### Rules (non-negotiable)

1. **No raw `prisma.x.update({ data: { state } })`.** Every state column update goes through the machine's transition function via a service in `apps/backend/src/lib/services/`.
2. **Machine guards are pure.** No DB reads, no clock reads, no random. Compute inputs in the service; pass values into the machine.
3. **Every transition writes an audit event via the outbox.** Handled by the backend, not the machine — but the service must enqueue the event in the same transaction as the row update.
4. **Real-DB tests per transition.** For each new machine, the test suite must prove the legal-edge transition succeeds AND a representative illegal-edge transition is rejected.
5. **Worker app reads state; never simulates.** The mobile client renders from server state. If a button needs to know whether a transition is legal, the server tells it via a `canX` boolean in the response, not by re-running the machine on device. (Exception: optimistic UI for visit checkin can advance `IN_PROGRESS` locally for ≤2s while the request is in flight — but it rolls back on error.)
6. **No machine without a `.test.ts`.** All 4 new machines ship with a test file at green before the first endpoint that fires them lands.

### Endpoint → machine event map

| Endpoint                                                 | Fires                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `POST /auth/otp/verify`                                  | `workerMachine` ← `OTP_VERIFIED` (if first verify)                                  |
| `POST /worker/visits/:id/checkin`                        | `visitMachine` ← `WORKER_ARRIVE` + `CLOCK_IN`                                       |
| `POST /worker/visits/:id/photo` (last before-photo)      | `visitMachine` (no transition; only count update)                                   |
| `POST /worker/visits/:id/submit`                         | `visitMachine` ← `PHOTOS_UPLOADED` → `AWAITING_VERIFICATION`                        |
| `GET /worker/visits/:id/verify` (server-side completion) | `visitMachine` ← `AI_VERIFIED` or `AI_FLAGGED`                                      |
| `POST /worker/leave-requests`                            | `leaveRequestMachine` ← `SUBMITTED`                                                 |
| (admin/supervisor) leave approve                         | `leaveRequestMachine` ← `APPROVED` + `workerMachine` ← `LEAVE_APPROVED`             |
| `POST /worker/swaps`                                     | `swapRequestMachine` ← `SUBMITTED`                                                  |
| `POST /worker/replacement-invites/:id/accept`            | `replacementInviteMachine` ← `ACCEPTED` + `visitMachine` ← reassignment side-effect |
| `POST /worker/replacement-invites/:id/decline`           | `replacementInviteMachine` ← `DECLINED`                                             |
| Replacement TTL job (cron)                               | `replacementInviteMachine` ← `EXPIRED`                                              |
| `POST /worker/grievances`                                | `grievanceMachine` ← `OPENED`                                                       |

### What does NOT use a machine

- `ConsentLog` — append-only audit row. Insert only, no state transitions.
- `WorkerDevicePush` — push token registry. Upsert only.
- Read-only routes (`/worker/today`, `/worker/history`, `/worker/notifications`, `/me`).

---

## §1 — 3-day implementation plan

### Day 1 — Foundation + Auth flow (4 screens)

**Goal:** Splash → Login → OTP → Permissions works end-to-end on `axhy-sandbox` with new terracotta tokens. Worker tab shell renders empty Today/History/Profile.

1. **Tokens audit + worker import path** (≤30 min) — verify `packages/ui-tokens/src/native.ts` exports terracotta/paper/ink. If anything diverges from §4 of the canonical plan, surface to founder before edits.
2. **Scaffold `apps/mobile/app/(worker)/`** — `_layout.tsx` with 3 tabs (Home/History/Profile), placeholder screens. Mirror `(supervisor)/_layout.tsx` structure; do not duplicate the supervisor tab order.
3. **Splash** — port V2 `SplashScreen.tsx`, re-skin, restore session via existing `/me`.
4. **Login (phone input)** — port V2 `LoginScreen.tsx`. Reuse backend `/auth/otp/request` from supervisor sprint (already shipped per `done-memo-p1-5b-bootstrap-seed.md`).
5. **OTP (6-cell)** — port V2 `OTPScreen.tsx`. Reuse `/auth/otp/verify`. Multi-role JWT code path kept but single-membership renders straight through (no picker — `MVP_V2_ALIGNED_PLAN.md` §13 M7). **Backend `/auth/otp/verify` must fire `workerMachine.send({ type: 'OTP_VERIFIED' })` for first-time worker activation** — not a direct `prisma.worker.update({ state: 'ACTIVE' })`. Audit the existing handler to confirm; if it does a raw update, fix as part of this slice.
6. **Permissions** — Camera required, Location required, Notifications optional. Single page (no carousel — M22).
7. **One-page DPDP consent** at first run — write `ConsentLog { acceptedAt, policyVersion }` (no machine; append-only). Backend route: new `POST /worker/consent`.
8. **Real-DB integration tests** for auth + consent against sandbox. **Plus:** test that `workerMachine` rejects `OTP_VERIFIED` from terminal states (TERMINATED, ARCHIVED, ANONYMIZED) so a deleted worker cannot log back in.
9. **Visual smoke:** open the canonical design HTML in a browser side-by-side, walk auth flow on Redmi Note 8 emulator, screenshot deltas.

**Done bar Day 1:** Worker can log in on sandbox and land on an empty Worker Home with the new tokens.

### Day 2 — Worker Home + Capture flow (8 screens + 1 tab)

**Goal:** Capture happy path runs end-to-end. Earnings folds into History.

1. **Worker Home** (`07_today_home.md` MVP slice only) — assignment list, bell top-right, banners (supervisor decision, late warning, visit cancelled, account paused, holiday). NO chat sub-tab, NO decision inbox link.
2. **Assignment Detail** — site card with tap-to-call supervisor (`tel:` link), "Can't make this" sheet → POST `/worker/swaps` (fires `swapRequestMachine ← SUBMITTED`).
3. **Capture flow** (8 screens, V2 1:1) — every transition through `visitMachine`:
   - QR Scan — gated on site flag; default off. (No transition; arrival recorded by checkin.)
   - Before Camera (≥3 photos) + Before Gallery. Checkin fires `WORKER_ARRIVE` + `CLOCK_IN`.
   - Cleaning Timer (countdown + GPS + motion; `expo-keep-awake` on). State = `IN_PROGRESS`.
   - After Camera + After Gallery.
   - Final Review.
   - Submit Success — fires `PHOTOS_UPLOADED` → state moves to `AWAITING_VERIFICATION`. Combined with Verification Result per `MVP_V2_ALIGNED_PLAN.md` §14 (poll `/worker/visits/:id/verify`; backend fires `AI_VERIFIED` or `AI_FLAGGED`).
4. **History tab** (`22_history_calendar.md` MVP slice) — week calendar, day-detail visits, earnings summary embedded (no separate Pay tab). Read-only; no machine transitions.
5. **Leave sheet** from Worker Home — POST `/worker/leave-requests` (fires `leaveRequestMachine ← SUBMITTED`; **also** plans the future `workerMachine ← LEAVE_APPROVED` transition that fires when supervisor/HR approves on admin side).
6. **Backend routes** to add: `GET /worker/visits/:id`, `GET /worker/attendance`, `POST /worker/leave-requests`, `GET /worker/leave-requests`, `POST /worker/swaps`, `POST /worker/replacement-invites/:id/accept`, `POST /worker/replacement-invites/:id/decline`.
7. **New state machines:** ship `leaveRequestMachine` + `swapRequestMachine` in `packages/state-machines/src/` with full `.test.ts` (legal-edge + illegal-edge cases) before the corresponding endpoint lands.
8. **Real-DB tests** for every worker-callable endpoint touched + machine guards.

**Done bar Day 2:** Worker captures a full visit on sandbox; result polls and renders.

### Day 3 — Connection layer + Profile + ship gate

**Goal:** Supervisor↔worker touchpoints T1, T3, T4, T5, T7-lite work. Profile + Grievance + Notifications shipped. Panel review batched at end.

1. **Notifications list** (`34_notifications_list.md` MVP slice) — universal bell. Rows: replacement invites (Accept/Decline inline — no full-screen takeover), supervisor decisions, system/payroll notices. Tap → deep-link. Server TTL on replacement invites = 5 min (M4) → cron fires `replacementInviteMachine ← EXPIRED`. Accept/Decline fire `ACCEPTED`/`DECLINED`. Race-safe: only the first `ACCEPTED` for an invite ID transitions; the rest see "no longer available" — proved by a real-DB concurrent-acceptance test (Critic-Reliability R-replacement-race).
2. **Push registration** — `POST /worker/push/register`. OneSignal `external_id = User.id` per `project_onesignal_architecture_db_owns_truth.md`. Upsert only; no machine.
3. **Profile** — V2 1:1 minus theme picker (M14). Includes language switcher (en/hi/te only). Read-only state surface.
4. **Grievance form** (`46_grievance.md` MVP slice) — 4 categories (WAGES / WORKING_CONDITIONS / SUPERVISOR / OTHER), no date window restriction (Critic-Field-Ops F1). POST `/worker/grievances` fires `grievanceMachine ← OPENED`.
5. **New state machines:** ship `replacementInviteMachine` + `grievanceMachine` in `packages/state-machines/src/` with `.test.ts` before endpoints land.
6. **Schema migration** — add `Grievance`, `WorkerDevicePush`, `ConsentLog`. The `Grievance` table's `state` column maps to `grievanceMachine` value type. Reversible. No RLS at MVP (M25).
7. **i18n scaffolding** — Hindi + Telugu catalogues seeded (en complete, hi/te = English strings with TODO markers; full translation in Week 6 per canonical §10).
8. **Adversarial panel review** (single batch) via Playwright captures of all 17 screens — per `feedback_panel_test_before_production_surface.md`. BLOCKING before founder sees rendered app.
9. **Real-life simulation:** full worker flow on `axhy-sandbox` end-to-end, on Redmi Note 8.
10. **Done memo:** `axhy-v3/handoff/done-memo-worker-mvp-sprint.md`.
11. **Sentry events** (no PostHog) — capture, login, submit, fail.

**Done bar Day 3:** Worker MVP runs end-to-end on sandbox, panel-reviewed, with documented Week 2+ punch list.

---

## §2 — Source coverage matrix

Every MVP artifact must point to ≥1 source. Sources: **C** = canonical (`MVP_V2_ALIGNED_PLAN.md`), **V** = V2 code at `_archive/codebases/eclean-v2-b2b/`, **P** = persona-worker spec file (reference only — NOT implementation truth), **D** = design HTML, **L** = locked doc in `axhy-v3/docs/locked/`, **M** = v3 memory entry, **Arch** = existing architecture source (state machine, schema, or route that this artifact MUST reconcile against).

| MVP artifact               | C                  | V                                 | P                                                        | D   | L                                     | M                                                                       | Arch                             | First-touch day |
| -------------------------- | ------------------ | --------------------------------- | -------------------------------------------------------- | --- | ------------------------------------- | ----------------------------------------------------------------------- | -------------------------------- | --------------- |
| Splash                     | §2.1               | `SplashScreen.tsx`                | `01_splash.md`                                           | ✓   | —                                     | —                                                                       | auth routes                      | D1              |
| Login                      | §2.2               | `LoginScreen.tsx`                 | `03_phone_login.md`                                      | ✓   | —                                     | —                                                                       | auth routes                      | D1              |
| OTP                        | §2.3               | `OTPScreen.tsx`                   | `04_otp_verify.md`                                       | ✓   | —                                     | —                                                                       | auth routes + `workerMachine`    | D1              |
| Permissions                | §2.4               | `PermissionsScreen.tsx`           | `05_permissions.md`                                      | ✓   | —                                     | M22 cut                                                                 | —                                | D1              |
| Consent (1-page)           | §13 M22            | —                                 | (subset of `02_onboarding_intro_carousel.md`)            | ✓   | DPDP `locked/security-gaps-to-fix.md` | —                                                                       | DPDP locked doc                  | D1              |
| Worker Home                | §2.5               | `WorkerHomeScreen.tsx`            | `07_today_home.md`                                       | ✓   | —                                     | `feedback_supervisor_no_visit_mark_button.md` (mirror rule for workers) | `visitMachine` + `workerMachine` | D2              |
| Assignment Detail          | §3 (tap-to-call)   | (V2 inline detail)                | `08_assignment_detail.md`                                | ✓   | —                                     | —                                                                       | `assignment.ts` guard            | D2              |
| QR Scan                    | §2.8 (conditional) | `QRScanScreen.tsx`                | `11_qr_scan.md`                                          | ✓   | —                                     | —                                                                       | `visitMachine`                   | D2              |
| Before Camera              | §2.9               | `CameraScreen.tsx@CameraBefore`   | `12_before_camera.md`                                    | ✓   | —                                     | `feedback_keep_awake_work_screens.md`                                   | `visitMachine`                   | D2              |
| Before Gallery             | §2.10              | `GalleryScreen.tsx@GalleryBefore` | `13_before_gallery.md`                                   | ✓   | —                                     | —                                                                       | `visitMachine`                   | D2              |
| Cleaning Timer             | §2.11              | `CleaningTimerScreen.tsx`         | `14_cleaning_timer.md`                                   | ✓   | —                                     | `feedback_keep_awake_work_screens.md`                                   | `visitMachine`                   | D2              |
| After Camera               | §2.12              | `CameraScreen.tsx@CameraAfter`    | `15_after_camera.md`                                     | ✓   | —                                     | —                                                                       | `visitMachine`                   | D2              |
| After Gallery              | §2.13              | `GalleryScreen.tsx@GalleryAfter`  | `16_after_gallery.md`                                    | ✓   | —                                     | —                                                                       | `visitMachine`                   | D2              |
| Final Review               | §2.14              | `FinalReviewScreen.tsx`           | `18_final_review.md`                                     | ✓   | —                                     | —                                                                       | `visitMachine`                   | D2              |
| Submit + Verify (combined) | §2.15              | `SuccessScreen.tsx`               | `19_submit_success.md` + `21_verification_result.md`     | ✓   | —                                     | —                                                                       | `visitMachine`                   | D2              |
| History                    | §2.6               | `HistoryScreen.tsx`               | `22_history_calendar.md` (+ Pay folded in)               | ✓   | —                                     | —                                                                       | read-only                        | D2              |
| Profile                    | §2.7               | `ProfileScreen.tsx`               | `37_profile.md`                                          | ✓   | —                                     | —                                                                       | read-only                        | D3              |
| Notifications list         | §2.16              | (new)                             | `34_notifications_list.md`                               | ✓   | —                                     | `project_onesignal_architecture_db_owns_truth.md`                       | —                                | D3              |
| Grievance form             | §2.17              | (new)                             | `46_grievance.md`                                        | ✓   | —                                     | F1 from `MVP_V2_ALIGNED_PLAN.md §13`                                    | NEW `grievanceMachine`           | D3              |
| Leave (sheet)              | §3                 | (new)                             | `25_leave_request.md` (single-day subset)                | ✓   | —                                     | —                                                                       | NEW `leaveRequestMachine`        | D2              |
| Swap (sheet)               | §3                 | (new)                             | `27_swap_request.md` (no urgency tier)                   | ✓   | —                                     | —                                                                       | NEW `swapRequestMachine`         | D2              |
| Replacement invite         | §3 T7-lite         | (new)                             | `28_..._inbox.md` + `29_..._accept.md` (list-row subset) | ✓   | —                                     | `feedback_replacement_invite_single_recipient.md`                       | NEW `replacementInviteMachine`   | D3              |

### Endpoints (22) — source coverage

| #   | Endpoint                                       | C   | V2 file            | New?           | Day |
| --- | ---------------------------------------------- | --- | ------------------ | -------------- | --- |
| 1   | POST `/auth/otp/request`                       | §5  | `auth.routes:29`   | reuse          | D1  |
| 2   | POST `/auth/otp/verify`                        | §5  | `auth.routes:36`   | reuse          | D1  |
| 3   | POST `/auth/sign-out`                          | §5  | `auth.routes:56`   | reuse          | D1  |
| 4   | GET `/me`                                      | §5  | `auth.routes:46`   | reuse          | D1  |
| 5   | GET `/worker/today`                            | §5  | `sites.routes:12`  | reuse          | D2  |
| 6   | GET `/worker/visits/:id`                       | §5  | —                  | new            | D2  |
| 7   | POST `/worker/visits/:id/checkin`              | §5  | `sites.routes:22`  | reuse          | D2  |
| 8   | POST `/worker/visits/:id/submit`               | §5  | `sites.routes:56`  | reuse          | D2  |
| 9   | POST `/worker/visits/:id/photo`                | §5  | `sites.routes:78`  | reuse          | D2  |
| 10  | GET `/worker/visits/:id/verify`                | §5  | `verify.routes:32` | reuse          | D2  |
| 11  | POST `/media/presign-batch`                    | §5  | `media.routes:27`  | reuse          | D2  |
| 12  | GET `/worker/history?date=…`                   | §5  | `worker.routes:12` | reuse          | D2  |
| 13  | GET `/worker/attendance?yyyy-mm`               | §5  | —                  | new            | D2  |
| 14  | POST `/worker/leave-requests`                  | §5  | —                  | new            | D2  |
| 15  | GET `/worker/leave-requests`                   | §5  | —                  | new            | D2  |
| 16  | POST `/worker/swaps`                           | §5  | —                  | new            | D2  |
| 17  | POST `/worker/replacement-invites/:id/accept`  | §5  | —                  | new            | D3  |
| 18  | POST `/worker/replacement-invites/:id/decline` | §5  | —                  | new            | D3  |
| 19  | GET `/worker/payroll/summary`                  | §5  | `worker.routes:28` | reuse + extend | D2  |
| 20  | GET `/worker/notifications`                    | §5  | —                  | new            | D3  |
| 21  | POST `/worker/grievances`                      | §5  | —                  | new            | D3  |
| 22  | POST `/worker/push/register`                   | §5  | —                  | new            | D3  |

### Tables (3 new)

| Table              | C   | Spec                                          | Day |
| ------------------ | --- | --------------------------------------------- | --- |
| `Grievance`        | §6  | `09_DATABASE_SCHEMA.md` §A.X (minimal subset) | D3  |
| `WorkerDevicePush` | §6  | `09_DATABASE_SCHEMA.md §A.3`                  | D3  |
| `ConsentLog`       | §6  | `09_DATABASE_SCHEMA.md §A.11` (simplified)    | D1  |

---

## §3 — Day 1 file list

### Create (new files)

- `apps/mobile/app/(worker)/_layout.tsx`
- `apps/mobile/app/(worker)/index.tsx` (Worker Home placeholder, full impl Day 2)
- `apps/mobile/app/(worker)/history.tsx` (placeholder)
- `apps/mobile/app/(worker)/profile.tsx` (placeholder)
- `apps/mobile/app/(worker)/_login.tsx` (or extend existing (auth) flow with `role=worker` branch)
- `apps/mobile/app/(auth)/worker-otp.tsx` (if (auth) splits worker/supervisor)
- `apps/mobile/app/(auth)/permissions.tsx`
- `apps/mobile/app/(auth)/consent.tsx`
- `apps/mobile/components/worker/AuthHeader.tsx`
- `apps/mobile/components/worker/OtpCells.tsx`
- `apps/mobile/lib/queries/use-consent.ts`
- `apps/backend/src/routes/worker-consent.ts`
- `apps/backend/test/worker-consent.test.ts`
- `packages/shared-schema/src/zod/worker-consent.ts`
- `apps/mobile/screenshots-worker/README.md`
- `apps/mobile/scripts/screenshot-worker-d1.mjs`

### Modify

- `apps/mobile/app/_layout.tsx` (register (worker) route)
- `apps/backend/src/server.ts` (register `/worker/consent`)
- `packages/shared-schema/src/index.ts` (re-exports)
- `apps/backend/prisma/schema.prisma` (add `ConsentLog`)
- `packages/ui-tokens/src/native.ts` (verify only; modify only if a token is missing)

### Audit only (no edits)

- `_archive/codebases/eclean-v2-b2b/mobile/src/plugs/auth/screens/{SplashScreen,LoginScreen,OTPScreen,PermissionsScreen}.tsx` — port reference
- `~/Downloads/Axhy Worker App _standalone_.html` — visual reference; founder opens in browser, I screenshot deltas
- `packages/state-machines/src/worker.ts` — confirm `workerMachine` handles `OTP_VERIFIED` correctly for first-time activation
- `apps/backend/src/routes/auth.ts` — audit existing `/auth/otp/verify` handler: does it transition through `workerMachine` or update DB directly? If direct, that's a slice-1 fix.

---

## §4 — Blocking founder questions

Answer these before Day 1 starts. Italicised text is my best-guess default if no answer comes back; I will proceed on the default only if you say "go with defaults".

1. **Approve the V2-pivot + 17-screen scope** in `MVP_V2_ALIGNED_PLAN.md §2`? Yes / No / amend.
   _Default: yes — pivot is consistent with `feedback_make_it_exist_dont_defer.md` minus the cut list._

2. **Where does (worker) tab live in `apps/mobile/`?**
   - (a) Sibling to (supervisor) under same root layout — single app, role-gated tab tree.
   - (b) Separate Expo app `apps/worker-mobile/` — two binaries, two App Store entries.
     _Default: (a). Founder pivoted away from two-app split in supervisor sprint per `MEMORY_V3.md`; keeping single binary unless founder reverses._

3. **Visual reference workflow.** The HTML at `~/Downloads/Axhy Worker App _standalone_.html` is canonical. Best workflow:
   - (a) Founder opens in browser, screenshots each screen, drops PNGs in `apps/mobile/screenshots-worker/design-source/`.
   - (b) I run Playwright headlessly against `file://` URL, capture all states, save to that folder.
   - (c) Both.
     _Default: (b) — automatable, repeatable. Founder reviews captures Day 0._

4. **(auth) folder reuse.** Existing `(auth)` was built for supervisor sprint. Does worker auth share the same OTP/Permissions screens or get its own?
   _Default: share — same OTP/permissions structure, role determined by JWT claim returned from `/auth/otp/verify`._

5. **Sandbox seeding.** Day 2 capture flow needs at least one worker assigned to a sandbox site with today's visit. Is `seed-sandbox.ts` already producing a worker fixture I can use, or do I need a new seed entry?
   _Default: I'll write a `seed-sandbox-worker.ts` extension; founder approves before run._

6. **Tap-to-call default.** Per `MVP_V2_ALIGNED_PLAN.md §3` tap-to-call fires native dialer with supervisor phone. Two unresolved:
   - Should worker's supervisor phone be visible on Assignment Detail (label "Supervisor: Suresh — Call")? Or hidden behind a single "Call supervisor" button that opens dialer with prefilled number?
     _Default: button only (matches Critic-Field-Ops privacy concern from `30_DIALECTICAL_LOG.md` reference)._

7. **i18n at Day 1.** Translation effort: do I scaffold en/hi/te catalogues empty (en strings only) and ship a "Hindi/Telugu coming Week 6" sheet, OR translate auth-flow strings now (≤30 strings)?
   _Default: scaffold all three keys, translate auth-flow now (Telugu founder can sanity-check Telugu copy Day 1)._

8. **Grievance escalation phone.** Founder personal phone as fallback per Critic-Field-Ops? Or shared `support@axhy.app` only?
   _Default: support@ only at MVP; founder phone added post-pilot if any grievance goes unanswered >48h._

9. **Sentry custom events list.** Final list for Sprint scope:
   - `worker_login_success` / `worker_login_failed`
   - `worker_capture_start` / `worker_capture_submit`
   - `worker_swap_filed` / `worker_leave_filed` / `worker_grievance_filed`
   - `worker_replacement_accepted` / `worker_replacement_declined`
   - `worker_offline_queued` / `worker_offline_drained`
     _Default: ship that list._

10. **Sprint mode (per `feedback_supervisor_sprint_mode.md`)?** Same rules as the supervisor sprint — batch panel review at end of Day 3, skip per-slice friend review, push to production each green slice? Or revert to pre-merge careful review?
    _Default: sprint mode ON. Reason: founder explicitly approved sprint mode for supervisor; consistency expected unless reversed._

---

## §5 — What NOT to build

See `DO_NOT_BUILD_MVP.md` (separate file). Summary categories:

- Old 57-screen scope
- Chat tab, Pay tab, theme picker, training, Aadhaar verification, bank verification, face enroll, voice messages, decision inbox, dispute UX, site rules viewer, multi-day leave, full QR infrastructure, PostHog, MMKV migration, background tasks

---

## §6 — First guarded implementation slice (AWAITING APPROVAL)

**Slice name:** `worker-d1-s1-auth-shell`
**Estimated size:** ~12 files created, 3 modified, 1 schema migration.
**Estimated time:** 4–6h coding + 1h tests + 30 min visual smoke.
**No founder review per-rev (sprint mode); founder reviews this slice once before I start.**

### Scope (smallest meaningful vertical slice)

1. Scaffold `apps/mobile/app/(worker)/` with `_layout.tsx` + 3 placeholder tabs (Home/History/Profile).
2. Register (worker) route in `apps/mobile/app/_layout.tsx`. Gate on JWT claim `role === 'WORKER'`. Default role from supervisor sprint stays gated to `(supervisor)`.
3. Verify `packages/ui-tokens/src/native.ts` exposes terracotta/paper/ink — if any token missing, surface to founder before adding.
4. Port V2 Splash + Login + OTP + Permissions screens with new tokens. Reuse existing `(auth)` infrastructure where possible; do not duplicate OTP backend logic.
5. Add `ConsentLog` Prisma model (reversible migration). Add `POST /worker/consent` route. Add real-DB integration test.
6. One-page consent screen at first-run, wires `POST /worker/consent`, then routes to (worker) home.
7. Maestro flow: Login → OTP → Permissions → Consent → Worker Home (empty).
8. Playwright capture of all 4 auth screens vs design HTML; diffs into `screenshots-worker/d1-deltas/`.

### Guardrails enforced

- `check_before_edit` intent text per file: includes "MVP cut list verified" + a pointer to the relevant section of `MVP_V2_ALIGNED_PLAN.md`.
- Read-before-edit on every V2 source file before porting.
- Real-DB tests against `axhy-sandbox` for the new `/worker/consent` route. No mocks.
- Typecheck before declaring done: `pnpm --filter @axhy/mobile typecheck && pnpm --filter @axhy/backend typecheck`.
- Audit must stay clean for any new files under `apps/mobile/app/(worker)/` and `apps/backend/src/routes/worker-*`. (Known: 4 backend mediums exist unrelated to worker; tracked separately, not blocking.)
- No commits until slice done. One commit per slice with message linking to `MVP_V2_ALIGNED_PLAN.md` section + this plan file.
- After tests + handoff memo: stop. Wait for founder decision on slice 2.

### Source coverage for this slice

| File                            | Source                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `_layout.tsx`, tab placeholders | `MVP_V2_ALIGNED_PLAN.md §2` + `(supervisor)/_layout.tsx`                                                     |
| Splash                          | V2 `SplashScreen.tsx` + design HTML + `01_splash.md`                                                         |
| Login                           | V2 `LoginScreen.tsx` + design HTML + `03_phone_login.md`                                                     |
| OTP                             | V2 `OTPScreen.tsx` + design HTML + `04_otp_verify.md`                                                        |
| Permissions                     | V2 `PermissionsScreen.tsx` + design HTML + `05_permissions.md`                                               |
| Consent                         | `MVP_V2_ALIGNED_PLAN.md §13 M22` + DPDP locked doc                                                           |
| `ConsentLog` migration          | `MVP_V2_ALIGNED_PLAN.md §6` + `09_DATABASE_SCHEMA.md §A.11`                                                  |
| `POST /worker/consent`          | `MVP_V2_ALIGNED_PLAN.md §5` (new endpoint not in original 22 — adding because consent flow is Day 1 blocker) |

### Open assumption (will surface in next_questions)

- The consent route is **not in the canonical 22-endpoint list**. It is required by DPDP and called out in §13 M22 but no path was specified. Proposed path `POST /worker/consent`. If founder wants different path or a column on `User` instead of a separate table, say so before approval.

### Stop conditions for this slice

After:

1. Typecheck green (both packages).
2. Real-DB consent test green on sandbox.
3. Maestro auth-flow happy path green on Redmi Note 8 emulator.
4. Playwright captures saved to `screenshots-worker/d1-deltas/`.
5. Done memo `axhy-v3/handoff/done-memo-worker-d1-s1-auth-shell.md` written.

I stop and wait. Day 1 Slice 2 (banners + bell shell on Worker Home, plus `/worker/today` wiring) only starts on founder approval.

---

## §7 — What happens after Day 3

Days 4–14 (within the 6-week canonical window): i18n full translation (hi/te), Maestro full happy-path on 2 devices, Sentry event coverage, Hindi voice samples QA'd by founder, then pilot company onboarding. Not in this 3-day plan. Re-plan after Day 3 done memo.

---

**Status:** DRAFT. **Author:** Claude (lean boot session 2026-05-21). **Awaits:** founder approval of `worker-d1-s1-auth-shell` before any code writes.
