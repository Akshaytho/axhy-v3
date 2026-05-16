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

---

## Companion rule: pre-decided product behavior is an input, not a topic (locked 2026-05-16 after F-004 round-2)

Locked alongside rule 27 in `handoff/owner-input/INDEX.md`. Upstream of rules 23–26: before reasoning about repo patterns (rule 26), policy-vs-code (rule 25), production-grade enforcement (rule 24), or confidence (rule 23), you must first ground the design in the already-decided product behavior.

**The two-line operating rule:**

- Before any new backend design, restate the already-decided product behavior in simple English and confirm the draft conforms to it. If you can't restate it from memory, find it in the closure spec / audits / prior decisions log and pin it at the top of the scope artifact.
- The owner's locked product behaviors are inputs to the design, not topics for the design. Re-designing a human concept into a backend-shaped concept is a rule-27 violation.

**Mandatory 5-question pre-design checklist (must appear at the top of every scope artifact, BEFORE the rule-26 existing-pattern survey):**

1. **What product behavior is already decided here?** Restate in plain English, with citation (spec section / audit scene / decisions-log entry / owner directive date).
2. **What UI / persona surface proves it's decided?** Name the file/line/scene the surface lives at — even when the surface itself is deferred to a later slice.
3. **Which of the 4 data buckets does each piece of state live in?** Bucket every piece of data the slice touches into one (or a labeled combination) of: **(1) exact SQL truth** — relational rows queried point-in-time; never stale; the source of operational truth. **(2) frozen SNAPSHOT** — JSON blob captured at one moment, immutable thereafter; captures judgement, not state. **(3) live-or-delta-refreshed** — read from current SQL truth on demand or invalidated on a known event. **(4) vector-retrievable memory** — embedded text searchable via pgvector similarity; layered ON TOP of bucket 1, not instead of it. Do NOT collapse buckets.
4. **Did I redesign a human / product concept into a backend-shaped concept? OR overstate alignment to a locked behavior?** Two related failure modes. **(a) Shape redesign:** e.g. "handoff package" → not "everything we know about this site"; "context loading" → not "fresh DB query on every chat message". **(b) Honesty-of-wording:** do not claim "exact spec match" if an open question's interim default is filling a field; do not write a new product behavior as if pre-locked when it requires owner sign-off. Wording that overstates alignment is itself a rule-27 drift.
5. **What's the cost model my design implies?** If the design queries DB / runs AI per message and an alternative loads-once-and-invalidates exists, explain why the cheaper alternative was rejected. State which buckets are read per-event vs per-message vs per-session.

**The running list of locked product behaviors (additions land here as owner decides them):**

- **Base + Delta + Live context model (locked 2026-05-16, owner directive after F-004 round-2 review).** Supervisor chat context is composed in layers. Base context: loaded ONCE at first chat of the day; contains stable rules + portfolio + near-horizon summary; cached for the day. Delta layer: event-invalidated during the day on complaint / decision / assignment / calendar / binding change; appended to base. Live fetch: on-demand for far-horizon queries ("next month?", "6 months?") via existing chat tool path; results NOT cached. Why it matters: loading the full DB on every message is wrong for cost AND wrong for the product. Future slices must restate this at the top of their scope artifact before designing context loading.
- **Postgres + pgvector + delta/live AI-memory architecture (locked 2026-05-16 late evening, owner directive after F-004 round-3 review — the 4-bucket model rule-27 Q3 enforces).** Every piece of data the system touches lives in exactly one of 4 buckets:
  - **Bucket 1 — exact SQL truth.** Relational tables queried point-in-time (Worker, Site, Assignment, Complaint, Binding, AuditEvent, LivingDocRule rows). Never stale. Source of operational truth.
  - **Bucket 2 — frozen SNAPSHOT.** JSON blob captured at one moment, immutable thereafter (handoffPackage; originContext on DWI). Captures JUDGEMENT, not state.
  - **Bucket 3 — live-or-delta-refreshed.** Read from current SQL truth on demand, or invalidated on a known event. Combines bucket-1 freshness with caching.
  - **Bucket 4 — vector-retrievable memory.** Embedded text searchable via pgvector similarity (LivingDoc rule text, HRUpdate body, complaint body, AI conversation history). For "relevant" rather than "exact". Layered ON TOP of bucket 1, not instead of it.
  - **Composition rules:** Do NOT make one frozen blob carry the whole system. Do NOT treat retrieval as a replacement for exact SQL truth. Do NOT skip snapshots in favor of "just refresh live" — handover judgement must be captured at the moment it was made. When data benefits from multiple buckets (e.g. LivingDoc rules are bucket-1 + bucket-4), label it as the combination.
  - **Why it matters:** the drift was treating handoffPackage as if it had to carry every read concern the future AI chat will need. It doesn't. The AI chat will pull bucket-1 SQL truth for exact filters, bucket-3 delta/live for freshness, bucket-4 vector retrieval for relevant memory, AND read bucket-2 snapshots when it needs the outgoing person's judgement. The 4 buckets compose; each slice should specify which buckets it produces and which it reads.
