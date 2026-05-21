# Worker MVP Slice 2a — Worker Home + Assignment Detail + `/worker/today` (sub-slice 2a-1 EXECUTED 2026-05-21)

**Status:** Sub-slice 2a-1 (backend `/worker/today` + `/worker/visits/:id`) **EXECUTED 2026-05-21** (commit `af926ab`). Sub-slice 2a-2 (mobile Home + Assignment Detail) awaits approval.
**Authority:** `MVP_V2_ALIGNED_PLAN.md` (canonical) + `DO_NOT_BUILD_MVP.md` (cut list) + `WORKER_MVP_SPRINT_PLAN.md §1 Day 2` (parent) + decisions registered 2026-05-21: 3-tab canonical wins, theme picker confirmed cut, capture-resume surfaces as Home banner not 4th tab.
**Scope:** 3 mobile screens touched (Worker Home wired + new Assignment Detail + Home bell stub) • 2 backend routes (`GET /worker/today`, `GET /worker/visits/:id`) • 1 new tx-callable service • 0 new state machines • 0 schema changes.
**Parent slice:** 2a of 3 (next: 2b capture flow + photo pipeline; then 2c leave/swap/replacement). Each sub-slice has its own check_before_done gate.

---

## §A — Architecture Inventory (checked before writing this plan)

### Existing state machines (`packages/state-machines/src/`)

| Machine                    | File              | States this slice reads                                                                                                                                                                                    | Events this slice fires                                                                    |
| -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `visitMachine`             | `visit.ts`        | `SCHEDULED`, `NOTIFIED`, `EN_ROUTE`, `ON_SITE`, `IN_PROGRESS`, `PHOTOS_PENDING`, `AWAITING_VERIFICATION`, `VERIFIED`, `FLAGGED`, `CANCELLED`, `NO_SHOW` (read for status badges + resume-banner predicate) | **none** — 2a reads visit state; 2b fires `WORKER_ARRIVE` / `CLOCK_IN` / `PHOTOS_UPLOADED` |
| `workerMachine`            | `worker.ts`       | `ACTIVE`, `ON_LEAVE`, `ON_SUSPENSION`, `BLOCKED`, `ABSENT`, `AT_RISK` (read for "account paused" banner)                                                                                                   | **none** — fires in slice 1 (`OTP_VERIFIED`) + 2c (`LEAVE_APPROVED`)                       |
| `replacementInviteMachine` | **not yet built** | —                                                                                                                                                                                                          | **none** — 2c ships this                                                                   |
| `leaveRequestMachine`      | **not yet built** | —                                                                                                                                                                                                          | **none** — 2c ships this                                                                   |
| `swapRequestMachine`       | **not yet built** | —                                                                                                                                                                                                          | **none** — 2c ships this                                                                   |

### Existing Prisma schema (`packages/shared-schema/prisma/schema.prisma`)

Read by this slice: `Worker`, `Visit`, `Site`, `Assignment`, `User`, `Membership`, `Company`, `SiteSupervisorBinding`. No new tables. No column additions. No constraint changes.

### Existing backend routes (`apps/backend/src/routes/`)

