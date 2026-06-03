# Owner Input — Index + Rules

> **Layer 4 of the handoff system. The control loop.** Layers 1–3 are descriptive (build state, workflow architecture, generated views). This layer is **prescriptive** — it captures what the owner (Akshay) wants, decides, or has approved.
>
> Everything Claude does between sessions must run through this layer.

## Files

| File                   | What it holds                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `INDEX.md` (this file) | Rules, status enums, read-order, definitions.                                                            |
| `pending-notes.md`     | Owner-written notes the next session must read + acknowledge before coding.                              |
| `decisions-log.md`     | Append-only log of past owner decisions (approvals, rejections, scope changes).                          |
| `pending-approvals.md` | What is currently awaiting the owner's explicit approve/reject/hold word.                                |
| `active-slice.md`      | The slice currently in flight: name, status, branch, commit, files, verification, workflow IDs affected. |
| `change-history.md`    | Last ~10 slice transitions.                                                                              |

## Slice-state enum (mandatory)

Every slice tracked in `active-slice.md` and in `handoff/feature-queue/INDEX.md` uses exactly one of these values:

| Value               | Meaning                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `PLANNED`           | Surfaced in the feature queue, not yet started.                                                           |
| `WIP`               | Currently being built. Branch + commit cited.                                                             |
| `AWAITING_APPROVAL` | Code complete + verified; owner has not yet said the approval word.                                       |
| `APPROVED`          | Owner approved; safe to merge / move to next slice.                                                       |
| `BLOCKED`           | Cannot proceed without an external action (decision, dependency, prod window). The blocker must be named. |
| `DONE`              | Merged into main + verified end-to-end.                                                                   |

## Note-status enum (for `pending-notes.md`)

Every owner note has one of these values:

| Value          | Meaning                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `NEW`          | Just written. The next session MUST acknowledge before coding any affected slice. |
| `ACKNOWLEDGED` | Claude read it and confirmed in surface message.                                  |
| `APPLIED`      | The note has been acted on — the relevant slice / spec / map updated.             |
| `DEFERRED`     | The note is real but is parked for a later slice with a named trigger.            |

## Approval-word convention

For `pending-approvals.md` items, the owner's decision must be one of these literal strings appearing in the canonical file:

| Decision            | Effect                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| `APPROVED`          | Slice may move to `APPROVED` state. Next slice can start.                     |
| `CHANGES_REQUESTED` | Slice stays `AWAITING_APPROVAL`. Specific change requests must be enumerated. |
| `HOLD`              | Slice pauses. No next slice until the hold is lifted.                         |
| (empty / nothing)   | Status defaults to `AWAITING_APPROVAL`. Next slice does NOT start.            |

## Hard rules (non-negotiable)

These extend the rules in `handoff/execution-state/INDEX.md` (1–15).

16. **No new slice starts while owner notes are NEW** on an affecting workflow. Acknowledge first.
17. **No new slice starts while a prior slice is `AWAITING_APPROVAL`.** Approval is the unlock.
18. **The active slice is the only WIP slice.** Two simultaneous WIP slices are a bug — pause one before starting the other.
19. **Every state transition is recorded** in `change-history.md` with the commit hash that caused it.
20. **`pending-approvals.md` is canonical.** The HTML dashboard renders it; the dashboard is NEVER the source of truth.
21. **Owner notes are read every session start.** Even if there are no NEW notes, claude scans the file and confirms "0 NEW notes" before coding.
22. **No vector-DB authority.** Owner truth + workflow truth + approval state must remain plain markdown files in git. (Closure spec rule, per friend 2026-05-15 evening.) Vector search is an optional later layer, not authority.