- **HandoffPackage = focused snapshot of outgoing supervisor's JUDGEMENT (locked closure spec §3.7 + Decision 8).** Captures what the outgoing person decided about this site at this moment (rules, recent complaints, active workers, open items in next 14 days). Truncation policy locked at spec §3.7 Invariants line 322 (100KB cap, drop oldest complaints first then activeWorkers field detail). NOT "everything we know about the site" — long-horizon planning queries stay LIVE via chat tool path, "relevant memory across sites" stays bucket-4 retrieval.
- **4 rule layers (locked closure spec §3.7 + audit Ravi Month 9b).** Layer 1 company-permanent rules (HRUpdate / HRUpdateRule) stay LIVE-fetched (bucket-1 + 4). Layer 2 HR/pod rules stay LIVE-fetched (bucket-1 + 4). Layer 3 site-specific supervisor rules TRANSFER on permanent rebind (mechanism Z — copy to incoming LivingDoc.siteRules + handover summary in freeNotes); future bucket-4 embedding planned but not in F-004. Layer 4 personal supervisor working notes STAY with original supervisor.

**Concrete examples (F-004 saga, the rule's origin):**

- **Round-1 shape drift:** sourced `siteRules` from `Site` metadata instead of outgoing supervisor's `LivingDoc.siteRules` — "site rules" was re-shaped into "static site attributes" in backend thinking.
- **Round-2 shape drift:** `recentComplaints` shape redesigned to `{id, text, severity, state, loggedAt}` instead of spec's `{id, kind, state, loggedAt, body}`; `siteId` smuggled into top-level payload despite not being in spec's listed 8 fields.
- **Round-3 honesty drift (the new failure mode that prompted Q4 to grow):** pick 1 + pick 3 overclaimed "exact spec match" / "no additions, no omissions" while Open Q5's `kind`-field interim default is still in play. Also Open Q2 smuggled a new first-ever-binding summary-entry text as if it were spec-locked rather than a new product choice. Friend's principle: cannot claim alignment to a locked behavior while one mapping is still an interim default; cannot smuggle a new product behavior in as already-decided.
- The base+delta+live model AND the 4-bucket pgvector model are both owner pre-existing product decisions that kept getting re-debated when they should have been pinned at the top of the artifact as locked inputs.

**How to apply during scoping:**

Every new scope artifact (`handoff/feature-queue/scopes/F-XXX.md`) must include a "Pre-decided product behavior" section at the TOP (before the rule-26 existing-pattern survey) that answers the 5 questions above. If a question doesn't apply (e.g., no UI surface yet), state that explicitly with the reason.

**What this rule does NOT mean:**

- It does NOT freeze product behavior forever. Owner can change a locked product behavior; the rule is that the design must START from the current locked state, not re-derive it.
- It does NOT replace rules 23–26. It is upstream: ground in pre-decided product behavior FIRST, then survey existing patterns, then apply confidence / production-grade / policy-first rules to the grounded design.
- It does NOT mean every locked behavior must be exhaustively restated in every scope artifact. Restate ONLY the behaviors the slice touches — but restate them in plain English with citation, not by reference.