Audited: `workers.ts` exists with `POST /workers/:id/mark-absent` only (supervisor-side). No `/worker/today` route. No `/worker/visits/:id` route. Both are greenfield (canonical called them "reuse from V2" but V2 backend lives in `_archive/` and isn't importable).

Reused unchanged: `/auth/otp/verify` (shipped slice 1), `/me` (shipped earlier), `/worker/consent` (shipped slice 1).

### Existing mobile structure (`apps/mobile/app/`)

`(worker)/_layout.tsx` (3-tab scaffold), `(worker)/index.tsx` (placeholder — will be rewritten as real Home), `(worker)/history.tsx` (placeholder — unchanged in 2a), `(worker)/profile.tsx` (placeholder — unchanged in 2a). No `visit/[id]` route yet — new in 2a.

### Locked docs checked (`docs/locked/`)

Relevant: `chat-error-scenarios.md` (read for error-state copy patterns), `verification-checklists.md` (state-change ordering — N/A here since 2a doesn't transition state), `operational-invariants.md` (idempotency on writes — automatic for GETs).

### UI tokens (`packages/ui-tokens/src/index.ts`)

Reuses existing terracotta-paper tokens. No new tokens needed. State badges use existing `tokens.color.semantic.{ok,warn,bad}` + `tokens.color.brand.accent`.

### Source hierarchy for this plan

| Tier        | Source                                                                   | Role in this plan                                                                                                 |
| ----------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1 (highest) | `.claude/rules/state-machines.md`                                        | Read-only on `visitMachine` / `workerMachine` — no transitions in 2a                                              |
| 1           | `docs/locked/operational-invariants.md`                                  | Idempotency on writes — N/A; 2a is read-only                                                                      |
| 2           | `packages/state-machines/src/visit.ts` + `worker.ts`                     | State value vocabulary for UI badges + banners                                                                    |
| 2           | `packages/shared-schema/prisma/schema.prisma`                            | Existing tables read by `/worker/today`                                                                           |
| 2           | `apps/mobile/lib/api-routes.ts` (from slice 1)                           | Path-builder source of truth — `API_ROUTES.workerToday`, `NAV_ROUTES.workerVisitDetail` added in this slice       |
| 3           | `MVP_V2_ALIGNED_PLAN.md` §2 + §3                                         | Canonical scope: 17-screen MVP, T1 + T3 + T4 touchpoints                                                          |
| 3           | `DO_NOT_BUILD_MVP.md`                                                    | Cut list — verifies the stubbed "Can't make this" button is on the deferred-not-removed list                      |
| 4           | `persona-worker/07_screens/07_today_home.md` + `08_assignment_detail.md` | UI reference (anatomy, copy strings, edge cases) — NOT implementation truth without reconciling against canonical |
| 5           | This file                                                                | Generated sprint plan — lowest authority                                                                          |
| 6 (visual)  | `~/Downloads/Axhy Worker App _standalone_.html` phone-screen #1 (Home)   | Visual reference for layout — pixel comparison runs at slice done                                                 |

> **⚠️ Decisions registered 2026-05-21 that constrain this slice:**
>
> - 3-tab nav canonical (Home / History / Profile). The design HTML's 4-tab (Today / Capture / History / You) is **superseded** — `Capture` surfaces as a sticky banner on Home, not as a tab. Plan calls this out in §1.
> - Theme picker **cut at MVP**. Confirmed via `DO_NOT_BUILD_MVP.md`. Profile-screen design with theme picker is reference-only; not built in 2a or 2c.
> - "Can't make this" button on Assignment Detail is a **disabled stub** in 2a; the swap workflow ships in 2c. Stub copy: "Coming with leave / swap support."

---

## §0 — State machine discipline (THE SPINE)

### What 2a does and doesn't touch

| Action                                                         | Machine              | Notes                                                                                    |
| -------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `GET /worker/today` returns `visit.state` per assignment       | none — read-only     | UI maps state value → badge color + label                                                |
| `GET /worker/visits/:id` returns visit + site + photo metadata | none — read-only     | Same shape as above, single-visit                                                        |
| Worker Home "resume capture" banner predicate                  | none — read-only     | Predicate: `visit.state IN (EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING)`             |
| Worker Home "account paused" banner predicate                  | none — read-only     | Predicate: `worker.state IN (ON_SUSPENSION, BLOCKED, TERMINATION_PENDING)`               |
| Worker Home "late warning" banner predicate                    | none — read-only     | Predicate: `now() > visit.scheduledFor + grace AND visit.state IN (SCHEDULED, NOTIFIED)` |
| "Can't make this" button tap                                   | none — disabled stub | Real swap flow + `swapRequestMachine` lands in 2c                                        |
| Tap-to-call supervisor                                         | none — native dialer | `tel:` link, no API call                                                                 |

### Rules (carried from slice 1)

1. No raw status writes — but **2a writes nothing**, so this is structurally true.
2. UI never simulates state — every status value comes from the backend response, never derived client-side from intermediate fields. The `Visit.state` column (driven by `visitMachine` server-side) is the source of truth for badges.
3. Real-DB tests for both new endpoints, covering happy + edge + auth paths.

### Endpoint → machine event map

**None.** 2a introduces 2 GET-only endpoints. No state mutations. The machines stay quiet.

---

## §1 — Scope (2a, single continuous sub-slice)

### Mobile (3 screens touched)

1. **Worker Home (`(worker)/index.tsx`) — rewrite from placeholder to real**
   - Top app bar: avatar (24dp, tappable → Profile) + greeting "Hi {firstName}" + bell icon (top-right) — bell badge data deferred to Day 3 (always shows a dot in 2a; tap is a no-op with "Notifications coming soon" toast).
   - Date row: "Wednesday, 21 May" + "{N} sites today" caption.
   - **Resume-capture banner (NEW, top-of-list)** — sticky card shown when any visit is in `EN_ROUTE`/`ON_SITE`/`IN_PROGRESS`/`PHOTOS_PENDING`. Card shows: site name, photos-taken-so-far count, single "Continue capture →" CTA. Tap navigates to capture flow (target slice 2b — until then, navigates to Assignment Detail).
   - Conditional banners (stacked under resume-capture):
     - **Account paused** (red): `worker.state` in `ON_SUSPENSION`/`BLOCKED`. Rest of screen is read-only when shown.
     - **Late warning** (yellow): `now() > visit.scheduledFor + grace` AND `visit.state` is `SCHEDULED`/`NOTIFIED`.
     - **Visit cancelled** (gray): `visit.state === 'CANCELLED'` and was cancelled today.
     - **Holiday** (green): today is a holiday per company calendar (Day 3 — stubbed off in 2a).
     - **Supervisor decision affecting this worker** (red dot): Day 3 — not in 2a (the notification system + decision-affects-worker join is slice 3 scope).
   - Assignment list (vertical scroll, time-ordered): `AssignmentCard` per visit. The card at the top of the not-yet-completed group has a "Next" badge + terracotta border.
   - Empty state: paper canvas with "No visits today" + plain-English subline ("Enjoy the rest day. Come back tomorrow.").
   - Pull-to-refresh: re-fetches `/worker/today`.

2. **Assignment Detail (`(worker)/visit/[id].tsx`) — NEW screen**
   - Top app bar with back chevron.
   - Site card: site name (large), full address (line-wrapped), scheduled-for time + duration estimate, current `visit.state` badge.
   - Map preview (deferred — slice 2b or later; in 2a a placeholder card with site coordinates as text).
   - **Tap-to-call supervisor button (WORKS in 2a)** — `tel:` link via `Linking.openURL` with the supervisor's phone (from worker's effective supervisor binding). The phone is NOT displayed in plain text on the screen — only behind the button — per the founder's default in slice 1 §4 question 6.
   - **"Can't make this" button (STUB in 2a)** — disabled; "Coming with leave / swap support" copy beneath. Real flow ships in 2c.
   - Photos summary (deferred to 2b): photo count when capture starts; in 2a just shows "Photos: 0 of 6 required" placeholder when state is `SCHEDULED`.

3. **Reusable components (NEW)**
   - `components/worker/AssignmentCard.tsx` — site name + time + state badge + tap target.
   - `components/worker/ResumeCaptureBanner.tsx` — sticky banner for in-flight visits.
   - `components/worker/HomeBellIcon.tsx` — bell SVG + always-on dot in 2a (badge count deferred).
   - `components/worker/StateBadge.tsx` — colored pill mapping `visit.state` → label + color.

### Backend (2 routes + 1 service)

1. **`GET /worker/today`** — returns the worker's today data shape:
   ```ts
   {
     workerId: string;
     workerState: WorkerStateValue;   // for "account paused" banner
     todayDate: string;               // ISO date in worker company tz
     supervisorPhone: string | null;  // from active SiteSupervisorBinding effective today
     visits: Array<{
       id: string;
       siteId: string;
       siteName: string;
       siteAddress: string | null;
       scheduledFor: string;          // ISO datetime
       state: VisitStateValue;
       photosBefore: number;
       photosAfter: number;
     }>;
     resumeCapture: {
       visitId: string;
       siteName: string;
       photosTakenSoFar: number;      // photosBefore + photosAfter on the in-flight visit
     } | null;
   }
   ```
   Auth: `requireAuth` + explicit `auth.role !== WORKER → 403 WRONG_ROLE` (same pattern as `/worker/consent`).
2. **`GET /worker/visits/:id`** — returns single-visit detail (subset of the today shape plus full site address + supervisor phone for tap-to-call). Auth: same gate. Authorization: caller must be the visit's `workerId` (verified via Worker→userId join).
3. **`lib/services/worker-today-service.ts`** — tx-callable service that composes the today response from the existing tables. Pure read; no transactions needed (single tx is fine but no writes).

### What stops at done

- `pnpm --filter @axhy/mobile typecheck` green.
- `pnpm --filter @axhy/backend typecheck` green.
- Real-DB tests against Railway: `worker-today.test.ts` (happy + empty-day + auth + wrong-role) + `worker-visit.test.ts` (happy + cross-worker-forbidden + not-found + auth).
- 7 screens re-captured via existing `qa-worker-d1-s1-auth-shell.ts` PLUS new `qa-worker-d1-s2a-home-detail.ts` that captures Worker Home (3 states: empty / with-visits / with-resume-banner) + Assignment Detail.
- `check_before_done` quality gate at L3+ (target L4-L5 same as slice 1).
- Done memo at `axhy-v3/handoff/done-memo-worker-d1-s2a-home-detail.md`.

---

## §2 — Source coverage matrix

| MVP artifact              | Canonical                   | V2 ref                             | Persona spec                               | Design HTML     | Existing v3 code    | Slice           |
| ------------------------- | --------------------------- | ---------------------------------- | ------------------------------------------ | --------------- | ------------------- | --------------- |
| Worker Home (real)        | §2.5 + §3 banners           | `WorkerHomeScreen.tsx`             | `07_today_home.md`                         | phone-screen #1 | slice 1 placeholder | 2a              |
| Resume-capture banner     | (founder add)               | —                                  | —                                          | —               | NEW                 | 2a              |
| AssignmentCard component  | §2.5                        | `AssignmentCard.tsx`               | `07_today_home.md` "Hero element"          | implied #1      | NEW                 | 2a              |
| Assignment Detail screen  | §2.5 + §3 T1                | (V2 inline detail)                 | `08_assignment_detail.md`                  | —               | NEW                 | 2a              |
| Tap-to-call supervisor    | §3 "Tap-to-call supervisor" | —                                  | `08_assignment_detail.md`                  | —               | NEW                 | 2a              |
| `GET /worker/today`       | §5 endpoint 5               | `sites.routes:12` (port reference) | `10_API_ENDPOINTS.md` (deferred reference) | —               | NEW                 | 2a              |
| `GET /worker/visits/:id`  | §5 endpoint 6               | —                                  | `10_API_ENDPOINTS.md`                      | —               | NEW                 | 2a              |
| `worker-today-service.ts` | §0 discipline               | —                                  | —                                          | —               | NEW                 | 2a              |
| "Can't make this" stub    | §3 deferred                 | —                                  | `08_assignment_detail.md`                  | —               | NEW stub            | 2a (real in 2c) |

---

## §3 — File list

### Mobile — create

- `apps/mobile/app/(worker)/visit/[id].tsx` — Assignment Detail screen (Expo Router dynamic route)
- `apps/mobile/components/worker/AssignmentCard.tsx`
- `apps/mobile/components/worker/ResumeCaptureBanner.tsx`
- `apps/mobile/components/worker/HomeBellIcon.tsx`
- `apps/mobile/components/worker/StateBadge.tsx`
- `apps/mobile/lib/queries/use-worker-today.ts` — React Query hook for `/worker/today`
- `apps/mobile/lib/queries/use-worker-visit.ts` — React Query hook for `/worker/visits/:id`
- `apps/mobile/scripts/qa-worker-d1-s2a-home-detail.ts` — Playwright capture script (3 Home states + Assignment Detail)

### Mobile — modify

- `apps/mobile/app/(worker)/index.tsx` — rewrite placeholder to real Home (consumes `use-worker-today`)
- `apps/mobile/lib/api-routes.ts` — add `API_ROUTES.workerToday`, `API_ROUTES.workerVisit`, `NAV_ROUTES.workerVisitDetail`

### Backend — create

- `apps/backend/src/routes/worker-today.ts` — `GET /worker/today`
- `apps/backend/src/routes/worker-visit.ts` — `GET /worker/visits/:id`
- `apps/backend/src/lib/services/worker-today-service.ts` — composes the today response
- `apps/backend/test/worker-today.test.ts` — real-DB integration tests (4 cases)
- `apps/backend/test/worker-visit.test.ts` — real-DB integration tests (4 cases)

### Backend — modify

- `apps/backend/src/server.ts` — register the 2 new routes

### Shared-schema — create

- `packages/shared-schema/src/zod/worker-today.ts` — `WorkerTodayOutput` + `WorkerVisitDetailOutput`

### Shared-schema — modify

- `packages/shared-schema/src/index.ts` — re-export

**Totals:** 13 created, 4 modified.

---

## §4 — Blocking founder questions

Italicised text is my best-guess default. If you say "go with defaults," I proceed on those.

1. **"Today" timezone**. Worker's company timezone (from `Company.tz`)? Phone's local timezone? Or worker's preferred timezone field (not currently on the schema)?
   _Default: company timezone (via Company.tz read in the service)._

2. **Empty-state copy** when worker has 0 visits today. "No visits today. Enjoy the rest day." or something else?
   _Default: "No visits today. Come back tomorrow." (English only at 2a; en/hi/te catalogue scaffolds added in slice 3 per canonical §10)._

3. **Resume-banner predicate**. Trigger on `visit.state IN (EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING)`?
   _Default: yes; these are the 4 in-flight states. `AWAITING_VERIFICATION` is NOT resume-able (worker already submitted; backend is verifying)._

4. **Cancelled visit display**. Show in list as gray banner OR remove from list entirely?
   _Default: show with gray "Cancelled" badge + reason text. Workers want acknowledgment that they didn't miss anything — disappearing rows is confusing per `feedback_ux_principles.md` "explain don't hide"._

5. **Past-time visits worker missed**. Worker hasn't checked in, scheduled time + grace passed, state still `SCHEDULED`. Show as red "Missed" badge OR as late-warning banner?
   _Default: late-warning banner (top of list) when within grace+30min; flips to "Missed" badge after that. State stays `SCHEDULED` until backend auto-transitions to `NO_SHOW` (visitMachine event — fires server-side, out of 2a scope)._

6. **Future visits today**. Worker has 4 visits, currently it's 9 AM, next visit is at 11 AM. Show countdown ("starts in 2h") or just the scheduled time?
   _Default: just scheduled time ("11:00 AM • 30m"). Countdown is over-design for MVP._

7. **Bell badge data**. The bell icon at top-right of Home — show static dot, badge count, or hide entirely?
   _Default: static dot in 2a (icon plus a small terracotta dot in top-right corner). Real notification count + tap-into-list ships Day 3 with the Notifications screen. Tap in 2a fires a toast "Notifications coming soon."_

8. **"Can't make this" stub behavior**. Disabled button OR hide entirely until 2c?
   _Default: disabled button with copy "Coming with leave & swap support" beneath. Hiding makes the screen incomplete-feeling per `feedback_make_it_exist_dont_defer.md`._

9. **Tap-to-call data source**. Supervisor phone from `SiteSupervisorBinding` effective today? Worker's preferred supervisor? Site's default supervisor?
   _Default: from `effective-responsibility.ts` (the same authoritative lookup used by the supervisor sprint). If no effective binding exists, button is disabled with "No supervisor assigned — call HR" copy._

10. **Pull-to-refresh**. Implement now or defer to slice 3 polish?
    _Default: implement now. React Query `refetch` on RefreshControl onRefresh. ~10 lines, zero risk._

---

## §5 — What NOT to build (in 2a)

Cross-referenced with `DO_NOT_BUILD_MVP.md`. These are deferred to 2b / 2c / Day 3 — not cut from the MVP.

- **Capture flow (8 screens)** — entire QR Scan → Before/After capture → Timer → Final Review → Submit chain. **Slice 2b.**
- **Photo storage architecture** — `expo-file-system` per-user partition, incremental R2 upload, 30-day local sweep, reinstall rehydration. **Slice 2b.**
- **`expo-location` install + GPS / geofence** — needed for capture flow timer + checkin. **Slice 2b.**
- **`expo-sensors` motion detection** — for cleaning timer fraud detection. **Slice 2b.**
- **Leave sheet from Worker Home** — `POST /worker/leave-requests` + `leaveRequestMachine`. **Slice 2c.**
- **Swap sheet from Assignment Detail** — `POST /worker/swaps` + `swapRequestMachine`. **Slice 2c.**
- **Replacement-invite Accept/Decline** — Notifications list rows. **Slice 3.**
- **Notifications list screen** + bell badge real count. **Slice 3.**
- **Decision-affecting-worker join** — supervisor decision banner needs Notification table join. **Slice 3.**
- **Holiday banner** — needs company holiday calendar (not yet in schema). **Slice 3.**
- **History tab full content** — week calendar + visit detail + earnings. **Slice 2c (or slice 3).**
- **Profile content** — language switcher + account info + grievance link. **Slice 3.**
- **Map preview on Assignment Detail** — needs map SDK choice + permission. **Slice 2b (when location lands) or slice 3.**
- **Multi-day "tomorrow's plan" preview** at bottom of Home. **Slice 3 polish.**
- **i18n full translation (hi/te)** — auth-flow strings scaffolded in slice 1; full translation **slice 6 per canonical §10.**

---

## §6 — First guarded implementation slice (AWAITING APPROVAL)

**Slice name:** `worker-d1-s2a-1-backend-today`
**Estimated size:** ~6 files (3 new backend + 1 new shared-schema + 1 new test + 1 modified server.ts).
**Estimated time:** 2–3h + ~1h test verification on Railway.
**Why backend-first:** mobile depends on the response shape. Shipping backend first lets the mobile screen consume real data from the start, instead of mocking + later refactoring.

### Scope (smallest meaningful first slice)

1. Create `lib/services/worker-today-service.ts` that composes the today response (read-only; pulls Worker / today's Visits / SiteSupervisorBinding / Site name+address).
2. Create `routes/worker-today.ts` (`GET /worker/today`) with `requireAuth` + WORKER role gate + try/catch envelope + tenant-exempt comment block for the cross-tenant nature of the per-user Worker lookup.
3. Create `routes/worker-visit.ts` (`GET /worker/visits/:id`) with the same auth pattern + explicit caller-owns-visit check (compare `auth.userId` to `Visit.worker.userId`; 403 if mismatch).
4. Add Zod schemas `WorkerTodayOutput` + `WorkerVisitDetailOutput` to `packages/shared-schema/src/zod/worker-today.ts`; re-export via `src/index.ts`.
5. Register both routes in `apps/backend/src/server.ts`.
6. Write real-DB integration tests `apps/backend/test/worker-today.test.ts` (4 cases: happy / empty-day / no-supervisor-binding / wrong-role-403) + `worker-visit.test.ts` (4 cases: happy / cross-worker-403 / not-found-404 / wrong-role-403).

### Guardrails enforced (carried from slice 1)

- `check_before_edit` intent per batch: cites MVP cut-list, names which tables read, names which machines read but DON'T transition (state machine discipline trivially satisfied since 2a writes nothing).
- Read-before-edit on every existing file before touching it.
- Real-DB tests against `axhy-sandbox` for both new routes. No mocks.
- Typecheck before declaring done: `pnpm --filter @axhy/shared-schema build && pnpm --filter @axhy/backend typecheck`.
- Pre-commit audit clean (no new high or critical findings; pre-existing tracked items don't count).

### Source coverage for this first slice

| File                      | Source                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `worker-today-service.ts` | Canonical §5 endpoint 5 + persona `07_today_home.md` Anatomy section                               |
| `worker-today.ts` route   | Canonical §5 + `worker-consent.ts` pattern from slice 1 (auth gate + try/catch envelope)           |
| `worker-visit.ts` route   | Canonical §5 + persona `08_assignment_detail.md` (data fields)                                     |
| `WorkerTodayOutput` zod   | Derived from service response shape; mirrors `MeOutput` pattern                                    |
| `worker-today.test.ts`    | `auth-flow.test.ts` worker-activation pattern (real-DB, fixture in beforeAll, cleanup in afterAll) |

### Open assumption (will surface in next_questions)

- The service consumes `effective-responsibility.ts` (from supervisor sprint) for supervisor-phone lookup. That module currently runs from the supervisor's perspective. **Need a reverse query** — given a worker + site + date, find the effective supervisor's User row. If `effective-responsibility.ts` doesn't expose this, I add a new helper `apps/backend/src/lib/authorization/supervises-worker.ts` extends with `findEffectiveSupervisorForWorker()`. Surface to founder if a separate file is preferred over extending.

### Stop conditions for this first slice

After:

1. Typecheck green (`shared-schema` + `backend`).
2. Both real-DB tests green on Railway.
3. Audit clean for slice files.
4. Done sub-memo: `axhy-v3/handoff/done-memo-worker-d1-s2a-1-backend-today.md`.

I stop and wait. Sub-slice 2a-2 (mobile components + Worker Home rewrite + Assignment Detail screen + screenshot capture) only starts on founder approval.

---

## §7 — What happens after 2a

| Sub-slice                | Scope                                                                                       | Approx files | Approx time |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------ | ----------- |
| **2a-1** (this proposal) | Backend `/worker/today` + `/worker/visits/:id` + tests                                      | 6            | 3–4h        |
| **2a-2**                 | Mobile: rewrite Worker Home + new Assignment Detail + reusable components + screenshot pass | ~9           | 4–6h        |
| **2b-1**                 | Capture flow scaffold + `expo-file-system` per-user partitioning + `expo-location` install  | ~8           | 4h          |
| **2b-2**                 | Photo capture pipeline (Before/After camera + gallery review) + incremental R2 upload       | ~10          | 6h          |
| **2b-3**                 | Cleaning timer + GPS + motion + Submit + Verify polling                                     | ~8           | 6h          |
| **2b-4**                 | 30-day sweep + reinstall rehydration + integration tests                                    | ~5           | 3h          |
| **2c-1**                 | `leaveRequestMachine` + `swapRequestMachine` + their `.test.ts`                             | ~4           | 3h          |
| **2c-2**                 | Leave sheet + Swap sheet (mobile) + 2 endpoints + integration tests                         | ~10          | 5h          |

Total slice 2 (2a + 2b + 2c) ≈ 6 sub-slices, ~55 files, ~30h. Spread across multiple sessions with check_before_done at each sub-slice.

---

**Status:** Sub-slice 2a-1 EXECUTED 2026-05-21 (commit `af926ab`, gate L3 Senior, 8/8 real-DB tests green on Railway). **Author:** Claude. **Awaits:** founder approval of sub-slice 2a-2 (mobile half — see §7).

## Amendment 2026-05-21

**What changed:** Header marked sub-slice 2a-1 EXECUTED at commit `af926ab`. Status lines (top + bottom) updated.

**Why:** Sub-slice 2a-1 (backend `/worker/today` + `/worker/visits/:id`) shipped with gate L3 Senior and 8/8 real-DB tests green on Railway sandbox. Sub-slice 2a-2 (mobile half — Worker Home rewrite + Assignment Detail + 4 components) is next.

**Requested by:** Founder via "commit all 2a-1 work + update plan header" directive.
