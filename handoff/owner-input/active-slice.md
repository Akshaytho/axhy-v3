# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner (friend's 2026-05-15 evening reconciliation).

## Current

| Field                                   | Value                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                          | `chat-writes-proposed-decisions` (F-002 — remediation pass)                                                                                                                                                                                                                                                |
| **Status**                              | `CHANGES_REQUESTED` (round-2 revised plan, 2026-05-16) — friend rejected R2b-i (accept-the-leak default). Revised plan commits to R2b-iii: refactor 4 inject-style routes into tx-callable services so domain effect + lifecycle commit share one tx. R1 + R2a + R3 unchanged. See `pending-approvals.md`. |
| **Branch**                              | `feat/layer-1-core-primitives`                                                                                                                                                                                                                                                                             |
| **Last landed commit**                  | `2557e1f` — `test(decisions): F-002 remediation tests — concurrency + new kinds + stale-client (F-002.7)`                                                                                                                                                                                                  |
| **Original slice commits**              | `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146` (kept in tree; not rebased)                                                                                                                                                                                                          |
| **Remediation commits (oldest→newest)** | `f2b2d74` (F-002.1 unified registry) · `ec01f62` (F-002.2 CHECK constraint) · `38b9987` (F-002.3 race-safe writer) · `2e03315` (F-002.4+5 apply-after-domain + decisionId required) · `4506b3d` (F-002.6 read-side via registry) · `2557e1f` (F-002.7 tests)                                               |
| **Workflow IDs affected**               | `D17` · `D20` · `C11` · `E21` · `E22` · `E24`                                                                                                                                                                                                                                                              |
| **Tests status**                        | 11/11 test files green · 61/61 cases pass · 7 new cases for remediation (4 concurrency + 3 new-kind binding-change) · stale-client test rewritten as 400 BAD_INPUT assertion · all 6 existing chat-\* tests updated to pass decisionId                                                                     |
| **Verification status**                 | `REAL_DB` — fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432), all 12 migrations applied (20260507 → 20260518 including F-002.2 CHECK constraint). Full sweep in one run. Container left running for friend's spot-check.                                                              |

## What the remediation pass fixed (vs friend's 4 findings)

| Finding | Friend's concern                                                                         | Resolution                                                                                                                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | `appliedAt` could commit before the real domain effect succeeds (orphan APPLIED)         | **Fixed by F-002.4 (apply-after-domain).** Inject-style branches now: pre-check (tx 1) → domain inject → on 2xx → commitApply (tx 2). If domain fails, no lifecycle change. propose_termination + propose_living_doc_update stay fully atomic in a single tx. Rule P3.                                                |
| F2      | Optional `decisionId` left orphan PROPOSED rows that old clients couldn't close          | **Fixed by F-002.5 (decisionId required).** Zod tightened; back-compat branch removed. Old shape → 400 BAD_INPUT. The previous "stale-client success path" test is now a 400-assertion test (friend's required addition 2). Rule P4.                                                                                  |
| F3      | New kinds (SWAP / TERMINATE / CREATE_ASSIGNMENT) silently fell back to origin-supervisor | **Fixed by F-002.1 + F-002.6 (unified registry).** `DECISION_KIND_REGISTRY` is the single source for kind → tier / routing-mode / tool / ack mapping. Writer + read-side route via the same registry. Adding a new kind in one file flows through all 4 layers automatically. Rule P5.                                |
| F4      | `findUnique → check → update` race could produce impossible `applied+dismissed` state    | **Fixed by F-002.2 (CHECK constraint) + F-002.3 (conditional updateMany).** App layer uses `updateMany WHERE id=? AND appliedAt IS NULL AND dismissedAt IS NULL`; PG row-lock guarantees exactly one of N concurrent UPDATEs wins. DB CHECK constraint rejects the impossible state. Defence in depth. Rules P1 + P2. |