23. **Confidence-score-before-acting (Akshay rule, 2026-05-15 evening).** Before any non-trivial action (architectural choice, new pattern, code design, product decision, debug hypothesis, anywhere I'd otherwise hedge with "suggestion" / "low confidence"), state a confidence score 0–100%.
    - **≥90% with own approach** → execute. Briefly state the basis for the confidence.
    - **<90% with own approach** → STOP. Search the internet first. Find how others have solved this problem (libraries, blog posts, RFCs, repos). Analyse what they did + why. Compare to mine. Either improve mine to ≥90% confidence, OR adopt theirs (improved) to ≥95% confidence.
    - **≥95% required when adopting an internet-derived approach** — because I'm supposed to be analysing + adapting, not blindly copying. Cite the source.
    - **Below threshold even after research** → surface to the owner with the gap named explicitly, don't pretend confidence.
    - Skip the score for trivial mechanical edits (typo fix, rename a freshly-defined variable, refresh of a row I just wrote). Apply it everywhere else.
    - Format when surfacing: `Confidence: NN% — [own / research-improved / blocked]` then 1–3 bullets covering basis + risks + (if researched) the source URL.

24. **Production-grade workflow rules (Akshay + friend rule, 2026-05-15 evening, locked after F-002 review).** Every workflow / lifecycle / multi-actor slice must meet the 10-rule production-grade bar before moving to `AWAITING_APPROVAL`. The full text lives in `handoff/owner-input/production-grade-rulebook.md`.
    - **Documented limitation ≠ acceptable limitation.** If a limitation can corrupt business truth, produce duplicate effects, or misroute responsibility, surfacing it does NOT grant a pass (rule P7). Treat as blocker until owner explicitly accepts as non-corrupting.
    - **Workflow invariants are enforced, not described.** DB-level CHECK constraints + conditional UPDATEs are required where state correctness is load-bearing (P1).
    - **No check-then-act race windows** on shared state (P2). Conditional UPDATE with WHERE-precondition is the default pattern.
    - **No final state before the real domain effect.** Three permitted shapes: truly atomic / intermediate state / apply-after-domain. "Lifecycle commits in tx 1, domain inject in tx 2" is banned without a sunset (P3).
    - **Back-compat paths cannot leave orphan PROPOSED rows** or duplicate side effects (P4).
    - **New decision kinds wire all 4 layers** (writer / routing / reader / audit / tests) in the same slice OR get explicit fall-back approval (P5).
    - **Negative-path tests mandatory** for: unauthorized caller, cross-tenant, already-applied/dismissed, bad input, concurrent double-submit, partial failure, stale client (P6).
    - **Real-life behavior under pressure** — retries, double-taps, concurrent actors, stale clients, partial failures, tenant boundaries (P8).
    - **Research first** for concurrency / transaction / lifecycle-risk work; cite sources from PG docs, Prisma docs, OWASP, etc. (P9 — and Rule 23 raises the confidence bar accordingly).
    - **Failure matrix required in every approval packet** (P10): what invariants, how enforced, what happens on failure, retry, concurrency, stale client, what's deferred.
    - **Definition of done (production-grade):** design intent implemented + invariants enforced (code AND DB) + all layers agree + negative paths tested + real-DB green + control surface updated + failure matrix filled + remaining limitations non-corrupting AND explicitly accepted.

25. **Policy-first / no unnecessary complexity (Akshay rule, 2026-05-16, locked after F-002 round-3 review).** Before building a complex system around an operational edge case, first ask whether we should simplify the rule itself.
    - **The two-line operating rule:**
      - If a complexity exists ONLY because of a rare operational edge case, first ask whether we should simplify the rule instead of building a complex system around it.
      - Real problems need real solutions, but real solutions are often simpler than technical over-design.
    - **Decision flow for any new complexity:**
      1. Does this complexity exist because of a rare operational edge case (e.g. mid-day reassignment, account-handoff)? If no → engineer it correctly under rule 24 / P1–P10.
      2. If yes → can a product / operational rule eliminate the edge case at the source? Surface to owner BEFORE writing code.
      3. If owner adopts the policy → engineer the simpler system. If not → engineer the complex one with full P1–P10.
    - **Concrete example (F-002 saga):** the round-1 + round-2 + round-3 complexity around stale-authority during /chat/apply was driven by "HR might change supervisor mid-day." Owner's same-day-freeze policy (S-001 candidate) eliminates this edge case at the source. Defense-in-depth (R2a auth re-check, R2b-iii atomicity) still stands; the load-bearing protection moves from code to policy.
    - **What this rule does NOT change:** the production-grade bar (rule 24 / P1–P10) is still mandatory for any complexity that DOES remain. This rule is about NOT building unnecessary complexity; it does NOT lower the bar on necessary complexity.
    - **How to apply going forward:** when scoping a new slice, ask the rare-edge-case question first. If found, surface a policy-vs-code option to the owner in the scope artifact, not after the code lands.

26. **Inspect existing repo patterns BEFORE designing (Akshay rule, 2026-05-16, locked after F-003 round-1 review).** Do not design a new slice from theoretical assumptions about the codebase. Design from what the codebase actually does.
    - **The two-line operating rule:**
      - Before locking a design, inspect the repo for an existing pattern that solves a similar problem. Reuse it unless you can clearly explain why it's not enough.
      - Design from the actual codebase first, not from theoretical assumptions about it.
    - **Mandatory four questions in every scope artifact (before picks are locked):**
      1. **What similar code already exists?** Name the files (with grep/read evidence, not from memory).
      2. **What real runtime pattern does it use?** Read the code, not just the comments.
      3. **Can I extend that pattern instead of introducing a new one?** Default: yes.
      4. **If I'm changing the pattern, why is the old one not enough?** Specific reasons, not generic preferences.
    - **Concrete example (F-003 saga):** the scope artifact claimed "OS-cron + HTTP endpoint matches existing `reset-ai-spend`." The actual existing pattern is dispatcher-tick piggyback (`maybeResetAiSpend` called inside `dispatcher/index.ts:tick`). The mismatch was caught pre-code by reading the file; under this rule, it would have been caught at scope time, before owner approval. Also: the original audit-existence-check idempotency for `BINDING_ENDED_AUTO` overclaimed multi-replica safety; a real read of similar dedup patterns in the codebase (or industry — partial unique index + `INSERT ... ON CONFLICT DO NOTHING`) would have surfaced the DB-enforced solution earlier.
    - **What this rule does NOT change:** rules 23 (confidence-score) + 24 (production-grade) + 25 (policy-first) still apply. This rule is upstream of all three — it forces you to ground the design in repo reality before reasoning about correctness, complexity, or policy.
    - **How to apply going forward:** every new scope artifact must include a "Existing-pattern survey" section that answers the four questions above. Skip-able only when no related code exists in the repo — and even then, state that explicitly.
    - **Portable copy of this rule:** also lives at `/Users/thotaakshay/.claude/portable-rules-akshay.md` for transit to other projects; the project canonical here governs in-session work.

27. **Pre-decided product behavior is an input, not a topic (Akshay rule, 2026-05-16, locked after F-004 round-2 drift).** Before any new backend design, restate the already-decided product behavior in simple English and verify the draft matches it. Owner-locked product behaviors are constraints the design satisfies — they are NOT problems for the design to re-solve.
    - **The two-line operating rule:**
      - Before any new backend design, restate the already-decided product behavior in simple English and confirm the draft conforms to it. If you can't restate it from memory, find it in the closure spec / audits / prior decisions log and pin it at the top of the scope artifact.
      - The owner's locked product behaviors are inputs to the design, not topics for the design. Re-designing a human concept into a backend-shaped concept is a rule-27 violation.
    - **Mandatory pre-design checklist (5 questions in every scope artifact, BEFORE the rule-26 survey):**
      1. **What product behavior is already decided here?** Restate in plain English, with citation (spec section / audit scene / decisions-log entry / owner directive date).
      2. **What UI / persona surface proves it's decided?** Name the file/line/scene the surface lives at — even when the surface itself is deferred to a later slice.
      3. **Which of the 4 data buckets does each piece of state live in?** Bucket every piece of data the slice touches into one (or a labeled combination) of: **(1) exact SQL truth** — relational rows queried point-in-time; never stale; the source of operational truth. **(2) frozen SNAPSHOT** — JSON blob captured at one moment, immutable thereafter; captures judgement, not state. **(3) live-or-delta-refreshed** — read from current SQL truth on demand or invalidated on a known event. **(4) vector-retrievable memory** — embedded text searchable via pgvector similarity; layered ON TOP of bucket 1, not instead of it. Do NOT collapse buckets: a frozen snapshot is NOT a substitute for SQL truth at read time; vector retrieval is NOT a substitute for exact filters; live refresh is NOT a substitute for snapshotting judgement at handover.
      4. **Did I redesign a human / product concept into a backend-shaped concept? OR overstate alignment to a locked behavior?** Two related failure modes. **(a) Shape redesign:** e.g. "handoff package" → not "everything we know about this site"; "context loading" → not "fresh DB query on every chat message". **(b) Honesty-of-wording:** do not claim "exact spec match" if an open question's interim default is filling a field; do not write a new product behavior as if pre-locked when it requires owner sign-off. If wording overstates the alignment, the design has drifted even if the shape is correct.
      5. **What's the cost model my design implies?** If the design queries DB / runs AI per message and an alternative loads-once-and-invalidates exists, explain why the cheaper alternative was rejected. State which buckets are read per-event vs per-message vs per-session.
    - **Locked product behaviors (the running list — additions land here as owner decides them):**
      - **Base + Delta + Live context model (locked 2026-05-16, owner directive after F-004 round-2 review).** The supervisor chat context is composed in layers:
        - **Base context** is loaded ONCE at the first chat of the day for that supervisor. Contains: stable rules (company-permanent + HR-pod + site-specific the supervisor owns), portfolio snapshot, near-horizon summary. Cached for the day.
        - **Delta layer** is event-invalidated during the day. Triggers: new complaint logged, decision proposed/applied/dismissed, assignment created/changed, calendar entry added/edited, binding change affecting this supervisor's portfolio. Delta entries are appended; base is NOT re-queried unless the day rolls over.
        - **Live fetch** is on-demand for far-horizon queries ("plans next month?", "next 6 months?"). The chat tool path queries `CalendarEntry` + `Assignment` live; results are NOT cached into base or delta.
        - **Why it matters:** loading the full DB on every message is wrong for cost AND wrong for the product. The owner already designed this; future slices must restate this behavior at the top of their scope artifact before designing context loading.
      - **Postgres + pgvector + delta/live AI-memory architecture (locked 2026-05-16 late evening, owner directive after F-004 round-3 review — the 4-bucket model that Q3 above enforces).** Every piece of data the system touches lives in exactly one of 4 buckets (often labeled as a combination, never collapsed):
        - **Bucket 1 — exact SQL truth.** Relational tables queried point-in-time (Worker, Site, Assignment, Complaint, Binding, AuditEvent, LivingDocRule rows). Never stale. The source of operational truth.
        - **Bucket 2 — frozen SNAPSHOT.** JSON blob captured at one moment, immutable thereafter. Examples: `handoffPackage`, `originContext` on DWI. Captures JUDGEMENT, not state. Read-only after creation.
        - **Bucket 3 — live-or-delta-refreshed.** Read from current SQL truth on demand, or invalidated on a known event. Combines bucket-1 freshness with caching. Example: the supervisor's portfolio assignment list, today's decisions feed, current effective binding.
        - **Bucket 4 — vector-retrievable memory.** Embedded text searchable via pgvector similarity. For "relevant" rather than "exact". Layered ON TOP of bucket 1, not instead of it. Examples: LivingDoc rule text embedded for similarity search; HRUpdate body embedded for retrieval; complaint body text embedded for cross-site "has this happened before?" lookups; AI conversation history embedded for thread-scoped recall.
        - **Composition rules:**
          - Do NOT try to make one frozen handoff blob carry the whole system. handoffPackage is bucket-2 ONLY; it is a focused snapshot of judgement, not "everything we know about this site."
          - Do NOT treat vector retrieval as a replacement for exact SQL truth. "Who is the current responsible supervisor?" is bucket-1; not retrieval.
          - Do NOT skip the snapshot in favor of "just refresh live." Handover judgement must be captured at the moment it was made, not reconstructed from current state.
          - When a piece of data benefits from multiple buckets (e.g. LivingDoc rules are bucket-1 SQL truth AND bucket-4 vector-retrievable for similarity), label it explicitly as the combination.
        - **Why it matters:** the previous drift was treating handoffPackage as if it had to carry every read concern the future AI chat will need. Owner's clarification: it doesn't. The AI chat will pull bucket-1 SQL truth for exact filters, bucket-3 delta/live for freshness, bucket-4 vector retrieval for relevant memory, AND read the bucket-2 handoffPackage when it needs the outgoing person's judgement. The 4 buckets compose. Each slice should specify which buckets it produces and which it reads.
      - **HandoffPackage = focused snapshot of outgoing supervisor's JUDGEMENT (locked closure spec §3.7 + Decision 8).** It captures what the outgoing person decided about this site at this moment (rules, recent complaints, active workers, open items in next 14 days). It is NOT "everything we know about the site" — long-horizon planning queries stay LIVE via the chat tool path, and "relevant memory across sites" queries stay bucket-4 (vector retrieval). Truncation policy locked at spec §3.7 Invariants line 322 (100KB cap, drop oldest complaints first then activeWorkers field detail).
      - **4 rule layers (locked closure spec §3.7 + audit Ravi Month 9b).** Layer 1 company-permanent rules (HRUpdate / HRUpdateRule) stay LIVE-fetched (bucket-1 + 4), not in handoff. Layer 2 HR/pod rules stay LIVE-fetched (bucket-1 + 4), not in handoff. Layer 3 site-specific supervisor rules TRANSFER on permanent rebind (mechanism Z — copy to incoming LivingDoc.siteRules + summary in freeNotes); future bucket-4 embedding planned but not in F-004. Layer 4 personal supervisor working notes STAY with original supervisor.
    - **Concrete examples (F-004 saga, the rule's origin):**
      - **Round-1 shape drift:** sourced `siteRules` from `Site` metadata (name/address/state/workdays) instead of the outgoing supervisor's `LivingDoc.siteRules` — because "site rules" in plain English was re-shaped into "static site attributes" in backend thinking.
      - **Round-2 shape drift:** `recentComplaints` shape redesigned to `{id, text, severity, state, loggedAt}` instead of spec's `{id, kind, state, loggedAt, body}`; `siteId` smuggled into top-level payload despite not being in spec's listed 8 fields.
      - **Round-3 honesty drift (the new failure mode):** pick 1 + pick 3 overclaimed "exact spec match" / "no additions, no omissions" while Open Q5's `kind`-field interim default is still in play. Also Open Q2 smuggled a new first-ever-binding summary-entry text as if it were spec-locked behavior rather than a new product choice. Friend's principle: cannot claim alignment to a locked behavior while one mapping is still an interim default; cannot smuggle a new product behavior in as already-decided.
      - The base+delta+live model and the 4-bucket pgvector model are both owner pre-existing product decisions that kept getting re-debated when they should have been pinned at the top of the artifact as locked inputs.
    - **What this rule does NOT change:** rules 23 (confidence-score) + 24 (production-grade) + 25 (policy-first) + 26 (existing-pattern survey) all still apply. This rule is upstream of all four — it forces you to ground the design in the already-decided product behavior BEFORE reasoning about confidence, correctness, complexity, policy, or repo patterns.
    - **How to apply going forward:** every new scope artifact must include a "Pre-decided product behavior" section at the top (BEFORE the rule-26 existing-pattern survey) that answers the 5 questions above. If a question doesn't apply (e.g., no UI surface yet), state that explicitly with the reason.
    - **Portable copy of this rule:** also lives at `/Users/thotaakshay/.claude/portable-rules-akshay.md` for transit to other projects; the project canonical here governs in-session work.

## Session-start read order (mandatory)

When a new Claude session starts on Axhy v3 work:

1. `handoff/NEXT_SESSION.md`
2. `handoff/execution-state/INDEX.md`
3. `handoff/workflow-maps/INDEX.md`
4. **`handoff/owner-input/INDEX.md`** (this file)
5. **`handoff/owner-input/pending-notes.md`** — scan for NEW; if any, surface immediately.
6. **`handoff/owner-input/pending-approvals.md`** — confirm no AWAITING_APPROVAL blocking the intended slice.
7. **`handoff/feature-queue/INDEX.md`** — see what's next + dependencies.
8. The relevant persona files in `execution-state/` + `workflow-maps/`.
9. `combined.md` + `combined-system.md` if the slice spans personas.
10. (Optional) `generated/app-workflow-state.json` for machine context — but if it disagrees with markdown, **markdown wins** and generation must be re-run.

## Commit-time discipline

Whenever a slice changes state:

1. Update `active-slice.md` with the new status.
2. Update `pending-approvals.md` if the slice now needs approval.
3. Append to `change-history.md`.
4. Run `pnpm run handoff:build` to regenerate the HTML + JSON.
5. Commit canonical + generated together when possible (per failure-mode rule 13).

A pre-commit hook in `.husky/pre-commit` auto-regenerates the generated outputs when canonical files are staged.

## What this folder is NOT

- Not a place to debate workflow design. That lives in `docs/specs/`.
- Not a place to copy-paste from chat history. Notes should be actionable, dated.
- Not the only source of truth for build state. That's `execution-state/`. This folder is for owner intent + approvals + slice control.
