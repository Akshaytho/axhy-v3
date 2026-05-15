# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner (friend's 2026-05-15 evening reconciliation).

## Current

| Field                                   | Value                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                          | `handoff-control-loop`                                                                                                                                                                                                                                                                                                      |
| **Status**                              | `AWAITING_APPROVAL`                                                                                                                                                                                                                                                                                                         |
| **Branch**                              | `feat/layer-1-core-primitives`                                                                                                                                                                                                                                                                                              |
| **Last landed slice commit**            | `7916a3b` — `fix(handoff): address friend's 4 verification findings on the control loop`                                                                                                                                                                                                                                    |
| **All slice commits (oldest → newest)** | `f9fbe68` · `0445110` · `7916a3b` · (a fourth verification-fix commit may land after this edit, addressing friend's 3 remaining trust issues)                                                                                                                                                                               |
| **Workflow IDs affected**               | none directly (meta-slice — builds the control surface around all 29 workflows)                                                                                                                                                                                                                                             |
| **Personas affected**                   | all four (control surface is persona-spanning)                                                                                                                                                                                                                                                                              |
| **Files changed**                       | `handoff/owner-input/*` (new), `handoff/feature-queue/*` (new), `handoff/scripts/build-handoff-artifacts.mjs` (extended), `handoff/execution-state/INDEX.md`, `handoff/README.md`, `handoff/NEXT_SESSION.md`, `.husky/pre-commit`                                                                                           |
| **Tests status**                        | N/A (docs + tooling only)                                                                                                                                                                                                                                                                                                   |
| **Verification status**                 | `LOCAL` — generator runs clean; 0 STALE markers; friend's first 4 bugs fixed (template-as-note, header-vs-callout, stale active-slice, generated_from list); friend's 3 follow-up bugs being addressed (commit-truth drift framed honestly, hash-naming pinned to landed commits, AWAITING_APPROVAL/BLOCKED sections split) |
| **Started at**                          | 2026-05-15 evening                                                                                                                                                                                                                                                                                                          |
| **Expected next state**                 | `APPROVED` — when owner writes that word for the `handoff-control-loop` item in `pending-approvals.md`. Then F-001 routing slice unblocks.                                                                                                                                                                                  |

## Hash-truth convention (per friend's 2026-05-15 evening verification)

The "All slice commits" row above names ONLY landed commit hashes. We do not embed "landing now" placeholders inside the file content, because:

- Under the auto-regen pre-commit hook, the new commit's hash is created AFTER the file is written and staged. So at write-time we don't know the hash that will contain this file.
- Naming "the commit landing now" inside the file body is dishonest — it asserts a hash that won't exist until git finishes the commit.
- Convention: list only commits already in `git log`. After a commit lands, the NEXT edit to this file names that commit explicitly.

This means the file in commit N references commits 1..(N-1), and lags by exactly 1 hash relative to the commit containing it. This is the same drift the dashboard's `generated_against_head` metadata field documents.

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

## State transitions (this slice)

1. 2026-05-15 evening — `PLANNED → WIP` after Akshay's "take it one level further" directive.
2. 2026-05-15 evening — `WIP` commit `f9fbe68` landed (control-loop body).
3. 2026-05-15 evening — `WIP` commit `0445110` landed (stale-detection fix).
4. 2026-05-15 evening — Friend's first verification flagged 4 bugs.
5. 2026-05-15 evening — `WIP` commit `7916a3b` landed (first 4 bugs fixed).
6. 2026-05-15 evening — Friend's second verification flagged 3 more bugs (commit-truth drift, hash-naming, approvals/blocked split).
7. 2026-05-15 evening — `WIP → AWAITING_APPROVAL` after the 3-bug fix commit lands.

(Same numbered list maintained in `change-history.md`.)

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- Header active-slice banner + Current Slice focus callout both read from here (single source).
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
