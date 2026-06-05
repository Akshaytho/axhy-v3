# Done memo — RCA-H worker self-service leave (2026-06-04)

**Slice:** worker self-service time-off leave — the missing worker entry point for the already-built leave pipeline (`POST /leave-requests` → HR/supervisor inbox → approve/reject → `Worker ON_LEAVE` on approval).

## What shipped (NOT pushed — fix-only)

**Backend (1 file):**

- `apps/backend/src/routes/leave-requests.ts` — `POST /leave-requests` now binds a `WORKER` caller to **self**: resolves own `Worker.id` via `resolveWorkerFromAuth` and 403s (`FORBIDDEN_NOT_SELF`) if the body `workerId` isn't theirs. Non-worker roles (SUPERVISOR/HR/OWNER + `/chat/apply`) keep the on-behalf-of contract. Closes a horizontal-privilege hole: previously any worker could file leave for another same-tenant worker (the service only scoped by companyId).

**Mobile (5 files):**

- `lib/api-routes.ts` — `API_ROUTES.leaveRequests` + `NAV_ROUTES.workerLeaveRequest`.
- `lib/api-leave.ts` (new) — `submitLeaveRequest({workerId,fromDate,toDate,reason})` via `apiFetch`.
- `app/(worker)/leave-request.tsx` (new) — dependency-free screen: "start in N days" + "how many days" steppers (no date-picker module), reason input (0/500), live summary, disabled-until-valid submit, success + error states.
- `components/worker/WorkerDrawer.tsx` — "Request leave" item (between My profile / Help).
- `app/(worker)/_layout.tsx` — registered `<Stack.Screen name="leave-request" />`.

**Test (1 file):**

- `apps/backend/test/leave-request-create.test.ts` (new) — multi-company real-DB water-flow.

## Verification (all against Railway prod DB `DATABASE_PUBLIC_URL`)

- `leave-request-create.test.ts` — **7/7 green**: own-leave 201 + LeaveRequest row + `LEAVE_REQUESTED` audit + `hr.leave_requested` outbox; cross-worker 403 (no row); cross-tenant 403 (no row); supervisor on-behalf 201; foreign-tenant 404 `WORKER_NOT_FOUND`; `BAD_RANGE` 400; unauth 401.
- Regression: `leave-requests-authorization-regression` + `leave-requests-hr-gate` + `leave-decision` — **18/18 green** (route edit didn't break approve/reject/HR-gate).
- `pnpm --filter @axhy/backend run typecheck` + `pnpm --filter @axhy/mobile run typecheck` — **clean**.
- **Visual:** deep-linked `axhy://leave-request` on the emulator → screen renders correctly (header, intro, WHEN steppers, "Away Thu, 4 Jun" date math, 0/500 counter, disabled Send-request while empty). Screenshot: `handoff/screenshots/worker-leave-request_2026-06-04.png`. (Emulator system_server is ANR-storming; screen verified underneath the OS dialog.)

## Decision recorded

- Worker time-off leave is **allowed** and distinct from the resign/terminate founder lock (worker only REQUESTS; `ON_LEAVE` flips on HR/supervisor approval). Memory: `feedback_worker_self_service_leave_is_allowed.md`.

## Known gaps (NOT in this slice)

- The other RCA-H sub-items — supervisor **Memory screen** (`GET /supervisor/living-doc`) and **notification prefs** (`PATCH /me/notification-prefs`) — are still pending (separate slice, UI-heavy).
- Worker-facing **leave history / status list** (seeing your own past requests + their decision) is not built — only the create path. Worker sees the outcome indirectly via the profile `ON_LEAVE` badge today.
