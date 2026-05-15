# Active Slice

> Exactly one slice in flight at any time. This file mirrors what should appear at the top of the HTML dashboard. The HTML "Current slice focus" callout AND the page-header active-slice banner both read from this file (single source of truth — friend's 2026-05-15 evening reconciliation).

## Current

| Field                     | Value                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**            | `handoff-control-loop`                                                                                                                                                                                                            |
| **Status**                | `AWAITING_APPROVAL`                                                                                                                                                                                                               |
| **Branch**                | `feat/layer-1-core-primitives`                                                                                                                                                                                                    |
| **Latest commit**         | `0445110` `fix(handoff): stale-detection uses file mtimes — survives pre-commit timing`                                                                                                                                           |
| **Slice commits**         | `f9fbe68` (control loop) + `0445110` (stale-fix) + the verification-fix commit landing now                                                                                                                                        |
| **Workflow IDs affected** | none directly (meta-slice — builds the control surface around all 29 workflows)                                                                                                                                                   |
| **Personas affected**     | all four (control surface is persona-spanning)                                                                                                                                                                                    |
| **Files changed**         | `handoff/owner-input/*` (new), `handoff/feature-queue/*` (new), `handoff/scripts/build-handoff-artifacts.mjs` (extended), `handoff/execution-state/INDEX.md`, `handoff/README.md`, `handoff/NEXT_SESSION.md`, `.husky/pre-commit` |
| **Tests status**          | N/A (docs + tooling only)                                                                                                                                                                                                         |
| **Verification status**   | `LOCAL` — generator runs clean; outputs valid; 0 STALE markers; friend's 4 verification-pass bugs all fixed (template-as-note, header-vs-callout disagreement, stale active-slice content, incomplete generated_from metadata)    |
| **Started at**            | 2026-05-15 evening                                                                                                                                                                                                                |
| **Expected next state**   | `APPROVED` — when owner writes that word for the `handoff-control-loop` item in `pending-approvals.md`. Then F-001 routing slice unblocks.                                                                                        |

## What this slice does

Adds layer 4 (control loop) to the handoff system:

- `handoff/owner-input/` — owner notes + approvals + decisions log + active slice + change history
- `handoff/feature-queue/` — upcoming slice queue with dependencies + scope per item
- Generator extended to parse + render owner-input + feature-queue + active-slice in HTML
- Pre-commit hook auto-regenerates generated outputs when canonical files are staged
- Updated read-order discipline (rules 16–22)
- Stale-detection switched to filesystem mtimes (survives pre-commit timing)
- Single canonical source for active-slice display in both header banner and the callout box

## Last 5 state transitions (this slice)

1. 2026-05-15 evening — `PLANNED → WIP` (Akshay's "take it one level further" directive).
2. 2026-05-15 evening — `WIP` commit `f9fbe68` landed (the control-loop body).
3. 2026-05-15 evening — `WIP` commit `0445110` landed (stale-detection fix).
4. 2026-05-15 evening — Friend's verification flagged 4 bugs (template parsing, header disagreement, stale active-slice content, generated_from metadata).
5. 2026-05-15 evening — `WIP → AWAITING_APPROVAL` after this verification-fix commit lands.

(Transitions get appended to `change-history.md` when they happen.)

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- The dashboard's header active-slice banner ALSO reads from here (so both displays show the same truth).
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
