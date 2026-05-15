# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner (friend's 2026-05-15 evening reconciliation).

## Current

| Field                                   | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                          | `handoff-control-loop`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Status**                              | `AWAITING_APPROVAL`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Branch**                              | `feat/layer-1-core-primitives`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Last landed slice commit**            | `eefaf11` — `fix(handoff): purge future-placeholder wording + populate change-history`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **All slice commits (oldest → newest)** | `f9fbe68` · `0445110` · `7916a3b` · `b35748e` · `eefaf11`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Workflow IDs affected**               | none directly (meta-slice — builds the control surface around all 29 workflows)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Personas affected**                   | all four (control surface is persona-spanning)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Files changed**                       | `handoff/owner-input/*` (new), `handoff/feature-queue/*` (new), `handoff/scripts/build-handoff-artifacts.mjs` (extended), `handoff/execution-state/INDEX.md`, `handoff/README.md`, `handoff/NEXT_SESSION.md`, `.husky/pre-commit`                                                                                                                                                                                                                                                                                |
| **Tests status**                        | N/A (docs + tooling only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Verification status**                 | `LOCAL` — generator runs clean; 0 STALE markers; friend's first 4 bugs fixed in `7916a3b` (template-as-note, header-vs-callout, stale active-slice, generated_from list); friend's 3 follow-up bugs fixed in `b35748e` (commit-truth drift framed honestly, hash-naming pinned to landed commits, AWAITING_APPROVAL/BLOCKED sections split). Friend's third-pass 3 trust issues fixed in `eefaf11` (future-placeholder wording purged from active-slice, pending-approvals refreshed, change-history populated). |
| **Started at**                          | 2026-05-15 evening                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Expected next state**                 | `APPROVED` — when owner writes that word for the `handoff-control-loop` item in `pending-approvals.md`. Then F-001 routing slice unblocks.                                                                                                                                                                                                                                                                                                                                                                       |

## Hash-truth convention (per friend's 2026-05-15 evening verification)

The "All slice commits" row above names ONLY landed commit hashes — never speculation about commits that haven't finished. Under the auto-regen pre-commit hook the new commit's hash is created AFTER the file is written and staged, so at write-time we cannot know the hash that will contain this file. Convention:

- List only commits already in `git log`.
- After a commit lands, the NEXT edit to this file names that commit explicitly.
- No "landing now", no "may land after this edit", no "next commit will be" wording.

This means the file in commit N references commits 1..(N-1), and lags by exactly 1 hash relative to the commit containing it. Same drift the dashboard's `generated_against_head` metadata field documents.

## What this slice does

Adds layer 4 (control loop) to the handoff system:

- `handoff/owner-input/` — owner notes + approvals + decisions log + active slice + change history
- `handoff/feature-queue/` — upcoming slice queue with dependencies + scope per item
- Generator extended to parse + render owner-input + feature-queue + active-slice in HTML
- Pre-commit hook auto-regenerates generated outputs when canonical files are staged
- Updated read-order discipline (rules 16–22)
- Stale-detection compares canonical mtimes against generator-start time (survives pre-commit timing)
- Single canonical source for active-slice display in both header banner and the callout box
- `pending-approvals.md` split into AWAITING_APPROVAL and BLOCKED sections (separate concepts; rendered as separate dashboard sections)
- `generated_against_head` field renamed (was `source_commit`) with explicit drift documentation
- Hash-truth convention locked: no future-placeholder wording anywhere in canonical files

## State transitions (this slice — only landed)

1. `PLANNED → WIP` after Akshay's "take it one level further" directive (2026-05-15 evening).
2. `WIP` commit `f9fbe68` landed — control-loop body (`docs(handoff): control loop — layer 4`).
3. `WIP` commit `0445110` landed — stale-detection fix (`fix(handoff): stale-detection uses file mtimes`).
4. Friend's first verification flagged 4 bugs.
5. `WIP` commit `7916a3b` landed — first 4 bugs fixed (`fix(handoff): address friend's 4 verification findings`).
6. Friend's second verification flagged 3 more bugs (commit-truth, hash-naming, approval/blocked split).
7. `WIP` commit `b35748e` landed — those 3 bugs fixed (`fix(handoff): address friend's 3 remaining trust issues`).
8. Friend's third verification flagged 3 final trust issues (future-placeholder wording, stale pending-approvals, stale change-history).

(Same numbered list maintained in `change-history.md`.)

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- Header active-slice banner + Current Slice focus callout both read from here (single source).
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
