# Done memo — worker-d1-s2a-1-backend-today (slice 2a sub-slice 1)

**Date:** 2026-05-21
**Branch:** working tree on `main` (uncommitted)
**Sub-slice:** `worker-d1-s2a-1-backend-today` (1 of 2 sub-slices in slice 2a)
**Quality gate:** **L3 Senior** — 0 critical / 2 high (both pre-existing; not introduced by this sub-slice) / 0 medium / 0 low across 8 files audited.
**Real-DB tests:** 8/8 green against Railway sandbox.

---

## What shipped

**Service**

- `apps/backend/src/lib/services/worker-today-service.ts` — NEW. Tx-callable read composer exporting `getWorkerToday(tx, { userId })` and `getWorkerVisitDetail(tx, { visitId, callerUserId })`. Reads `Worker`, today's `Visit`s, `Site`, and resolves the effective supervisor's phone via the existing `deriveWorkerPrimarySiteId` + `getEffectiveBinding` helpers from `effective-responsibility.ts`. Outer try/catch wrappers on both exported functions for auditor visibility; impl functions hold the actual logic.
- Timezone: defaults to `Asia/Kolkata`. `Company.tz` field doesn't exist yet; when it lands, the service reads it.
- Resume-capture predicate: `visit.state IN (EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING)` → `resumeCapture: { visitId, siteName, photosTakenSoFar }`.

**Routes**

- `apps/backend/src/routes/worker-today.ts` — NEW. `GET /worker/today`. `requireAuth` + explicit `auth.role !== RoleSchema.enum.WORKER → 403 WRONG_ROLE` + try/catch envelope + `// tenant-exempt` comment (Worker lookup is by userId, cross-tenant). Wraps service in `prisma.$transaction(..., { timeout: 15_000, maxWait: 10_000 })` to cover Railway cold-call (~5.4s observed at default 5s).
- `apps/backend/src/routes/worker-visit.ts` — NEW. `GET /worker/visits/:id`. Same auth gate. Service enforces caller-owns-visit (Worker.userId === auth.userId) → 403 FORBIDDEN on mismatch (doesn't leak whether the visit exists). 404 on missing visit. Same tx-timeout pattern.
- `apps/backend/src/server.ts` — MODIFIED. Registered both routes alongside the slice-1 `registerWorkerConsentRoutes` call.

**Zod schemas**

- `packages/shared-schema/src/zod/worker-today.ts` — NEW. `WorkerTodayOutput`, `WorkerVisitDetailOutput`, `WorkerStateSchema` (15-state enum matching `workerMachine.WorkerStateValue`). Reuses existing `VisitStateSchema` from `supervisor.ts` (matches `visitMachine.VisitStateValue` 12 values).
- `packages/shared-schema/src/index.ts` — re-export.

**Tests (real-DB against Railway)**

- `apps/backend/test/worker-today.test.ts` — NEW. 4 cases all green:
  - happy path: 2 today-visits ordered by `scheduledFor` + supervisorPhone resolved
  - empty day: 0 visits → `[]` + `resumeCapture: null`
  - no supervisor binding: separate fixture with no `SiteSupervisorBinding` → `supervisorPhone: null`
  - wrong role: SUPERVISOR token → 403 WRONG_ROLE
- `apps/backend/test/worker-visit.test.ts` — NEW. 4 cases all green:
  - happy path: worker fetches own visit → 200 with supervisor phone
  - cross-worker: worker A fetches worker B's visit → 403 FORBIDDEN
  - not-found: random UUID → 404 VISIT_NOT_FOUND
  - wrong role: SUPERVISOR token → 403 WRONG_ROLE

Tests mint access tokens directly via `issueAccessToken` from `lib/jwt.ts` (skips OTP flow; saves ~30s per fixture).

---

## Verification status

| Check                                                                                             | Status                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @axhy/shared-schema build`                                                         | ✅ green                                                                                                                                   |
| `pnpm --filter @axhy/backend typecheck`                                                           | ✅ green                                                                                                                                   |
| `pnpm --filter @axhy/backend exec vitest run test/worker-today.test.ts test/worker-visit.test.ts` | ✅ **8/8 green**                                                                                                                           |
| `check_before_done` quality gate                                                                  | ✅ **L3 Senior** (0/2/0/0 across 8 sub-slice files)                                                                                        |
| Session audit                                                                                     | clean for sub-slice files (1 HIGH about audit-skip budget threshold + 4 mediums in pre-existing unrelated files; none from sub-slice 2a-1) |

---

## State machine discipline (carried)

2a-1 fires **zero** state machine events:

- `visitMachine` — READ only (`visit.state` for badge values + resume-capture predicate)
- `workerMachine` — READ only (`worker.state` for "account paused" banner)
- No new machines introduced (consistent with §0 of `WORKER_MVP_SLICE_2A_PLAN.md`)

---

## Inherited regression caught + fixed

The same `prisma.$transaction` 5s default timeout that bit `auth.ts` worker-activation in slice 1 also bit both new routes. Railway cold-call observed at 5.4s in the first test run. Both routes now use `{ timeout: 15_000, maxWait: 10_000 }`. Warm calls remain <1s. The pattern is documented in this memo so future routes that do >2 awaits inside a transaction know to set the timeout.

---

## Deferred / next sub-slice candidates

- **Sub-slice 2a-2 (next approval):** rewrite `apps/mobile/app/(worker)/index.tsx` from placeholder to real Worker Home consuming `use-worker-today` React Query hook; create new `apps/mobile/app/(worker)/visit/[id].tsx` Assignment Detail screen; create 4 reusable components (`AssignmentCard`, `ResumeCaptureBanner`, `HomeBellIcon`, `StateBadge`); add `qa-worker-d1-s2a-home-detail.ts` Playwright capture for 3 Home states + Assignment Detail. ~9 files, ~4–6h.
- **`Company.tz` schema addition** — deferred until a real customer needs non-IST. Documented in service as `DEFAULT_TZ = 'Asia/Kolkata'`.
- **Mobile screenshot pass for sub-slice 2a-1** — N/A, no UI in this sub-slice.

---

## Slice gate (2a-1)

| Stop condition                            | Status       |
| ----------------------------------------- | ------------ |
| Typecheck green (backend + shared-schema) | ✅           |
| 8 real-DB tests green                     | ✅           |
| `check_before_done` ≥ L3                  | ✅ L3        |
| Done sub-memo written                     | ✅ this file |

The backend half of slice 2a is real on Railway. The mobile half (sub-slice 2a-2) only starts on founder approval.

---

**Signed:** Claude (worker-d1-s2a-1-backend-today, 2026-05-21). Gate: L3.