## P10 failure matrix (post-remediation, filled per rule 24)

| Question                                                | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?              | (1) PROPOSED transitions to exactly one terminal state (APPLIED or DISMISSED). (2) `appliedAt` and `dismissedAt` are mutually exclusive. (3) Transitions require the currently responsible supervisor (binding-routable kinds) OR the origin supervisor (origin-only kinds). (4) `appliedAt` is set only after the domain effect commits for inject-style branches (apply-after-domain).                                                                               |
| How is each invariant enforced?                         | (1) Conditional updateMany on every transition; row in {PROPOSED, APPLIED, DISMISSED} permanently. (2) DB CHECK constraint `SupervisorDecision_apply_dismiss_exclusive` (migration 20260518) + conditional updateMany. (3) `isCallerAuthorized` driven by DECISION_KIND_REGISTRY.routingMode. (4) `commitApply` is called AFTER the domain inject's 2xx return, not before.                                                                                            |
| What happens on failure of the domain effect?           | For inject-style tools: row stays PROPOSED; no DWI_APPLIED audit; caller sees the domain's 4xx/5xx unchanged. For atomic-tx tools (termination, living-doc): the whole tx rolls back; lifecycle stays PROPOSED.                                                                                                                                                                                                                                                        |
| What happens on retry / double-submit?                  | Conditional updateMany returns count=0 on second attempt → discriminator query → throws ALREADY_APPLIED. Caller maps to 409. Domain side double-effect is each domain route's own idempotency concern (unchanged by F-002).                                                                                                                                                                                                                                            |
| What happens under concurrent requests on the same row? | PG row-level locking ensures exactly one of N concurrent UPDATEs wins. Tested: apply-vs-apply and apply-vs-dismiss in parallel. DB CHECK constraint blocks the impossible state if app guards are ever bypassed. Audit reflects only the winner.                                                                                                                                                                                                                       |
| What happens for a stale client (old shape)?            | 400 BAD_INPUT with `decisionId is required`. No back-compat fallback. Row not affected. Tested in `chat-apply-transitions-decision.test.ts`.                                                                                                                                                                                                                                                                                                                           |
| What is still intentionally deferred (with sunset)?     | Full state ENUM column (`FAILED` / `EXPIRED` / `UNDONE`). Today's (appliedAt, dismissedAt) pair is the discriminator. FAILED/EXPIRED/UNDONE need concrete triggers (e.g. cron sweep for EXPIRED) which belong in their own slices. The apply-vs-dismiss-race domain-effect-on-dismissed-row case is intentional under apply-after-domain (rule P3 trade-off); audit records both the lifecycle decision and the domain effect independently for manual reconciliation. |

## Research sources cited per Rule P9

- Prisma `updateMany` return shape — https://www.prisma.io/docs/orm/reference/prisma-client-reference#updatemany
- PostgreSQL Read Committed isolation + UPDATE-WHERE re-evaluation — https://www.postgresql.org/docs/current/transaction-iso.html ("the would-be updater will wait for the first updating transaction to commit or roll back ... The search condition of the command (the WHERE clause) is re-evaluated.")
- PostgreSQL CHECK constraints (per-row at UPDATE time) — https://www.postgresql.org/docs/current/ddl-constraints.html

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
  test/supervisor-decision-new-kinds-routing.test.ts
```

Expected: 11 files, 61 cases, all green.

## Hash-truth convention

The "Last landed commit" / "Original slice commits" / "Remediation commits" rows above name ONLY landed commit hashes. Under the auto-regen pre-commit hook the new commit's hash is created AFTER the file is written and staged, so at write-time we cannot know the hash that will contain this file. Convention:

- List only commits already in `git log`.
- After a commit lands, the NEXT edit to this file names that commit explicitly.
- No "landing now", no "may land", no "next commit will be", no "in this commit" wording.

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- Header active-slice banner + Current Slice focus callout both read from here (single source).
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
