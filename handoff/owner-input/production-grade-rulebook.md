# Production-Grade Workflow Rulebook

> **Status:** Active. Locked 2026-05-15 evening after F-002 review.
> **Applies to:** every workflow / lifecycle / multi-actor slice from this point on.
> **Source:** Friend's 2026-05-15 evening directive, after the F-002 slice surfaced 4 safety findings
> that documentation-as-acknowledgement did not absolve: orphan-APPLIED, stale-PROPOSED
> back-compat, partial routing-migration, and concurrent-state race.
>
> **Operating principle:** Build boringly correct systems. If it is safe under retries, concurrency,
> stale clients, and partial failure, then it is production-grade. If it only works on the happy
> path, it is not.

## How the rulebook hooks into the existing rules

- `INDEX.md` rule 23 (confidence-score-before-acting) stays. The rulebook is its more concrete cousin
  for workflow / lifecycle slices.
- `INDEX.md` rule 24 (this document) is the umbrella that says "every workflow slice meets this bar
  before it can move to `AWAITING_APPROVAL`."
- A slice cannot be APPROVED if any rule below is violated unless the violation is _explicitly_
  surfaced AND _explicitly_ approved with a documented sunset.

---

## The 10 production-grade rules

### Rule P1 — Workflow invariants must be enforced, not just described

If the design says a row can only be PROPOSED or APPLIED or DISMISSED, the code AND the database
must actually prevent the impossible states.

**Comments are not protection. Type annotations are not protection. Friendly checks before an update
are not protection.**

Use:

- DB CHECK constraints / partial unique indexes for "at most one of these columns can be set"
  invariants.
- Conditional UPDATEs (`UPDATE ... WHERE state-precondition`) so the transition itself is the
  guard.
- SELECT FOR UPDATE inside a transaction when a check-and-act is unavoidable.
- Application-layer guards _in addition to_, not instead of, the DB-level enforcement.

**Test:** the failure mode you described in the docstring must throw / return an error / be rejected
when you run a test that tries to produce it.

---

### Rule P2 — No check-then-act race windows on shared workflow state

`row = SELECT ...` → `if (row.state === 'PROPOSED')` → `... later ...` → `UPDATE ...` is a race.

For state transitions, do not split the precondition check from the state update across two
statements that another connection can interleave between.

Use one of:

- A single `UPDATE ... SET ... WHERE id = ? AND <precondition>` followed by inspecting the affected
  row count.
- `SELECT FOR UPDATE` inside a transaction with appropriate isolation, followed by the conditional
  update.
- `INSERT ... ON CONFLICT DO NOTHING` when modeling a transition as an insert into a state-log
  table.

If you find yourself writing "look up, validate, then update," ask: what if 100 of these run at the
same millisecond? Two passing the validate-step is a real possibility.

**Test:** a concurrent-double-submit test. Fire two requests in parallel; assert exactly one
succeeds.

---

### Rule P3 — No final business state before the real domain effect succeeds

Do not mark a workflow item APPLIED if the real action can still fail afterward.

If your apply path is `apply lifecycle in tx 1` + `inject domain call in tx 2`, that is two
transactions. If tx 2 fails, tx 1 is already committed. The audit log says "the supervisor applied
this," but the worker is not actually marked absent. That is corruption of business truth.

Choose one of:

- **Truly atomic.** Refactor the domain route's logic into a tx-shareable function. The workflow
  state and the domain state succeed or fail together.
- **Intermediate state.** Introduce an APPLYING (or "in flight") state in the lifecycle. APPLIED is
  set only after the domain effect commits. APPLYING → APPLIED can be performed by the same request
  thread; on failure, the row stays in APPLYING and a follow-up reconciliation can decide.
- **Apply-after-domain.** Do the domain write first. On success, conditionally update the lifecycle
  with `WHERE state = 'PROPOSED'`. If the conditional update reports 0 rows, you have a different
  concurrency problem to surface — do not silently swallow.

