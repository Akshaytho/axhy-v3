# Project Status — Axhy v3

> **Living document.** Update at every major phase shift.

**Last updated:** 2026-05-31
**Active phase:** **HR A1 + Wave-3 + brainstorms shipped — 5 PRs open, F1-b verified.** PRs #9 (HR A1 thin admin-web portal, code+tests), #10 (Wave-3 hardening, 35 new tests), #11 (Slice 2 OWNER brainstorm, docs-only), #12 (Slice 3 SUPER_ADMIN brainstorm, docs-only), #13 (F1-b 5-persona enterprise QA, docs-only) all open against `main`.
**Previous:** F1-b code-complete merged via PR #7 (`0596493`). F1-a trust model DONE (PR #6, migration 020). Cognitive system reflex shipped (commit `8e4dbcd`). Wave 2 QA findings documented (25 findings). Super-admin-owner-bootstrap DONE (`b7a1cbb`). Cluster B DONE. Cluster A DONE (`7ed1e80`). Worker MVP 2b-4 DONE (`08c65a5`).
**Next:** Founder reviews PRs #9 → #10 → #13 (#10 depends on #9 merging first), answers 5 questions in #11 + 5 in #12 to unblock Slice 2/3 BUILD. Once #9 merges, unblock Q3 rename slice. F1-c TTL + logout-everywhere not blocked; pick up next.

## Worker MVP slice tracker

