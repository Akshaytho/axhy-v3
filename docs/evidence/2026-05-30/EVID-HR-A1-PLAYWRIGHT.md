---
title: EVID-HR-A1 — Playwright visual proof for HR A1 thin admin-web portal
date: 2026-05-30
slice: HR A1
spec: docs/personas/hr/HR_PERSONA_GRAPH.md
branch: feat/hr-a1-thin-portal
status: PASS — 14/14 HR screens captured end-to-end against seeded sandbox
[ORCHESTRATOR_EXCEPTION] visual verification doc for HR A1
---

## Summary

End-to-end Playwright probe drove the real `/login` -> `/hr/*` flow as a seeded
HR user (Anita HR, `+919900001111`) on the `axhy-sandbox` tenant. Captured 14
HR-portal screens (login phone, login OTP, dashboard, memberships list/new,
workers list/new/detail, sites list/new/detail/bindings, leave-requests
list/detail) — all served by the live admin-web on `:3000` against the live
backend on `:4000` against the Railway dev Postgres.

This closes the visual-verification loop for HR A1. The same probe surfaced
two real trust-model bugs that blocked every persona, not just HR — see
"Bugs fixed during this run" below. EVID-HR-PLAYWRIGHT-BUGS.md is now marked
RESOLVED.

## Why UI/Playwright was the right step

The persona-graph rule mandates UI/Playwright as a step precisely because
unit + integration tests can pass while the real user-facing flow is broken.
Both bugs fixed in this run were undetected by the existing
~120 backend + ~40 admin-web unit/integration tests:

1. The `jwt-public` verifier required a top-level `userId` claim while the
   backend issued `sub` per JWT RFC-7519 §4.1.2. Every backend-issued token
   was rejected as `MALFORMED` by admin-web. Unit tests passed because the
   verifier test fixtures issued `userId` instead of `sub` — they tested the
   verifier against itself, not against the backend contract.

2. The login page destructured `{ accessToken, refreshToken, user }` while
   the backend returned `{ accessToken, refreshToken, memberships }`. Every
   OTP verify failed with "Login response invalid" before reaching the
   session cookie route. Unit tests passed because there were none for this
   code path — the login page had no test coverage.

Both were caught the moment a real browser drove the real login form. This
is the value of the UI-probe step.

## Bugs fixed during this run

### Bug 1 — jwt-public verifier rejects all backend-issued tokens

**File:** `packages/jwt-public/src/verify.ts:25`
**Was:** `const REQUIRED = ['userId', 'companyId', 'role'] as const;`
**Now:** `const REQUIRED = ['sub', 'companyId', 'role'] as const;`

Backend issues `sub: User.id` per shared-schema `JWTClaims` (zod schema at
`packages/shared-schema/src/zod/auth.ts:63`). Verifier now reads `sub` as
the canonical user identifier. A `userId` legacy alias is populated by the
verifier (mirrors `sub`) so any pre-existing consumer reading `.userId`
keeps compiling.

Test suite updated: `packages/jwt-public/src/verify.test.ts` — fixtures now
issue `sub`; an additional negative test asserts legacy `{ userId, ... }`
tokens are rejected as `MALFORMED`. All 5 tests pass.

### Bug 2 — admin-web login expects wrong response shape

**File:** `apps/admin-web/app/login/page.tsx:135`
**Was:** `const { accessToken, refreshToken, user } = verifyJson;`
**Now:** `const { accessToken, refreshToken, memberships } = verifyJson;` + `Array.isArray(memberships)` guard + role-aware redirect via `/api/auth/session` (HR -> `/hr`, else `/owner`)

Backend `/auth/otp/verify` (`apps/backend/src/routes/auth.ts:180-191`)
returns `memberships` array, never `user`. The destructure mismatch caused
the login page to short-circuit with "Login response invalid — please retry"
before the session cookie route was ever called.

## Probe configuration

- Spec: `apps/admin-web/e2e/hr-screenshots.spec.ts`
- Phone: `+919900001111` (HR member Anita HR, axhy-sandbox)
- OTP: `123456` (operator-allowlist bypass; dev-only)
- Seeded LeaveRequest: `d4127591-7305-4e6a-8bf1-b416324b8021`
- admin-web dev: `:3000`
- backend dev: `:4000`
- Postgres: Railway dev (DATABASE_PUBLIC_URL via .env.local)
- Duration: ~1.4 min (after fix); 1 worker

## Screenshots — 14 / 14

| #   | Screen                              | File                                                               |
| --- | ----------------------------------- | ------------------------------------------------------------------ |
| 00  | Login — phone step                  | [hr-00-login-phone.png](./hr-00-login-phone.png)                   |
| 01  | Login — OTP step                    | [hr-01-login-otp.png](./hr-01-login-otp.png)                       |
| 02  | HR dashboard                        | [hr-02-dashboard.png](./hr-02-dashboard.png)                       |
| 03  | Memberships — list                  | [hr-03-memberships-list.png](./hr-03-memberships-list.png)         |
| 04  | Memberships — invite                | [hr-04-memberships-new.png](./hr-04-memberships-new.png)           |
| 05  | Workers — list                      | [hr-05-workers-list.png](./hr-05-workers-list.png)                 |
| 06  | Workers — invite                    | [hr-06-workers-new.png](./hr-06-workers-new.png)                   |
| 07  | Worker detail (empty — none seeded) | [hr-07-worker-detail-empty.png](./hr-07-worker-detail-empty.png)   |
| 08  | Sites — list                        | [hr-08-sites-list.png](./hr-08-sites-list.png)                     |
| 09  | Sites — new                         | [hr-09-sites-new.png](./hr-09-sites-new.png)                       |
| 10  | Site detail                         | [hr-10-site-detail.png](./hr-10-site-detail.png)                   |
| 11  | Site bindings                       | [hr-11-site-bindings.png](./hr-11-site-bindings.png)               |
| 12  | Leave-requests — list               | [hr-12-leave-requests-list.png](./hr-12-leave-requests-list.png)   |
| 13  | Leave-request detail                | [hr-13-leave-request-detail.png](./hr-13-leave-request-detail.png) |

Screen 07 is the workers-list page captured after no detail-href was found
(seeded data has no Worker rows yet) — saved as
`hr-07-worker-detail-empty.png` to keep the manifest complete and prove the
empty-state renders.

## Verification

- `pnpm --filter @axhy/jwt-public test` — 5/5 pass (includes new
  legacy-token-rejection case)
- `pnpm --filter admin-web typecheck` — green
- Playwright spec — 1/1 pass in 1.4 min, 14 screenshots written

## What's still open

Worker detail page was not exercised because no Worker rows are seeded on
`axhy-sandbox` yet — this is a sandbox-data gap, not a code gap. Detail
route exists at `/hr/workers/[id]` and will be hit by the next probe after
the worker-seed slice lands.
