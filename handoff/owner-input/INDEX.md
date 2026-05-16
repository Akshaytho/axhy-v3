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

## Session-start read order (mandatory)

When a new Claude session starts on Axhy v3 work:

1. `handoff/README.md`
2. `handoff/NEXT_SESSION.md`
3. `handoff/execution-state/INDEX.md`
4. `handoff/workflow-maps/INDEX.md`
5. **`handoff/owner-input/INDEX.md`** (this file)
6. **`handoff/owner-input/pending-notes.md`** — scan for NEW; if any, surface immediately.
7. **`handoff/owner-input/pending-approvals.md`** — confirm no AWAITING_APPROVAL blocking the intended slice.
8. **`handoff/feature-queue/INDEX.md`** — see what's next + dependencies.
9. The relevant persona files in `execution-state/` + `workflow-maps/`.
10. `combined.md` + `combined-system.md` if the slice spans personas.
11. (Optional) `generated/app-workflow-state.json` for machine context — but if it disagrees with markdown, **markdown wins** and generation must be re-run.

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