The "lifecycle first, domain second" pattern with no compensation is the worst of all worlds and is
explicitly banned without a documented sunset.

**Test:** force a failure in the domain call (mock it to throw, point at a bad row, etc.) and
assert the workflow row did NOT advance.

---

### Rule P4 — Back-compat paths must not leave live data in misleading states

Temporary back-compat is allowed. But it must not leave:

- orphan PROPOSED rows that someone could later apply / dismiss a second time
- duplicate side effects (action ran twice because the old path and new path both fire)
- "stale approval items" in any approval queue / surface

If a fallback path exists, it must come with:

- a clear sunset condition ("when all mobile clients on version ≥ X.Y")
- test coverage for the back-compat path
- an explicit risk statement in the slice's approval packet
- a tracker entry for the removal slice

**Test:** the back-compat path produces the same _terminal_ data shape as the primary path. No
orphan rows; no double-effect.

---

### Rule P5 — New workflow kinds must update all four layers together

Whenever a new decision kind / workflow kind is introduced, update all four of these in the same
slice OR explicitly justify the partial wiring:

1. **Writer mapping** — the chat extractor / API entry point knows how to write the new kind.
2. **Authorization / routing** — the new kind is in the read-side routing sets so the right
   responsible actor sees it. (For binding-routed kinds: WORKER_TARGETED_KINDS /
   SITE_TARGETED_KINDS or their equivalent.)
3. **Reader visibility** — the GET / list / dashboard surface returns the new kind correctly.
4. **Audit payload** — the payload schema captures everything an auditor or downstream consumer
   needs.
5. **Tests** — happy path + at least three negative paths.

Silently letting a new kind fall back to old responsibility rules / old read predicates is a
design-drift hazard. If you intentionally fall back, the scope approval packet says so verbatim.

**Test:** for each new kind, one test that exercises a binding change between propose-time and
apply-time. The new responsible actor must be the one routed to.

---

### Rule P6 — Negative-path testing is mandatory

A slice is not test-complete with only happy-path tests. Every workflow slice must include:

- unauthorized caller (right tenant, wrong actor)
- cross-tenant access (wrong tenant)
- already-applied / already-dismissed / already-terminal
- missing dependency / bad input / malformed body
- concurrent or double-submit behavior where the row is shared
- partial-failure behavior (the domain effect fails after the lifecycle commits, or vice versa)
- stale-client behavior, if back-compat exists

"I tested the happy path on a real DB" is necessary but not sufficient.

---

### Rule P7 — Known limitation is not auto-acceptable limitation

If a known limitation can:

- corrupt business truth ("audit says applied; worker not actually marked absent")
- produce duplicate effects
- misroute responsibility
- leave open / stale items visible

then the slice is _not approval-ready_ just because the limitation is documented.

Documentation is not a substitute for correctness. Surfacing the limitation is mandatory, but
surfacing alone does not grant a pass. The fix-it-later option only applies when the limitation is
provably non-corrupting (e.g., a UX rough edge, a missing dashboard column, a non-load-bearing
performance tweak).

When in doubt: treat the limitation as a blocker until friend explicitly accepts it as
non-corrupting.

---

### Rule P8 — Production-grade means real-life behavior under pressure

Code must stay correct under:

- retries (the client gave up at 5s and resent)
- double-taps (the user pressed Apply twice)
- concurrent actors (Lakshmi and Ravi both opened the same Decisions tab and tapped at the same
  second)
