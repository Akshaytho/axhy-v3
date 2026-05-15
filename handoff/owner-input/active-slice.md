# Active Slice

> Exactly one slice in flight at any time. This file mirrors what should appear at the top of the HTML dashboard.

## Current

| Field                     | Value                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**            | `handoff-control-loop`                                                                                                                                                                                                            |
| **Status**                | `WIP`                                                                                                                                                                                                                             |
| **Branch**                | `feat/layer-1-core-primitives`                                                                                                                                                                                                    |
| **Latest commit**         | (pending — this slice not yet committed)                                                                                                                                                                                          |
| **Workflow IDs affected** | none directly (meta-slice — builds the control surface around all 29 workflows)                                                                                                                                                   |
| **Personas affected**     | all four (control surface is persona-spanning)                                                                                                                                                                                    |
| **Files being changed**   | `handoff/owner-input/*` (new), `handoff/feature-queue/*` (new), `handoff/scripts/build-handoff-artifacts.mjs` (extended), `handoff/execution-state/INDEX.md`, `handoff/README.md`, `handoff/NEXT_SESSION.md`, `.husky/pre-commit` |
| **Tests status**          | N/A (docs + tooling only)                                                                                                                                                                                                         |
| **Verification status**   | `LOCAL` (generator runs; outputs valid)                                                                                                                                                                                           |
| **Started at**            | 2026-05-15 evening                                                                                                                                                                                                                |
| **Expected next state**   | `AWAITING_APPROVAL` after surface                                                                                                                                                                                                 |

## What this slice does

Adds layer 4 (control loop) to the handoff system:

- `handoff/owner-input/` — owner notes + approvals + decisions log + active slice + change history
- `handoff/feature-queue/` — upcoming slice queue with dependencies + scope per item
- Generator extended to parse + render owner-input + feature-queue + active-slice in HTML
- Pre-commit hook auto-regenerates generated outputs when canonical files are staged
- Updated read-order discipline (rule 16–22)

## Last 5 state transitions (this slice)

1. 2026-05-15 — Created as `PLANNED` after Akshay's "take it one level further" directive.
2. 2026-05-15 — Moved to `WIP` as work began.

(Transitions get appended to `change-history.md` when they happen.)

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
