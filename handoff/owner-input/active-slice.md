# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.

## In simple English (format per friend's 2026-05-16 directive)

**Problem (round 3):** chat path was accepting invalid input the direct route would reject (P1, friend caught self-swap as the headline example), AND the stale-authority proof only existed at the writer level (P2, not `/chat/apply` route).

**Simplest business solution:** chat path uses the SAME schemas as direct routes (single source of validation truth). Stale-auth race tested by injecting the race deterministically via a test-only hook.

**Code fix:** 2 commits — R3.1 (re-add Zod parsing in `/chat/apply`) + R3.2-a (test-only hook in `commitApply`, env-gated, production no-op).

**Why this code is necessary:** without R3.1, chat and direct route disagreed on the same input — rule 25 violation (single source). Without R3.2-a, "the route is proven race-safe" was an unproven claim — friend's P2.

## Current

| Field                               | Value                                                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                      | `chat-writes-proposed-decisions` (F-002 — round-3 fixes, R3.1 + R3.2-a)                                                                                                                                                                 |
| **Status**                          | `AWAITING_APPROVAL`                                                                                                                                                                                                                     |
| **Branch**                          | `feat/layer-1-core-primitives`                                                                                                                                                                                                          |
| **Last landed commit**              | `990b96e` — `test(chat): R3.2-a — deterministic route-level stale-auth proof (fixes P2)`                                                                                                                                                |
| **Round-3 commits (oldest→newest)** | `c8c34b3` (rule 25 lock + round-3 approval propagation) · `5972881` (R3.1 strict Zod parsing in /chat/apply + 4 validation regression tests) · `990b96e` (R3.2-a test-only hook + deterministic route-level stale-auth proof + 2 tests) |
| **Tests status**                    | **15/15 test files green · 75/75 cases pass** on fresh local Postgres 16. Round-3 added 6 new cases (4 validation regression + 2 stale-auth route-level).                                                                               |
| **Verification status**             | `REAL_DB` — fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432), all 12 migrations applied. Full sweep in one run.                                                                                                    |

## How each round-3 finding is closed

| Finding | Status | Resolution                                                                                                                                                                                                                                                                                                          |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1      | CLOSED | R3.1 (commit `5972881`) — chat path now imports `MarkAbsentInput`, `CreateLeaveRequestInput`, `CreateSwapRequestInput` from shared-schema and parses them BEFORE entering `withTenantContext`. Single validation source. Headline regression-prevention test: self-swap → 400 (in `chat-apply-validation.test.ts`). |
| P2      | CLOSED | R3.2-a (commit `990b96e`) — test-only hook `__setCommitApplyTestHook` (env-gated, production no-op) lets tests inject a binding change between preCheck and commit. `chat-apply-stale-auth-route.test.ts`: forces the race via `app.inject`; asserts 403 + row PROPOSED + NO Attendance row + NO DWI_APPLIED audit. |

## All round-1 → round-3 lineage (kept for audit)

- **Round-1 (pre-remediation) commits:** `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146`
- **Round-1 remediation commits:** `f2b2d74` · `ec01f62` · `38b9987` · `2e03315` · `4506b3d` · `2557e1f`
- **Round-2 control-surface cleanup:** `75b56f8`
- **Round-2 fix commits:** `a1f6a2d` (G1) · `c63a163` (G2 lifecycle, R2a) · `d8b664b` (R3 writer-level tests) · `0cbb8ed` (assignment service) · `6e4c677` (leave + attendance services) · `50a859c` (swap service) · `cb3ae13` (R2b-iii chat refactor) · `92294f3` (atomicity tests)
- **Round-3 commits:** `c8c34b3` (rule 25 + approval propagation) · `5972881` (R3.1) · `990b96e` (R3.2-a)

## Workflow IDs affected

`D17` · `D20` · `C11` · `E21` · `E22` · `E24`

## P10 failure matrix (now PROVEN at route level)