- stale mobile clients (an old version still calls the old shape)
- partial failures (the network died after the lifecycle UPDATE but before the inject)
- branch rebases (the slice's commits got squashed)
- tenant boundaries (a request for company A must never see company B's rows)

If the slice only works in the ideal sequence, it is not production-grade. Yet.

---

### Rule P9 — Research first for risky workflow primitives

For concurrency / transaction / validation / lifecycle-risk work, do a short research pass before
the first line of code. Cite the sources in the slice's approval packet.

Prefer official docs first:

- [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [Prisma interactive transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions#interactive-transactions)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL CHECK + EXCLUSION constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Fastify request lifecycle + validation](https://fastify.dev/docs/latest/Reference/Lifecycle/)
- [Fastify testing with inject](https://fastify.dev/docs/latest/Guides/Testing/)
- [OWASP race condition cheatsheet](https://owasp.org/www-community/vulnerabilities/Race_Conditions)

If the slice is doing check-then-act, cross-route apply, idempotency, auth/routing changes, or any
distributed-state operation, the research pass is mandatory, not optional. Confidence ≥95% required
before writing code (rule 23) — for production-grade work the bar moves toward "I read the official
doc + a reference implementation" not "I think I remember how this works."

---

### Rule P10 — Every approval packet must include a failure matrix

Before asking for approval on a workflow slice, the packet (surfaced in `pending-approvals.md`) must
include a section that names:

| Question                                                | Answer |
| ------------------------------------------------------- | ------ |
| What invariants does this slice introduce?              |        |
| How is each invariant enforced (app / DB / both)?       |        |
| What happens on failure of the domain effect?           |        |
| What happens on retry / double-submit?                  |        |
| What happens under concurrent requests on the same row? |        |
| What happens for a stale client (old shape)?            |        |
| What is still intentionally deferred (with sunset)?     |        |

If you cannot fill this table clearly, the slice is not ready.

---

## Definition of done (production-grade)

A slice is "done" if and only if all of these are true:

1. Design intent is implemented.
2. Workflow invariants are enforced by code AND by DB constraints where applicable.
3. Reader / writer / authorization / audit layers all agree on the new state model.
4. Negative paths from rule P6 are tested.
5. Real-DB verification (against a fresh local Postgres) is green.
6. Control surface (handoff tracker, change-history, feature-queue) is updated.
7. The failure matrix in the approval packet is filled in.
8. Remaining limitations are non-corrupting, explicit, and intentionally accepted by the owner.

## How to work inside the rulebook

You have freedom inside these guardrails:

- Choose the best implementation pattern.
- Refactor to get atomicity (it is allowed; sometimes required).
- Split a slice if safety needs more than one round.
- Challenge the scope if production safety says it is too wide. The scope is not above the rules.

But if you cannot meet the rules above, do not quietly ship a "mostly works" version. Stop, surface
the exact risk, propose the safer shape, and wait.

## What to internalize from the F-002 review

- Documented limitation is not the same as acceptable limitation. Rule P7 exists because of this.
- Atomic workflow state matters more than passing happy-path tests. Rule P3.
- Back-compat must not leave misleading open workflow rows. Rule P4.
- New decision kinds must not silently fall back to old responsibility rules unless explicitly
  approved in scope. Rule P5.
- Race windows are real even when each individual statement looks safe. Rule P2.

## Short operating rule

> **Build boringly correct systems.**
>
> If it is safe under retries, concurrency, stale clients, and failure, then it is production-grade.
> If it only works on the happy path, it is not.

## Companion rule (Akshay, 2026-05-16, locked after F-002 round-3 review) — Policy-first / no unnecessary complexity

> If a complexity exists ONLY because of a rare operational edge case, FIRST ask whether we should simplify the rule
> instead of building a complex system around it. Real problems need real solutions, but real solutions are often
> simpler than technical over-design.

This rule sits ALONGSIDE the 10 production-grade rules above. It does NOT override them. It does NOT lower the bar
on necessary complexity. It governs the question of whether the complexity should exist at all.

**Decision flow for new complexity:**

1. Does this complexity exist because of a rare operational edge case (mid-day reassignment, account-handoff scenarios,
   etc.)? If no → engineer it correctly under P1–P10.
2. If yes → can a product / operational rule eliminate the edge case at the source? Surface to owner BEFORE writing
   code.
3. If owner adopts the policy → engineer the simpler system. If not → engineer the complex one with full P1–P10.

**F-002 worked example:**

- The round-1 → round-2 → round-3 escalation of stale-authority complexity was driven by "HR might change supervisor
  mid-day."
- Three engineering rounds (apply-after-domain → race-safe writer → tx-callable services) addressed the symptom.
- Owner's same-day-freeze policy proposal (S-001 candidate) eliminates the edge case at the source: HR cannot change
  today's supervisor; changes start tomorrow.
- The engineering still has value (defense-in-depth: retry safety, double-tap safety, atomicity for domain-failure
  rollback). But the load-bearing protection moves from code to policy.
- Lesson: had the policy question been asked in round-1 scoping, two engineering rounds could have been replaced by
  one short spec slice.

**How to apply during scoping:**

When writing a scope artifact (e.g. `handoff/feature-queue/scopes/F-XXX.md`), add a section titled "Edge cases driving
this complexity" that lists the operational scenarios the slice exists to handle. If any of them is "an edge case the
owner could choose to disallow operationally," surface that as an explicit choice in the scope's open-questions list.

**What this rule does NOT mean:**

- It does NOT mean skip defense-in-depth where the edge case can't be policy-eliminated.
- It does NOT mean over-trust the policy and skip rule 24 / P1–P10 (the engineering bar still applies for any
  complexity that remains).
- It does NOT mean adopt a policy that's hard to operationally enforce (e.g. "never have concurrent users" is not a
  real policy). The policy has to be sustainable in the field.

---

## Companion rule: inspect existing repo patterns BEFORE designing (locked 2026-05-16 after F-003 round-1)

Locked alongside rule 26 in `handoff/owner-input/INDEX.md`. Upstream of rules 23–25: before reasoning about confidence, production-grade enforcement, or policy-vs-code, you must first ground the design in what the codebase actually does.

**The two-line operating rule:**

- Before locking a design, inspect the repo for an existing pattern that solves a similar problem. Reuse it unless you can clearly explain why it's not enough.
- Design from the actual codebase first, not from theoretical assumptions about it.

**Four questions every scope artifact must answer (before picks are locked):**

1. **What similar code already exists?** Name the files with grep/read evidence — not from memory.
2. **What real runtime pattern does it use?** Read the code, not just the comments.
3. **Can I extend that pattern instead of introducing a new one?** Default: yes.
4. **If I'm changing the pattern, why is the old one not enough?** Specific reasons, not generic preferences.

**Concrete example (F-003 saga, the rule's origin):**

The scope artifact claimed "OS-cron + HTTP endpoint matches existing `reset-ai-spend`." The actual existing pattern is dispatcher-tick piggyback (`maybeResetAiSpend` is called inside `dispatcher/index.ts:tick`, gated by an in-memory marker). The wording mismatch was caught pre-code by reading the file; under this rule it would have been caught at scope time, before owner approval.

Separately: the original audit-existence-check idempotency for `BINDING_ENDED_AUTO` overclaimed multi-replica safety. A real read of similar dedup patterns in the codebase (or industry — partial unique index + `INSERT ... ON CONFLICT DO NOTHING`) would have surfaced the DB-enforced solution earlier. Two repo-grounding misses in one slice.

**How to apply during scoping:**

Every new scope artifact (`handoff/feature-queue/scopes/F-XXX.md`) must include a section titled "Existing-pattern survey" that answers the four questions above with grep/read evidence. Skip-able only when no related code exists in the repo — and even then, state that explicitly.

**What this rule does NOT mean:**

- It does NOT mean copy patterns mechanically without judgment — existing patterns can be wrong, and you can still choose to introduce a new one. The rule is about GROUNDING the decision in repo reality, not about defaulting to the existing pattern blindly.
- It does NOT mean spend a day surveying the whole repo for every slice. The survey is targeted: only the patterns most adjacent to the slice's problem domain.
- It does NOT replace rules 23 (confidence-score), 24 (production-grade), or 25 (policy-first). It is upstream of all three: do the repo survey first, then apply the other rules to the grounded design.
