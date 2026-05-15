# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.

## Current

| Field                                   | Value                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                          | `chat-writes-proposed-decisions` (F-002 — round-2 R2b-iii remediation)                                                                                                                                                                                                                                                                                                              |
| **Status**                              | `AWAITING_APPROVAL`                                                                                                                                                                                                                                                                                                                                                                 |
| **Branch**                              | `feat/layer-1-core-primitives`                                                                                                                                                                                                                                                                                                                                                      |
| **Last landed commit**                  | `92294f3` — `test(chat): atomicity verification — domain failure rolls back lifecycle (F-002.16)`                                                                                                                                                                                                                                                                                   |
| **Round-1 (pre-remediation) commits**   | `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146` (kept in tree; F-002.4's apply-after-domain trade-off superseded by round 2)                                                                                                                                                                                                                                  |
| **Round-1 remediation commits**         | `f2b2d74` · `ec01f62` · `38b9987` · `2e03315` · `4506b3d` · `2557e1f` (registry + CHECK + race-safe writer + apply-after-domain + required decisionId + read-side registry + tests; F-002.4 superseded)                                                                                                                                                                             |
| **Round-2 control-surface cleanup**     | `75b56f8` (removed superseded apply-after-domain trade-off wording from active-slice + pending-approvals)                                                                                                                                                                                                                                                                           |
| **Round-2 fix commits (oldest→newest)** | `a1f6a2d` (F-002.9 termination reorder) · `c63a163` (F-002.10 auth re-check in commitApply) · `d8b664b` (F-002.11 R3 route-level tests) · `0cbb8ed` (F-002.12 assignment service) · `6e4c677` (F-002.13 leave+attendance services) · `50a859c` (F-002.14 swap service) · `cb3ae13` (F-002.15 /chat/apply uses services in withTenantContext) · `92294f3` (F-002.16 atomicity tests) |
| **Workflow IDs affected**               | `D17` · `D20` · `C11` · `E21` · `E22` · `E24`                                                                                                                                                                                                                                                                                                                                       |
| **Tests status**                        | **13/13 test files green · 69/69 cases pass** on fresh local Postgres 16 with all 12 migrations. Round-2 added 8 new cases (4 route-level concurrency + 4 atomicity).                                                                                                                                                                                                               |
| **Verification status**                 | `REAL_DB` — fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432), all 12 migrations applied (20260507 → 20260518). Full sweep in one run. Container left running for friend's spot-check.                                                                                                                                                                          |

## What R1 + R2a + R2b-iii + R3 delivered (vs the 3 round-2 findings G1/G2/G3)

| Finding          | Concern                                                                                                                                                    | Resolution                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1               | Termination tx committed `appliedAt` BEFORE worker validation; early-return sentinels let the tx commit with partial state.                                | **F-002.9** — reorder. Validate worker FIRST (tx.worker.findFirst + state guards); lifecycle SECOND (applyProposedDecision); worker.update THIRD. Early-returns happen BEFORE any state-changing write. If lifecycle OR worker.update throws, the whole tx rolls back. Verified by F-002.11's G1 test case.                |
| G2 (lifecycle)   | `commitApply` did NOT re-check authorization; stale-auth between preCheckApply (tx 1) and commitApply (tx 2) let DWI_APPLIED record under the wrong actor. | **F-002.10** — re-check `isCallerAuthorized` INSIDE commitApply, BEFORE the conditional UPDATE. If authority changed, throws NOT_RESPONSIBLE; UPDATE never runs; no audit. Verified by F-002.11's R2a-verification test case.                                                                                              |
| G2 (domain side) | Under apply-after-domain (F-002.4), the inject's domain effect could land BEFORE commitApply, then commitApply could reject — real-world behaviour drift.  | **F-002.15** (R2b-iii) — /chat/apply for the 4 ex-inject branches now wraps `preCheckApply + service + commitApply` in ONE `withTenantContext` transaction. Domain effect + lifecycle commit are atomic. F-002.12 + F-002.13 + F-002.14 extracted the 4 services. Verified by F-002.16's 4 atomicity tests.                |
| G3               | Round-1 concurrency tests called the writer directly; the full route flow was not under test.                                                              | **F-002.11** — new `chat-apply-route-concurrency.test.ts` (4 cases): apply-vs-apply through /chat/apply, apply-vs-dismiss through HTTP routes, R2a stale-auth verification, G1 termination-invalid-worker verification. Plus **F-002.16** (4 atomicity cases proving service-failure rollback for all ex-inject branches). |

