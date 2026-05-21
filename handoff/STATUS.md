# Project Status — Axhy v3

> **Living document.** Update at every major phase shift.

**Last updated:** 2026-05-22 (sub-slice 2a-2 EXECUTED at gate L3+)
**Active phase:** **Worker MVP sub-slice 2b-1 — pending founder approval.** Sub-slice 2a-2 (mobile Worker Home rewrite + Assignment Detail screen + 4 reusable components + Playwright capture suite) shipped 2026-05-22 with typecheck green and 4 screenshots verified side-by-side against the design HTML reference. Sub-slice 2b-1 (capture-flow scaffold + Expo location/file-system installs) is next; its plan is in `docs/personas/worker/WORKER_MVP_SLICE_2A_PLAN.md §7`.

## Worker MVP slice tracker

| Sub-slice                       | Scope                                                                                   | Status               | Gate             | Commit    |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------------------- | ---------------- | --------- |
| `worker-d1-s1-auth-shell`       | F-006b + auth flow + scaffold + ConsentLog                                              | **DONE** 2026-05-21  | L5 Distinguished | `af926ab` |
| `worker-d1-s2a-1-backend-today` | `GET /worker/today` + `GET /worker/visits/:id`                                          | **DONE** 2026-05-21  | L3 Senior        | `af926ab` |
| `worker-d1-s2a-2-mobile-home`   | Worker Home rewrite + Assignment Detail + 4 components + 4 screenshots + DELTA.html     | **DONE** 2026-05-22  | L3+              | `2e876a6` |
| `worker-d1-s2b-1`               | Capture-flow scaffold + `expo-file-system` per-user partition + `expo-location` install | **PENDING** approval | —                | —         |
| `worker-d1-s2b-2`               | Before/After capture pipeline + incremental R2 upload                                   | not started          | —                | —         |
| `worker-d1-s2b-3`               | Cleaning timer + GPS + motion + Submit + Verify polling                                 | not started          | —                | —         |
| `worker-d1-s2b-4`               | 30-day local sweep + reinstall rehydration + integration tests                          | not started          | —                | —         |
| `worker-d1-s2c-1`               | `leaveRequestMachine` + `swapRequestMachine` + tests                                    | not started          | —                | —         |
| `worker-d1-s2c-2`               | Leave sheet + Swap sheet + 2 endpoints + integration tests                              | not started          | —                | —         |

## Production state

| Surface                                           | Status                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Mobile (Expo SDK 54) auth flow                    | F-006b shipped; worker tab shell scaffolded                                                                                      |
| Mobile (Expo SDK 54) Worker Home                  | shipped 2a-2 (consumes `/worker/today`, renders resume banner + paused banner + assignment list + empty state + pull-to-refresh) |
| Mobile (Expo SDK 54) Assignment Detail            | shipped 2a-2 (consumes `/worker/visits/:id`, tap-to-call supervisor live, swap stub disabled)                                    |
| Backend `/auth/otp/verify`                        | fires `workerMachine.OTP_VERIFIED` on `PENDING_ACTIVATION` workers in `prisma.$transaction` (15s timeout for Railway cold-call)  |
| Backend `/worker/consent`                         | shipped (POST, WORKER role gate, try/catch envelope)                                                                             |
| Backend `/worker/today`                           | shipped (GET, WORKER role gate, returns visits + supervisor phone + resume-capture pointer)                                      |
| Backend `/worker/visits/:id`                      | shipped (GET, WORKER role gate, caller-owns-visit check)                                                                         |
| `ConsentLog` table                                | created via migration `20260528_018_worker_mvp_consentlog` and applied on Railway                                                |
| Capture flow + photo pipeline                     | **not started** — sub-slice 2b                                                                                                   |
| Notifications + bell badge data + decision banner | **not started** — slice 3                                                                                                        |

## Active discipline gates

- `check_before_edit` (Layer 2) gates every code Write/Edit (with intent + read-tracking + risk-classified edit budget)
- `check_before_plan` (Layer 2) gates every plan/persona/handoff doc write (with architecture-evidence + source-hierarchy validation)
- `check_before_done` (Layer 2) gates every done-memo write (quality-gate auditor L3+ required, preflight blocks on uncommitted slice files and stale handoff)
- Pre-commit eslint rule `axhy/require-derives` requires `@derives(...)` JSDoc on every export
- Pre-commit audit (`packages/ai-tools/src/session-audit.ts`) blocks on HIGH findings unless `AXHY_AUDIT_EMERGENCY=1`
- `docs/personas/` changes blocked unless `AXHY_FOUNDER_APPROVED=1`

## Active plans

| File                                                     | Authority                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `docs/personas/worker/WORKER_MVP_SPRINT_PLAN.md`         | 3-day worker MVP sprint plan (parent)                                                  |
| `docs/personas/worker/WORKER_MVP_SLICE_2A_PLAN.md`       | Slice 2a sub-slice breakdown (2a-1 EXECUTED, 2a-2 EXECUTED; 2b-1/2/3/4 + 2c-1/2 ahead) |
| `docs/personas/worker/DO_NOT_BUILD_MVP.md`               | Cut-list (chat tab, pay tab, theme picker, training, etc.)                             |
| `/tmp/axhy-ingest/persona-worker/MVP_V2_ALIGNED_PLAN.md` | Canonical worker MVP plan (cloned reference)                                           |

## Pre-existing inherited debt (NOT introduced by worker MVP slices)

| File:line                                                   | Item                                                                            | Status                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| `apps/backend/src/routes/auth.ts:133-146`                   | `as Role` cast x3 on `m.role`                                                   | tracked separately per founder        |
| `apps/backend/src/routes/auth.ts:76-87`                     | `prisma.user.findFirst` + `prisma.membership.findMany` (intentional pre-tenant) | tracked separately                    |
| `apps/backend/src/server.ts:63,186`                         | `unhandled_async` on bootstrap + shutdown handlers                              | tracked separately                    |
| `apps/backend/src/routes/chat.ts`                           | per-supervisor message rate limit + 50-concurrent semaphore not enforced        | tracked in `chat-abuse-prevention.md` |
| `apps/backend/src/dispatcher/handlers/notifications.ts:293` | raw prisma outside transaction                                                  | tracked separately                    |

## Where we are right now

Worker MVP slice 1 + 2a-1 + 2a-2 are shipped on Railway sandbox and on `main`. Next session starts sub-slice 2b-1 (capture-flow scaffold) per the plan.
