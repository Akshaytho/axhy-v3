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

### Slice: `chat-writes-proposed-decisions` (F-002 — round 2 review) — CHANGES_REQUESTED 2026-05-15 evening

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

**Fix R2 — close the stale-authority window in commitApply (G2, rules P2 + P3).**

Two layers:

- **R2a (LIFECYCLE side, must-do):** add `isCallerAuthorized` re-check INSIDE `commitApply`, before the conditional UPDATE. If authority changed since `preCheckApply`, throw `NOT_RESPONSIBLE`. The conditional UPDATE never runs; no DWI_APPLIED audit is emitted; the row stays PROPOSED. Friend's success-condition "audit state matches the winner only" is preserved.

- **R2b (DOMAIN side, surface for friend's call):** for inject-style branches, the domain effect already happened BEFORE commitApply. R2a stops the lifecycle leak but the domain effect (e.g. Attendance row) remains. Three ways to close this:

  | Option  | Cost                                                                                                                                                                                                                     | What it gains                                                                                                                                                          |
  | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | R2b-i   | Smallest — accept the leak; document it; surface in audit (DWI never emitted under stale auth + WORKER_MARKED_ABSENT alone → manual flag)                                                                                | Closes the lifecycle hole only. Domain leak remains under stale-auth.                                                                                                  |
  | R2b-ii  | Medium — wrap each /chat/apply branch in an outer `prisma.$transaction` + `SELECT FOR UPDATE` on the SupervisorDecision row across the inject. PG row-lock blocks concurrent dismiss + holds during the inject.          | Closes both lifecycle AND inject-window dismiss-races. Stale binding still a concern unless we add SERIALIZABLE isolation. Cost: longer-held connection during inject. |
  | R2b-iii | Large — refactor each inject-style domain route to expose its logic as a tx-callable function. /chat/apply calls that function INSIDE the same tx as commitApply. True atomicity, no inject() at all for these branches. | Closes everything cleanly. Significant refactor (~5 routes).                                                                                                           |

  **My default:** R2a + R2b-i for this round. R2b-ii or R2b-iii deferred to a separate slice with an explicit sunset trigger (e.g. when the first production incident surfaces a stale-auth case, OR proactively after F-007 / F-005 ship). Reason: the lifecycle audit is the auditable record; under R2a the audit correctly reflects "no apply happened" when authority is stale, so the domain leak is detectable + recoverable. Friend's call though.

**Fix R3 — route-level concurrency + route-level stale-authority tests (G3, rules P6 + P8).**

New test file `chat-apply-route-concurrency.test.ts`:

1. Parallel `app.inject` of `/chat/apply` for the same decisionId. Exactly one wins, the other 409, DB row in a valid terminal state, audit matches winner only.
2. Parallel `/chat/apply` + `POST /decisions/:id/dismiss` via `app.inject`. Same assertions.
3. **Stale-authority race (R2a verification):** preCheck authorized; THEN simulate a binding change before commitApply runs (use a small `setTimeout` between phases, or seed the binding in `Promise.all` with the apply); assert commitApply throws NOT_RESPONSIBLE and lifecycle stays PROPOSED. This proves R2a closes the lifecycle window even if the inject is in-flight.
4. **G1 verification:** termination apply against a worker that's already TERMINATION_PENDING — assert row stays PROPOSED + 409. This proves R1 fixed the early-return-with-commit bug.

#### P10 failure matrix (revised, post-R1+R2a+R3)

| Question                                                     | Answer                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?                   | All previous invariants + (5) lifecycle commit only happens when the actor is STILL responsible at commit time, not just at pre-check time. (6) Termination lifecycle never commits unless the worker.update is going to commit too.                                                                                                                  |
| How is each invariant enforced?                              | Previous mechanisms + (5) `isCallerAuthorized` re-check inside `commitApply` BEFORE the conditional UPDATE. (6) Worker validation runs BEFORE `applyProposedDecision` in the termination tx; tx commits both or neither.                                                                                                                              |
| What happens on stale authority between preCheck and commit? | LIFECYCLE: row stays PROPOSED + 403 NOT_RESPONSIBLE returned. DOMAIN (inject-style): the domain effect from the in-flight inject lands; audit shows the orphan domain effect (no matching DWI_APPLIED). Manual reconciliation surface needed; tracked for cleanup slice. propose_termination + propose_living_doc_update: no domain leak (atomic tx). |
| What happens for the G1 termination invalid-worker case?     | Tx rolls back. Lifecycle stays PROPOSED. 404 WORKER_NOT_FOUND or 409 ALREADY_TERMINATING returned. No appliedAt set.                                                                                                                                                                                                                                  |
| What is still intentionally deferred (with sunset)?          | Domain-side leak under stale authority for inject-style branches. Sunset: when stale-auth incident is observed, OR proactively in a follow-up slice that extracts domain logic for tx-sharing (or wraps inject in pessimistic row-lock — option R2b-ii). Today's audit trail surfaces it for reconciliation.                                          |

#### Suggested commit shape (after plan approval)

1. `fix(chat): reorder termination tx — validate worker before lifecycle commit (F-002.9, fixes G1)`
2. `fix(decisions): re-check authorization in commitApply (F-002.10, fixes G2 lifecycle side)`
3. `test(decisions): route-level concurrency + stale-auth tests (F-002.11, fixes G3 + verifies R1+R2a)`
4. `docs(handoff): F-002 round-2 remediation → AWAITING_APPROVAL`

For R2b (domain-side leak fix) — surfaced as an explicit follow-up slice candidate F-002.b, NOT in this round, awaiting your choice between R2b-i (defer, manual reconciliation), R2b-ii (pessimistic locking), or R2b-iii (refactor domain routes for tx-sharing).

#### Decision needed

- `APPROVED on plan` (with optional R2b override) → I research P9 sources, implement R1 + R2a + R3 in 4 commits, re-surface as AWAITING_APPROVAL.
- `CHANGES_REQUESTED on plan` → name what to change.
- `HOLD` → pause F-002. Note: F-001 read API still works; F-002 writes happen in chat but with the current lifecycle gaps.

**I will not write a single line of fix code until you approve this round-2 remediation plan.** Recording it openly: this is the second time my orchestration around safe primitives missed real corruption windows. The pattern: I get the core writer right but mis-order the tx callbacks around it. Adding to my session memory.

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