| Question                                                     | Answer                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?                   | (1) PROPOSED transitions to exactly one terminal state. (2) `appliedAt` + `dismissedAt` mutually exclusive (DB CHECK). (3) Transitions require currently-responsible OR origin supervisor — CHECKED AT COMMIT TIME (R2a). (4) Domain effect + lifecycle commit happen in ONE Prisma transaction. (5) Chat path validation == direct route validation (R3.1, new). |
| How is each invariant enforced?                              | (1) Conditional updateMany. (2) DB CHECK + conditional WHERE. (3) `isCallerAuthorized` at BOTH preCheckApply AND commitApply. (4) All 5 branches wrap preCheckApply + service + commitApply in ONE `withTenantContext`. (5) chat.ts imports + parses the same Zod schemas the direct routes use.                                                                  |
| What happens on failure of the domain effect?                | Tx rolls back. Lifecycle stays PROPOSED. No DWI_APPLIED audit. Caller sees the service's error code (404/400). Verified by F-002.16's 4 atomicity tests.                                                                                                                                                                                                          |
| What happens on stale authority between preCheck and commit? | Whole tx rolls back. Lifecycle stays PROPOSED AND domain row is also rolled back. NOW PROVEN AT ROUTE LEVEL by R3.2-a's deterministic test (`990b96e`).                                                                                                                                                                                                           |
| What happens for retry / double-submit?                      | Conditional updateMany returns count=0 → discriminator → ALREADY_APPLIED. Domain idempotency is each domain route's concern.                                                                                                                                                                                                                                      |
| What happens under concurrent requests on the same row?      | PG row-lock + WHERE re-evaluation guarantee exactly one of N wins. DB CHECK rejects the impossible state. Audit reflects winner only.                                                                                                                                                                                                                             |
| What happens for invalid input on the chat path?             | 400 BAD_INPUT — same as the direct route. Verified by R3.1's 4 regression tests (self-swap, malformed effectiveAt, non-uuid workerId, malformed fromDate).                                                                                                                                                                                                        |
| What happens for a stale client (no decisionId)?             | 400 BAD_INPUT (Zod rejects). Unchanged from F-002.5.                                                                                                                                                                                                                                                                                                              |
| What is still intentionally deferred (with sunset)?          | Full state ENUM column (FAILED / EXPIRED / UNDONE). S-001 same-day-freeze policy (separate next slice after F-002 closes; spec lock first). **NO corruption windows remain for the PROPOSED → APPLIED/DISMISSED transitions this slice covers.**                                                                                                                  |

## Round-3 test file inventory (new in this round)

- `apps/backend/test/chat-apply-validation.test.ts` — R3.1 / P1 regression-prevention (4 cases).
- `apps/backend/test/chat-apply-stale-auth-route.test.ts` — R3.2-a route-level stale-auth proof (2 cases: race + control).

## Reproduction (for friend's spot-check)

```
docker exec axhy-test-pg pg_isready -U postgres
cd apps/backend
DATABASE_URL="postgres://postgres:test@localhost:55432/axhy_test?schema=axhy" \
AXHY_DB_URL="postgres://postgres:test@localhost:55432/axhy_test?schema=axhy" \
pnpm exec vitest run \
  test/effective-responsibility-helper.test.ts \
  test/sites-effective-supervisor-route.test.ts \
  test/decisions-proposed-for-me-route.test.ts \
  test/effective-responsibility-point-in-time.test.ts \
  test/supervisor-decision-writer-create.test.ts \
  test/supervisor-decision-apply.test.ts \
  test/decisions-dismiss-route.test.ts \
  test/supervisor-decision-proposed-during-absence.test.ts \
  test/chat-apply-transitions-decision.test.ts \
  test/supervisor-decision-concurrency.test.ts \
  test/supervisor-decision-new-kinds-routing.test.ts \
  test/chat-apply-route-concurrency.test.ts \
  test/chat-apply-atomicity.test.ts \
  test/chat-apply-validation.test.ts \
  test/chat-apply-stale-auth-route.test.ts
```

Expected: 15 files, 75 cases, all green.

## Next slice (after F-002 approves)

**S-001 — same-day supervisor freeze** (owner's 2026-05-16 directive). Separate slice. Spec lock first (responsibility-model + closure spec wording), then code (HR binding-create rejects same-day effectiveFrom). Rule 25 in action: simplifies the system by removing the operational edge case at the source rather than engineering around it. The current F-002 atomicity + auth re-check still stands as defense-in-depth even after the policy lands.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