## P10 failure matrix (post-round-2, all cells answered)

| Question                                                     | Answer                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?                   | (1) PROPOSED transitions to exactly one terminal state. (2) `appliedAt` + `dismissedAt` mutually exclusive (DB CHECK). (3) Transitions require currently-responsible (binding-routable) OR origin supervisor (origin-only), CHECKED AT COMMIT TIME. (4) Domain effect + lifecycle commit happen in ONE Prisma transaction — neither succeeds alone.   |
| How is each invariant enforced?                              | (1) Conditional updateMany on every transition. (2) DB CHECK constraint (migration 20260518) + conditional WHERE. (3) `isCallerAuthorized` via DECISION_KIND_REGISTRY.routingMode at BOTH preCheckApply AND commitApply. (4) `/chat/apply` for all 5 branches wraps preCheckApply + service-or-domain-write + commitApply in ONE `withTenantContext`. |
| What happens on failure of the domain effect?                | Tx rolls back. Lifecycle stays PROPOSED. No DWI_APPLIED audit. Caller sees the service's error code (404/400). No partial state on disk. Verified by F-002.16's 4 atomicity tests.                                                                                                                                                                    |
| What happens on stale authority between preCheck and commit? | The whole flow runs in ONE tx; `isCallerAuthorized` is re-checked inside commitApply (F-002.10). If authority changed between preCheck and commit, commitApply throws NOT_RESPONSIBLE → tx rolls back → NO lifecycle change AND NO domain effect. Verified by F-002.11's R2a test case.                                                               |
| What happens for retry / double-submit?                      | Conditional updateMany returns count=0 → discriminator query → throws ALREADY_APPLIED. Domain idempotency is each domain route's own concern (mark-absent.upsert by (workerId, date) already idempotent).                                                                                                                                             |
| What happens under concurrent requests on the same row?      | PG row-lock + WHERE re-evaluation guarantee exactly one of N concurrent UPDATEs wins. DB CHECK rejects the impossible state. Audit reflects only the winner. Verified by F-002.7 + F-002.11's parallel app.inject tests.                                                                                                                              |
| What happens for a stale client (old shape)?                 | 400 BAD_INPUT with `decisionId is required`. Row unaffected. Tested in `chat-apply-transitions-decision.test.ts`.                                                                                                                                                                                                                                     |
| What is still intentionally deferred (with sunset)?          | Full state ENUM column (FAILED / EXPIRED / UNDONE) — needs concrete triggers (cron sweep etc.) in their own slices. **NO corruption windows remain for the PROPOSED → APPLIED/DISMISSED transitions this slice covers.**                                                                                                                              |

## Research sources cited per Rule P9

- [Prisma interactive transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) — load-bearing: "all queries inside it have to be run on the same connection." Confirms inject cannot share a tx; R2b-iii's service extraction is the only correct path.
- [Prisma `updateMany`](https://www.prisma.io/docs/orm/reference/prisma-client-reference#updatemany) — returns `BatchPayload { count }`.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — row-locking + WHERE re-evaluation guarantee exactly-one-wins for conditional UPDATE; READ COMMITTED inside one tx sees a fresh snapshot for each query (enables R2a auth re-check to see binding changes).
- [PostgreSQL CHECK constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — per-row, evaluated at UPDATE time.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html) — surveyed; not needed under R2b-iii because nothing spans a non-DB operation.

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
  test/chat-apply-atomicity.test.ts
```

Expected: 13 files, 69 cases, all green.

## Hash-truth convention

The hash columns above name ONLY landed commit hashes. Under the auto-regen pre-commit hook the new commit's hash is created AFTER the file is written and staged, so at write-time we cannot know the hash that will contain this file. Convention:

- List only commits already in `git log`.
- After a commit lands, the NEXT edit to this file names that commit explicitly.
- No "landing now", no "may land", no "next commit will be", no "in this commit" wording.

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- Header active-slice banner + Current Slice focus callout both read from here (single source).
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
