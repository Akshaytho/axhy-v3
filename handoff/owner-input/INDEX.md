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