| Sub-slice                        | Scope                                                                                                                                    | Status                 | Gate             | Commit                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------------------------ |
| `worker-d1-s1-auth-shell`        | F-006b + auth flow + scaffold + ConsentLog                                                                                               | **DONE** 2026-05-21    | L5 Distinguished | `af926ab`                                              |
| `worker-d1-s2a-1-backend-today`  | `GET /worker/today` + `GET /worker/visits/:id`                                                                                           | **DONE** 2026-05-21    | L3 Senior        | `af926ab`                                              |
| `worker-d1-s2a-2-mobile-home`    | Worker Home rewrite + Assignment Detail + 4 components + 4 screenshots + DELTA.html                                                      | **DONE** 2026-05-22    | L3+              | `2e876a6`                                              |
| `worker-d1-s2b-1`                | Capture-flow scaffold + `expo-file-system` per-user partition + `expo-location` install + Location row on permissions + tab-bar root-fix | **DONE** 2026-05-22    | L3+              | (pending push)                                         |
| `worker-d1-s2b-2`                | Before/After capture pipeline + incremental R2 upload + captureMachine                                                                   | **DONE** 2026-05-23    | —                | —                                                      |
| `worker-d1-s2b-3`                | Cleaning timer + GPS + Submit + Verify polling                                                                                           | **DONE** 2026-05-23    | —                | —                                                      |
| `worker-d1-s2b-4`                | 30-day local sweep + reinstall rehydration + queue persistence                                                                           | **DONE** 2026-05-23    | —                | `08c65a5`                                              |
| `admin-hr-backend-wave-2-prep`   | Schema move (Worker salary → Membership) + 5 admin/HR routes (memberships/workers/anonymize/sites/bindings) + role-gates + 21 tests      | **DONE** 2026-05-25    | —                | `f40bfb3..d8edfe8`                                     |
| `super-admin-owner-bootstrap`    | `POST /super-admin/memberships` — seats first OWNER per tenant + 5 prod-DB tests + founder OWNER live in QA Test Co                      | **DONE** 2026-05-25    | —                | `b7a1cbb`                                              |
| `hr-a1-thin-portal`              | 7 HR ops admin-web portal + persona-graph audit + test infra hardening + 14 Playwright screens + 2 pre-existing bug fixes                | **DONE** 2026-05-31    | —                | [PR #9](https://github.com/Akshaytho/axhy-v3/pull/9)   |
| `hr-wave-3-hardening`            | 35 new tests filling 5 coverage gaps + raw-SQL phone-race fix in admin-membership-service + admin-worker-service                         | **DONE** 2026-05-31    | —                | [PR #10](https://github.com/Akshaytho/axhy-v3/pull/10) |
| `slice-2-owner-brainstorm`       | EVID-OWNER-PERSONA-MAP + Slice 2 design spec + 10 GAP candidates + 5 founder questions inline                                            | **DOCS** 2026-05-31    | —                | [PR #11](https://github.com/Akshaytho/axhy-v3/pull/11) |
| `slice-3-super-admin-brainstorm` | EVID-SUPER-ADMIN-PERSONA-MAP + Slice 3 design spec + 11 GAP candidates + 5 founder questions inline                                      | **DOCS** 2026-05-31    | —                | [PR #12](https://github.com/Akshaytho/axhy-v3/pull/12) |
| `f1b-5-persona-qa`               | F1-b 5-persona enterprise QA walk — 51 scenarios ALL PASS, 11 contracts confirmed, 0 prod bugs, 3 follow-up recs                         | **QA-DONE** 2026-05-31 | —                | [PR #13](https://github.com/Akshaytho/axhy-v3/pull/13) |
| `worker-d1-s2c-1`                | `leaveRequestMachine` + `swapRequestMachine` + tests                                                                                     | not started            | —                | —                                                      |
| `worker-d1-s2c-2`                | Leave sheet + Swap sheet + 2 endpoints + integration tests                                                                               | not started            | —                | —                                                      |

## Production state

| Surface                                           | Status                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Mobile (Expo SDK 54) auth flow                    | F-006b shipped; worker tab shell scaffolded                                                                                      |
| Mobile (Expo SDK 54) Worker Home                  | shipped 2a-2 (consumes `/worker/today`, renders resume banner + paused banner + assignment list + empty state + pull-to-refresh) |
| Mobile (Expo SDK 54) Assignment Detail            | shipped 2a-2 (consumes `/worker/visits/:id`, tap-to-call supervisor live, swap stub disabled)                                    |
| Mobile (Expo SDK 54) Capture flow scaffold        | shipped 2b-1 (6-step placeholder stack reachable via ResumeCaptureBanner deep-link; real camera/timer/upload land in 2b-2/2b-3)  |
| Mobile (Expo SDK 54) Permissions                  | shipped 2b-1 (Camera + Location asked upfront on (auth)/permissions per founder lock 2026-05-22)                                 |
| Backend `/auth/otp/verify`                        | fires `workerMachine.OTP_VERIFIED` on `PENDING_ACTIVATION` workers in `prisma.$transaction` (15s timeout for Railway cold-call)  |
| Backend `/worker/consent`                         | shipped (POST, WORKER role gate, try/catch envelope)                                                                             |
| Backend `/worker/today`                           | shipped (GET, WORKER role gate, returns visits + supervisor phone + resume-capture pointer)                                      |
| Backend `/worker/visits/:id`                      | shipped (GET, WORKER role gate, caller-owns-visit check)                                                                         |
| `ConsentLog` table                                | created via migration `20260528_018_worker_mvp_consentlog` and applied on Railway                                                |
| Mobile timer screen + submit + verify polling     | shipped 2b-3 (count-up timer, GPS log, keep-awake, submit → AWAITING_VERIFICATION, 3 s poll loop)                                |
| Backend `/worker/visits/:id/submit`               | shipped 2b-3 (POST, WORKER role gate, creates VisitPhoto rows, transitions visit to AWAITING_VERIFICATION)                       |
| Backend `/worker/visits/:id/verify-status`        | shipped 2b-3 (GET, WORKER role gate, returns visitState + photos array with aiVerifyStatus)                                      |
| Capture flow + photo pipeline (end-to-end)        | 2b-2 + 2b-3 done; 2b-4 (sweep + rehydration) next                                                                                |
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
| `packages/ai-tools/src/session-audit.ts` CHECK 10           | regex `prisma\.[a-z]*\.create` misses mixed-case table names (e.g. consentLog)  | filed by Cluster B 2026-05-25         |
| Worker / Visit / VisitPhoto tables                          | No RLS enabled — companyId filtering is app-level only                          | filed by Cluster B 2026-05-25 (RLS Q) |
| RC-A leave-decision pre-existing failures                   | seed expansion landed                                                           | **RESOLVED** 2026-05-31 (`3232aef`)   |

## Where we are right now

HR A1 thin admin-web portal + Wave-3 hardening matrix + Slice 2 OWNER brainstorm + Slice 3 SUPER_ADMIN brainstorm + F1-b 5-persona enterprise QA all shipped today as 5 PRs against `main`. F1-b is now QA-verified (51/51 scenarios pass, 0 prod bugs). Next session: founder reviews + merges PRs in order (#9 → #10 → #13 docs-only; #11/#12 await founder answers to inline questions). Q3 rename slice waits on #9 merge. F1-c TTL + logout-everywhere is unblocked and queued.
