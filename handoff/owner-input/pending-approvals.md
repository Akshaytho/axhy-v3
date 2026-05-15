# Pending Approvals + Blocked Items

> Two distinct concepts, separated per friend's 2026-05-15 evening verification:
>
> - **Awaiting approval** — code-complete + verified slice; owner has not yet said the approval word.
> - **Blocked** — slice cannot proceed because of an external dependency (not because it's awaiting approval).
>
> Rule 17: No new slice starts while anything is `AWAITING_APPROVAL`.
>
> **Hash convention:** only landed commit hashes appear in this file. No "landing now" / "next commit" / "may land" speculation. Per the convention in `active-slice.md`, the file in commit N references commits 1..(N-1).

## Approval-word convention (for the AWAITING_APPROVAL section below)

- `APPROVED` → slice moves to `APPROVED`; next slice can start.
- `CHANGES_REQUESTED` + a bullet list → slice stays `AWAITING_APPROVAL`; Claude addresses the list.
- `HOLD` → slice pauses; no next slice until lifted.
- (empty) → default `AWAITING_APPROVAL`; next slice does NOT start.

---

## Currently awaiting approval

### Slice: `chat-writes-proposed-decisions` (F-002 — round-2 R2b-iii remediation) — AWAITING_APPROVAL 2026-05-16

- **Status:** `AWAITING_APPROVAL`. Friend's round-2 plan (approved 2026-05-16 with the control-surface cleanup as a prerequisite) is fully implemented.
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `92294f3` — `test(chat): atomicity verification — domain failure rolls back lifecycle (F-002.16)`
- **Round-2 commits (in landing order):**
  1. `75b56f8` — control-surface cleanup (friend's required prerequisite; superseded apply-after-domain wording removed from active-slice + pending-approvals).
  2. `a1f6a2d` — F-002.9: termination tx reorder (G1 fix). Validate worker BEFORE applyProposedDecision.
  3. `c63a163` — F-002.10: isCallerAuthorized re-check inside commitApply (G2 lifecycle fix, R2a).
  4. `d8b664b` — F-002.11: route-level concurrency + stale-auth tests (R3; 4 cases).
  5. `0cbb8ed` — F-002.12: extract createAssignmentService.
  6. `6e4c677` — F-002.13: extract createLeaveRequestService + markAbsentService.
  7. `50a859c` — F-002.14: extract createSwapRequestService.
  8. `cb3ae13` — F-002.15: /chat/apply uses tx-callable services in `withTenantContext` (R2b-iii core integration). Removes `app.inject` for the 4 ex-inject branches. SUPERSEDES F-002.4's apply-after-domain trade-off.
  9. `92294f3` — F-002.16: atomicity tests for all 4 ex-inject branches (4 cases proving domain failure rolls back lifecycle).
- **Verification:** REAL_DB on fresh local Postgres 16 (container `axhy-test-pg`, port 55432, all 12 migrations applied 20260507→20260518). **13/13 test files green · 69/69 cases pass** in one sweep. Container left running for friend's spot-check.

#### How each round-2 finding is closed

| Finding          | Status            | Resolution                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1 (termination) | CLOSED            | F-002.9 reorders the termination tx. Worker validation runs FIRST; lifecycle SECOND; worker.update THIRD. Early-returns happen before any state-changing write. Verified by F-002.11's G1 test case (termination apply against TERMINATION_PENDING worker → 409 + row stays PROPOSED).                                               |
| G2 (lifecycle)   | CLOSED            | F-002.10 adds `isCallerAuthorized` re-check inside commitApply. Verified by F-002.11's R2a test case (preCheck succeeds → binding changes → commitApply throws NOT_RESPONSIBLE → row stays PROPOSED).                                                                                                                                |
| G2 (domain side) | CLOSED by R2b-iii | F-002.12 + F-002.13 + F-002.14 extracted 4 services. F-002.15 makes /chat/apply call each service INSIDE one `withTenantContext` alongside preCheckApply + commitApply. Domain effect + lifecycle commit are atomic. Verified by F-002.16's 4 atomicity tests (non-existent worker/site → 404 + lifecycle PROPOSED + NO domain row). |
| G3 (test gap)    | CLOSED            | F-002.11 adds 4 route-level tests; F-002.16 adds 4 atomicity tests. Total 8 new cases at the load-bearing path.                                                                                                                                                                                                                      |

#### What friend asked the resurface packet to prove

| Friend's expectation                                                       | Where it's proven                                                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Termination invalid-worker path leaves decision PROPOSED                   | `chat-apply-route-concurrency.test.ts` G1 case (F-002.11).                                                                  |
| Stale authority cannot produce domain side effect without lifecycle commit | `chat-apply-route-concurrency.test.ts` R2a case (F-002.11) + the whole `chat-apply-atomicity.test.ts` file (F-002.16).      |
| Apply-vs-dismiss on the real route path is safe                            | `chat-apply-route-concurrency.test.ts` route-level apply-vs-dismiss test (F-002.11).                                        |
| All 4 ex-inject branches are truly atomic now                              | `chat-apply-atomicity.test.ts` — one rollback test per branch (F-002.16).                                                   |
| Domain-failure rollback tests exist for those branches                     | `chat-apply-atomicity.test.ts` 4 cases (F-002.16).                                                                          |
| Control files match the new truth with no leftover superseded matrix text  | F-002 round-2 prep commit `75b56f8` removed the superseded apply-after-domain matrix from active-slice + pending-approvals. |

#### P10 failure matrix (post-round-2)

| Question                                                     | Answer                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?                   | (1) PROPOSED transitions to exactly one terminal state. (2) `appliedAt` + `dismissedAt` mutually exclusive (DB CHECK). (3) Transitions require currently-responsible (binding-routable) OR origin supervisor (origin-only), CHECKED AT COMMIT TIME. (4) Domain effect + lifecycle commit happen in ONE Prisma transaction — neither succeeds alone. |
| How is each invariant enforced?                              | (1) Conditional updateMany on every transition. (2) DB CHECK constraint + conditional WHERE. (3) `isCallerAuthorized` at BOTH preCheckApply AND commitApply. (4) /chat/apply for all 5 branches wraps preCheckApply + service + commitApply in ONE `withTenantContext`.                                                                             |
| What happens on failure of the domain effect?                | Tx rolls back. Lifecycle stays PROPOSED. No DWI_APPLIED audit. Caller sees the service's error code (404/400). Verified by F-002.16.                                                                                                                                                                                                                |
| What happens on stale authority between preCheck and commit? | The whole flow runs in ONE tx; commitApply re-checks auth. If authority changed, tx rolls back → NO lifecycle change AND NO domain effect. Verified by F-002.11's R2a test.                                                                                                                                                                         |
| What happens for retry / double-submit?                      | Conditional updateMany returns count=0 → discriminator → throws ALREADY_APPLIED. Domain idempotency is each domain route's own concern.                                                                                                                                                                                                             |
| What happens under concurrent requests on the same row?      | PG row-lock + WHERE re-evaluation guarantee exactly one of N concurrent UPDATEs wins. DB CHECK rejects the impossible state. Audit reflects only the winner.                                                                                                                                                                                        |
| What happens for a stale client (old shape)?                 | 400 BAD_INPUT with `decisionId is required`. Row unaffected.                                                                                                                                                                                                                                                                                        |
| What is still intentionally deferred (with sunset)?          | Full state ENUM column (FAILED / EXPIRED / UNDONE) — needs concrete triggers in their own slices. **NO corruption windows remain for the PROPOSED → APPLIED/DISMISSED transitions this slice covers.**                                                                                                                                              |

#### Lessons logged to memory (`feedback_production_grade_workflow_rules.md`)

- **L1** — Tx-callback early-return commits partial state. Validation failures must throw, not return sentinels, when wrapped around a primitive that has already written.
- **L2** — Authorization checked in tx 1 doesn't bind tx 2; always re-check inside the commit tx.
- **L3** — "Document + reconcile via audit" is too weak when the side effect can corrupt real-world state. Make the side effect impossible under stale authority, not "recorded after the fact".

#### Decision needed

- `APPROVED` → slice moves to APPROVED state; next slice can start.
- `CHANGES_REQUESTED` (bullet list) → name what to change.
- `HOLD` → pause F-002.

**Reproduction snippet for friend's spot-check is in `active-slice.md`.** Docker container `axhy-test-pg` is left running.

### Slice: `chat-writes-proposed-decisions` (F-002 — round 2 review, original) — CHANGES_REQUESTED 2026-05-15 evening

- **Status:** `CHANGES_REQUESTED` (round 2) — friend's second production-grade verification pass found 3 remaining issues at the request orchestration layer. The core SupervisorDecision state machine + writer are now safe; the route plumbing around them still has corruption windows that rule P3 + P7 + P8 don't permit.
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at review:** `54c0ca9` (tracker propagation); slice body at `2557e1f`.
- **What round 1 (CHANGES_REQUESTED) fixed (verified by friend):** stronger state rule on lifecycle · apply/dismiss safer against direct race conditions · old-client path removed · routing for new decision kinds better · concurrency tests at the writer level.
- **Friend's verbatim:** "this is much better than before … the core state machine is much better, but the request orchestration around it is still not fully production-safe."

#### The 3 round-2 findings (rulebook citations)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                | Rule    | Severity                          | Location                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| G1  | propose_termination commits `appliedAt` BEFORE the worker validation. If the worker is missing or already TERMINATED/TERMINATION_PENDING, the inner callback returns `{ kind: 'NOT_FOUND' \| 'ALREADY' }` — but the tx still commits. Result: lifecycle row in APPLIED state, no worker.update happened, audit reflects an apply that didn't produce its domain effect.                                                                                | P3 + P7 | corrupts business truth           | `apps/backend/src/routes/chat.ts:920-945` — applyProposedDecision call is line 928; worker validation lines 939-944. |
| G2  | `commitApply` does NOT re-check authorization. The authorization check runs only inside `preCheckApply` (tx 1). If responsibility changes between tx 1 and tx 2 (e.g. an acting binding fires, a permanent reassignment commits, or someone dismisses the row), the conditional UPDATE in commitApply still succeeds because the WHERE only checks state, not authority. Wrong actor records DWI_APPLIED + (for inject-style) the domain effect leaks. | P2 + P3 | stale-authority lifecycle leak    | `apps/backend/src/lib/supervisor-decision-writer.ts:404-435` — commitApply only checks (appliedAt, dismissedAt).     |
| G3  | The new concurrency tests in `supervisor-decision-concurrency.test.ts` call `applyProposedDecision`/`dismissProposedDecision` DIRECTLY at the writer level — they prove the writer is race-safe but they do NOT exercise the full `/chat/apply` route orchestration (preCheckApply → inject → commitApply). The remaining route-layer race (G2 + apply-vs-dismiss across the inject window) is therefore not under test.                               | P6 + P8 | test gap on the load-bearing path | `apps/backend/test/supervisor-decision-concurrency.test.ts` — no `app.inject` parallel calls.                        |

#### Remediation plan (for your approval BEFORE I write code)

Confidence: 87% own on the plan shape. Below the rule 23 ≥90% bar for code execution → I want your go-ahead before implementing, and per Rule P9 I'll do a focused research pass before each fix (PostgreSQL row locking semantics + SERIALIZABLE isolation behaviour + Fastify inject tx isolation; sources will be cited in each commit message).

**Fix R1 — reorder termination validation to run BEFORE lifecycle commit (G1, rule P3).**

The single-tx termination branch should validate the worker FIRST, then commit lifecycle, then update the worker. Inside one `withTenantContext`:

1. `tx.worker.findFirst` + state guards. If invalid → return early; tx commits with NO lifecycle change.
2. `applyProposedDecision` (lifecycle UPDATE).
3. `tx.worker.update` + `recordAuditEvent`.

Either step 2 or step 3 can throw; the whole tx rolls back. propose_living_doc_update already follows this shape (the upsert/update have no early-return failure path, only throws), so it doesn't need a reorder — I'll re-verify when implementing.

Small change. High confidence (~96%). No new pattern, just a reorder.

**Fix R2 — close the stale-authority window AND the domain leak (G2, rules P2 + P3 + P8).**

**Revised 2026-05-16 (friend rejected R2b-i).** Friend's framing: a workflow is not production-grade if the business side effect can succeed under authority that is already stale. Documented + reconciled-via-audit is too weak. The plan now commits to R2b-iii — refactor — so the domain effect AND the lifecycle commit share one database transaction.

- **R2a (LIFECYCLE side, unchanged):** add `isCallerAuthorized` re-check INSIDE `commitApply`, before the conditional UPDATE. If authority changed since `preCheckApply`, throw `NOT_RESPONSIBLE`. The conditional UPDATE never runs; no DWI_APPLIED audit is emitted; the row stays PROPOSED.

- **R2b-iii (DOMAIN side, NEW commitment):** extract the 4 inject-style routes into tx-callable service functions. `/chat/apply` calls each service INSIDE its own `withTenantContext(prisma, companyId, async (tx) => ...)` along with `preCheckApply` + the domain service call + `commitApply`. All three commit together or none commits. No `app.inject` in the apply path for these branches.

  Research per Rule P9:
  - **Prisma interactive transactions** — https://www.prisma.io/docs/orm/prisma-client/queries/transactions — verified: "all queries inside it have to be run on the same connection. A database connection can only ever execute one query at a time." `app.inject` runs in its own Fastify request lifecycle on a different connection; it CANNOT share a Prisma tx with the outer caller. This is the conclusive reason R2b-iii (refactor) is required, not R2b-ii (pessimistic locking).
  - **PostgreSQL transaction isolation** — https://www.postgresql.org/docs/current/transaction-iso.html — already cited in F-002.3 commit; row-locking + WHERE re-evaluation guarantee exactly-one-wins for conditional UPDATEs. With everything in one tx, the binding read and the lifecycle UPDATE both see a consistent snapshot under READ COMMITTED for this slice's needs.
  - **PostgreSQL explicit locking** — https://www.postgresql.org/docs/current/explicit-locking.html — not needed under R2b-iii because we are NOT trying to span a non-DB operation; everything is in-tx.
  - **Fastify inject docs** — https://fastify.dev/docs/latest/Guides/Testing/ — inject is a request-execution mechanism, not a tx-sharing mechanism. Confirmed by the Prisma docs above.

  Scoped (file-grounded survey 2026-05-16):

  | Route                         | Handler size | Side effects                                           | Extraction shape                                                                                               |
  | ----------------------------- | ------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
  | POST /assignments             | ~96 LOC      | 2 prisma lookups + 1 create + 1 AuditEvent. No Outbox. | `createAssignmentService(tx, input, auth) → { kind: 'OK'\|'WORKER_NOT_FOUND'\|'SITE_NOT_FOUND', assignment? }` |
  | POST /leave-requests          | ~79 LOC      | 1 lookup + 1 create + 1 AuditEvent + 1 Outbox.         | `createLeaveRequestService(tx, input, auth) → { kind, leaveRequest? }`                                         |
  | POST /workers/:id/mark-absent | ~118 LOC     | 1 lookup + 1 upsert + 1 AuditEvent + up to 2 Outbox.   | `markAbsentService(tx, input, auth) → { kind, attendance? }`                                                   |
  | POST /swap-requests           | ~128 LOC     | 3 lookups + 1 create + 1 AuditEvent + 2 Outbox.        | `createSwapRequestService(tx, input, auth) → { kind, swapRequest? }`                                           |

  All 4 routes are extraction-friendly:
  - All currently wrap their work in `withTenantContext`.
  - All side effects go through `recordAuditEvent(tx, ...)` and `enqueueOutbox(tx, ...)` which already accept a TransactionClient (no external HTTP / synchronous third-party calls).
  - No blocking refactor.
  - Existing route handlers keep working — they just become thin wrappers that call the service inside `withTenantContext`.

  After extraction, `/chat/apply` for each inject-style branch becomes:

  ```ts
  await withTenantContext(prisma, auth.companyId, async (tx) => {
    const preCheck = await preCheckApply(tx, { companyId, decisionId, actorUserId });
    const result = await (<service>(tx, input, auth)); // domain in same tx
    if (result.kind !== 'OK') throw new DomainError(result.kind);
    await commitApply(tx, { ...input, preCheck }); // lifecycle in same tx
  });
  ```

  Either step throws → the whole tx rolls back. Atomic. No inject. No stale-auth leak.

  **Why R2b-ii (pessimistic locking) is rejected as fallback for this slice:** friend correctly flagged that `SELECT FOR UPDATE only protects the rows you lock`. The SupervisorDecision row lock would NOT block a concurrent SiteSupervisorBinding write (different table). Closing that gap would require SERIALIZABLE isolation, which then requires retry logic on conflict. The complexity exceeds R2b-iii's refactor cost, and the connection-held-across-inject pattern is a known anti-pattern (Prisma docs explicitly warn against long-held transactions). R2b-iii is both simpler AND more correct.

**Fix R3 — route-level concurrency + route-level stale-authority tests (G3, rules P6 + P8).**

New test file `chat-apply-route-concurrency.test.ts`:

1. Parallel `app.inject` of `/chat/apply` for the same decisionId. Exactly one wins, the other 409, DB row in a valid terminal state, audit matches winner only.
2. Parallel `/chat/apply` + `POST /decisions/:id/dismiss` via `app.inject`. Same assertions.
3. **Stale-authority race (R2a verification):** preCheck authorized; THEN simulate a binding change before commitApply runs (use a small `setTimeout` between phases, or seed the binding in `Promise.all` with the apply); assert commitApply throws NOT_RESPONSIBLE and lifecycle stays PROPOSED. This proves R2a closes the lifecycle window even if the inject is in-flight.
4. **G1 verification:** termination apply against a worker that's already TERMINATION_PENDING — assert row stays PROPOSED + 409. This proves R1 fixed the early-return-with-commit bug.

#### P10 failure matrix (post-R1 + R2a + R2b-iii + R3 — the active plan)

> _Removed 2026-05-16 control-surface cleanup: the prior matrix that surfaced "domain-side leak under stale authority for inject-style branches" as a deferred sunset item is gone. Under R2b-iii that leak does NOT exist by design — domain effect and lifecycle commit share one tx — so it cannot be a deferred limitation._

| Question                                                     | Answer                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?                   | Previous invariants + (5) lifecycle commit happens only if the actor is STILL responsible at commit time. (6) Termination lifecycle never commits unless the worker.update commits too. (7) For ALL chat-apply branches (including the 4 ex-inject ones), domain effect + lifecycle commit happen inside one Prisma transaction. |
| How is each invariant enforced?                              | (5) `isCallerAuthorized` re-check in `commitApply` before the conditional UPDATE. (6) Worker validation runs BEFORE `applyProposedDecision` in the termination tx. (7) Each ex-inject branch wraps `preCheckApply` + domain-service call + `commitApply` in one `withTenantContext`.                                             |
| What happens on stale authority between preCheck and commit? | LIFECYCLE: row stays PROPOSED + 403 NOT_RESPONSIBLE returned. DOMAIN: the service call is in the same tx that throws → roll back → NO domain row created. Both sides correct.                                                                                                                                                    |
| What happens for the G1 termination invalid-worker case?     | Tx rolls back. Lifecycle stays PROPOSED. 404/409 returned. No appliedAt set.                                                                                                                                                                                                                                                     |
| What happens for the apply-vs-dismiss race after R2b-iii?    | The conditional UPDATE in `commitApply` is the only mechanism that can transition the row. Whichever transaction commits first wins; the other returns 4xx with the right error. Domain effect happens iff lifecycle commit happens — never alone.                                                                               |
| What is still intentionally deferred (with sunset)?          | Full state ENUM column (FAILED / EXPIRED / UNDONE) — deferred per scope Q4=(b); needs concrete triggers in their own slices. No corruption windows remaining for the PROPOSED → APPLIED/DISMISSED transitions this slice covers.                                                                                                 |

#### Suggested commit shape (R1 + R2a + R3 + R2b-iii)

R1 + R2a + R3 (small fixes + test additions):

1. `fix(chat): reorder termination tx — validate worker before lifecycle commit (F-002.9, fixes G1)`
2. `fix(decisions): re-check authorization in commitApply (F-002.10, fixes G2 lifecycle side)`
3. `test(decisions): route-level concurrency + stale-auth tests (F-002.11, fixes G3 + verifies R1+R2a)`

R2b-iii (4 service extractions + chat refactor + tests):

4. `feat(services): extract createAssignmentService for tx-sharing (F-002.12)` — simplest route first.
5. `feat(services): extract createLeaveRequestService + markAbsentService (F-002.13)` — paired.
6. `feat(services): extract createSwapRequestService (F-002.14)` — largest, most lookups.
7. `feat(chat): /chat/apply uses tx-callable services for true atomicity (F-002.15)` — remove `app.inject` for the 4 branches; rewrite each as `withTenantContext(preCheckApply + service + commitApply)`.
8. `test(chat): full-atomic apply tests for all 5 branches incl. domain-failure rollback (F-002.16)` — assert: if the service returns non-OK, lifecycle stays PROPOSED AND no domain row exists.
9. `docs(handoff): F-002 round-2 remediation → AWAITING_APPROVAL`

Each refactor commit (4–6) keeps the existing route handler working — it just becomes a thin wrapper calling the service. All existing chat-\* OpenAI-real tests + the new route tests continue to pass.

Confidence: 91% own on R1 + R2a + R3 (high; well-understood fixes). 90% on R2b-iii (file-grounded scope confirms no blocking side effects, but each service extraction has subtle details to get right). Per Rule P9, each refactor commit cites the Prisma transactions doc + does a quick mental dry-run of the route's existing tx boundaries before changing them.

#### Decision needed

- `APPROVED on plan` → I implement R1 + R2a + R3 + R2b-iii in 8 commits (9 with tracker), re-surface as AWAITING_APPROVAL once 11+ test files green AND including 5 new route-atomicity tests.
- `CHANGES_REQUESTED on plan` → name what to change.
- `HOLD` → pause F-002. Note: F-001 read API still works; F-002 writes happen in chat but with the current lifecycle gaps + the round-2 G1/G2 corruption windows still open.

**I will not write a single line of fix code until you approve this revised plan.** Recording the lesson from this round openly: when a workflow can produce a real-world domain effect under stale authority, "document + reconcile via audit" is not production-grade. The production-grade answer is "make the domain effect and the lifecycle commit share one tx, so neither can succeed alone." That's what R2b-iii does. Adding this to my session memory as a permanent rule.

---

### Slice: `chat-writes-proposed-decisions` (F-002 — round-1 remediation pass) — AWAITING_APPROVAL 2026-05-15 evening (superseded by round-2 above)

- **Status:** `AWAITING_APPROVAL`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `2557e1f` — `test(decisions): F-002 remediation tests — concurrency + new kinds + stale-client (F-002.7)`
- **Original slice commits:** `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146` (kept; not rebased)
- **Remediation commits:** `f2b2d74` (F-002.1 registry) · `ec01f62` (F-002.2 CHECK) · `38b9987` (F-002.3 race-safe writer) · `2e03315` (F-002.4+5 apply-after-domain + required decisionId) · `4506b3d` (F-002.6 read-side registry) · `2557e1f` (F-002.7 tests)
- **All 4 findings closed.** See `active-slice.md` for the per-finding resolution table and the P10 failure matrix.
- **Verification:** `REAL_DB` — fresh local Postgres 16, all 12 migrations (20260507 → 20260518). **11/11 test files, 61/61 cases green** in one sweep, including 4 new concurrency cases (apply-vs-apply, apply-vs-dismiss, DB CHECK constraint, normal terminal states) and 3 new-kind binding-change cases (CREATE_ASSIGNMENT, TERMINATE_WORKER, SWAP_WORKER each route via current responsible after acting cover).
- **Friend's required additions delivered:**
  1. apply-vs-dismiss race test present in `supervisor-decision-concurrency.test.ts` — asserts exactly one wins, the other gets 409, DB state valid, audit matches winner only.
  2. Stale-client success-path test in `chat-apply-transitions-decision.test.ts` rewritten to assert 400 BAD_INPUT + row stays PROPOSED + no domain side effect.
  3. One shared decision-kind registry (`packages/shared-schema/src/zod/supervisor-decision-kinds.ts`) — TOOL_TO_DWI + WORKER_TARGETED_KINDS + SITE_TARGETED_KINDS gone; writer + read-side + authorization all derive from `DECISION_KIND_REGISTRY`.
- **Research sources cited per Rule P9:**
  - https://www.prisma.io/docs/orm/reference/prisma-client-reference#updatemany
  - https://www.postgresql.org/docs/current/transaction-iso.html
  - https://www.postgresql.org/docs/current/ddl-constraints.html
- **Decision needed:** `APPROVED` / `CHANGES_REQUESTED` (with bullet list) / `HOLD`. On APPROVED, the slice moves to APPROVED; F-002 is shippable; next slice can start.

---

## Currently blocked (NOT awaiting approval — blocked by external dependency)

_None._

---

## Recently approved (last 5)

### Scope approval: `F-002` — APPROVED 2026-05-15 evening

- **Type:** Scope artifact approval (not a code slice). No code review needed — this is the gate that unlocks F-002 coding.
- **Artifact:** `handoff/feature-queue/scopes/F-002.md`
- **Last landed commit at approval:** `1fb546e` — `fix(handoff): full sweep for forward-looking wording`
- **Approval received:** Friend's file-grounded verification at HEAD `1fb546e`. Verbatim: "trust fixes are real · F-002 scope approved · use the default picks · start coding".
- **Default picks accepted (all 5):**
  - Q1 `originContext` shape = (b) best-effort capture now.
  - Q2 single vs split = (a) single slice.
  - Q3 dismiss support = (a) include (adds `dismissedAt` + `dismissedReason` migration).
  - Q4 state ENUM = (b) defer.
  - Q5 `proposedDuringAbsence` detection = reuse F-001 helpers.
- **Friend's execution constraints (locked):**
  - single slice covering PROPOSED writer + apply transition + dismiss endpoint
  - include dismissedAt + dismissedReason migration; no full state enum yet
  - best-effort originContext capture only
  - real-DB verification required before surfacing for approval
  - sanity-rerun the 4 F-001 routing tests along with the new F-002 tests
  - stop again when F-002 reaches AWAITING_APPROVAL

### Slice: `routing-foundation-read-apis` (F-001) — APPROVED 2026-05-15 evening

- **Status:** `APPROVED`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `aa363f0` — `docs(handoff): routing slice F-001 → AWAITING_APPROVAL (23/23 green)`
- **Slice commits (oldest → newest):** `84ae39c` · `429886d` · `7e07a24` (plus tracker propagation `aa363f0` outside the slice's code surface)
- **Workflow IDs affected:** D17 (read side), F26 (read side), F27 (read side)
- **Approval received:** Friend's file-grounded verification pass at HEAD `aa363f0`. Verbatim: "no blocking findings · handoff/control state is consistent · routing code and 4th test file are real · DB container/migration state is real · accept the WIP-split deviation and approve the slice".
- **Friend's directive on approval:** mark APPROVED → move active slice forward in canonical files → regenerate outputs → surface the next planned slice (F-002) before writing code.
- **Friend's residual note:** could not personally rerun the 4-file Vitest sweep in their verification shell because pnpm wasn't on PATH and the local Rollup native-module path hit a code-signing issue. Acknowledged as a verification-shell tooling limitation, not a slice bug. Approval not gated on it.
- **WIP-split deviation:** ACCEPTED. Friend's verbatim: "Given the control-loop/history machinery already cites these hashes, additive completion on top is the cleaner choice unless there is a strong review reason to rewrite."

### Slice: `handoff-control-loop` — APPROVED 2026-05-15 evening

- **Status:** `APPROVED`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `03a1c22` — `docs(handoff): rule 23 — confidence-score-before-acting (Akshay directive)`
- **Slice commits (oldest → newest):** `f9fbe68` · `0445110` · `7916a3b` · `b35748e` · `eefaf11` · `091c2a6` · `03a1c22`
- **Workflow IDs affected:** none directly (control surface, spans all 29)
- **Approval received:** Friend's 5th file-grounded verification pass declared the control loop lock-ready at HEAD `091c2a6`. Verbatim: "the control-loop slice is now trustworthy enough to lock."
- **Friend's directive on approval:** mark APPROVED → unblock F-001 → resume from WIP `84ae39c` → finish 4th routing test → run real-DB sweep → split WIP into clean commits → stop for review.

---

## Recently rejected / change-requested

### Slice: `chat-writes-proposed-decisions` (F-002, initial pass) — CHANGES_REQUESTED 2026-05-15 evening

- **Original status:** `CHANGES_REQUESTED` at HEAD `c0c000a`. Resolved by the remediation pass surfaced as AWAITING_APPROVAL above.
- **Friend's verbatim review:** "He built the shape of the design, but not the safety guarantees the design really needed … apply is not truly atomic for most actions; backward-compat path leaves stale PROPOSED rows; some decision kinds are not routed to the current responsible supervisor; concurrent apply/dismiss can break state integrity."
- **4 findings (all resolved in the remediation pass):**
  - F1 — orphan APPLIED on domain failure (rule P3 + P7). Resolved by F-002.4 apply-after-domain.
  - F2 — optional `decisionId` left stale PROPOSED rows (rule P4). Resolved by F-002.5 — decisionId required.
  - F3 — SWAP/TERMINATE/CREATE_ASSIGNMENT bypassed binding routing (rule P5). Resolved by F-002.1 + F-002.6 unified registry.
  - F4 — concurrent apply/dismiss race could corrupt state (rules P1 + P2). Resolved by F-002.2 DB CHECK constraint + F-002.3 race-safe updateMany.
- **Friend's 3 required additions on the remediation plan:**
  1. apply-vs-dismiss race test (not only apply-vs-apply). Delivered in `supervisor-decision-concurrency.test.ts`.
  2. Replace the stale-client success-path test with a 400-assertion test. Delivered in `chat-apply-transitions-decision.test.ts`.
  3. One shared decision-kind registry, not drifting parallel lists. Delivered as `DECISION_KIND_REGISTRY` in shared-schema.
