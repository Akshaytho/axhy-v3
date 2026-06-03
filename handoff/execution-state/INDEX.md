# Execution State — Index + Legend + Rules

> **This folder is one of three handoff layers. Read all three at session start.**
>
> | Layer                                | Folder / file              | What it answers                                                                                                                  |
> | ------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
> | **1. Execution state** (this folder) | `handoff/execution-state/` | What is built, partial, missing, verified, in flight. The build-state ledger.                                                    |
> | **2. Workflow architecture maps**    | `handoff/workflow-maps/`   | How the system is INTENDED to work end-to-end. Connected journey flowcharts + cross-persona sequences + the data model.          |
> | **3. Generated outputs** (read-only) | `handoff/generated/`       | `app-workflow-dashboard.html` (human view) + `app-workflow-state.json` (agent view). Derived from layers 1+2; never hand-edited. |
>
> **Why three layers.** Build state ≠ system understanding. Status tracking ≠ workflow architecture. The friend's 2026-05-15 evening review caught that layer 1 alone produces colored status heatmaps but not real workflow execution maps — both are required.
>
> **What this folder is.** The durable per-workflow build-state ledger. Every named workflow from `operations-workflow-model.md` §6 (29 workflows) appears in exactly one persona file, with its current Design verdict, Implementation state, and Verification state. Plus a Combined file for cross-persona handoffs and overlap stress.
>
> **What this folder is NOT.** It's not a spec (specs live in `docs/specs/`). It's not a plan (plans live in `docs/plans/`). It's not the audit set (audits live in `docs/audits/`). It's not the workflow architecture (that's `workflow-maps/`). This folder is **build state** — what is actually coded, what is half-coded, what is not coded, and what is being worked on right now.

## Files

| File                   | Purpose                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `INDEX.md` (this file) | Legend, enums, failure-mode rules, update cadence. Read first.                    |
| `supervisor-ravi.md`   | Workflows from the supervisor's perspective. Persona §O.3 Ravi.                   |
| `worker-suresh.md`     | Workflows from the worker's perspective. Persona §O.4 Suresh.                     |
| `hr-kavitha.md`        | Workflows from HR's perspective. Persona §O.2 Kavitha.                            |
| `owner-reddy.md`       | Workflows from the owner's perspective. Persona §O.1 Reddy.                       |
| `combined.md`          | Cross-persona handoffs + overlap stress + end-to-end coherence. **Not optional.** |

## Read order at start of any session

1. `handoff/NEXT_SESSION.md`
2. `handoff/execution-state/INDEX.md` (this file) — build-state legend + rules.
3. `handoff/workflow-maps/INDEX.md` — workflow-architecture conventions.
4. The matching persona file(s) in **both** folders for the workflow(s) the current slice touches.
5. `handoff/execution-state/combined.md` + `handoff/workflow-maps/combined-system.md` if the slice spans personas.
6. `handoff/workflow-maps/data-model.md` if the slice touches schema, audit kinds, notifications, or any cross-table flow.
7. (Optional) `handoff/generated/app-workflow-dashboard.html` for the single-pane view.

## Strict enums

Every workflow row has **three** separate state columns. Do not collapse them.

### Design verdict (from the audit set; per-workflow design judgement)

| Value       | Meaning                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `WORKS`     | The workflow design produces a good real-world outcome over a year of simulation.                          |
| `CONFUSING` | The workflow completes but the lived UX is unclear; persona reaches the goal slowly or by trial-and-error. |
| `STUCK`     | The workflow blocks; persona has no in-app path forward.                                                   |
| `BROKEN`    | The workflow design fails this case — produces a wrong outcome or violates an invariant.                   |
| `MISSING`   | The workflow design **does not cover** this real-life case. Design gap, not code gap.                      |
| `DRIFT`     | Implementation diverges from spec (used in cross-persona reconciliation).                                  |

These come from the 5-file audit set; this column is sourced FROM the audits, not invented here.

### Implementation state (build state, what code is in main / WIP)

| Value         | Meaning                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| `BUILT`       | End-to-end usable from this persona's surface today (route + UI + verified).          |
| `PARTIAL`     | Some parts exist (e.g., backend route exists but no UI; UI exists but route is stub). |
| `STUBBED`     | Placeholder exists; doesn't actually do anything yet.                                 |
| `NOT_STARTED` | Nothing exists.                                                                       |
| `WIP`         | Actively being built right now (paused or in-flight). Cite commit/branch.             |
| `BLOCKED`     | Cannot proceed without an external decision / dependency. State the blocker.          |

A workflow is `BUILT` from a persona's view only when that persona can complete it without backend gaps **and** without missing surfaces. If the backend route exists but the UI doesn't, that's `PARTIAL` from the persona's perspective.

### Verification state (the Verification discipline gate)

| Value          | Meaning                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `UNVERIFIED`   | No verification yet; code may compile but hasn't been exercised.          |
| `LOCAL`        | Doc-level checks pass (prisma format/validate/generate, typecheck, lint). |
| `REAL_DB`      | Real Postgres apply + smoke / integration test green.                     |
| `PROD_APPLIED` | Applied to Railway prod via supervised window.                            |

Higher states imply lower. A `BUILT` row should normally be `REAL_DB` or `PROD_APPLIED`; if it's `LOCAL` or `UNVERIFIED`, flag it.

## Required workflow-row columns (exact, in this order)

1. **Workflow ID** — e.g., `A1`, `F26`, matching `operations-workflow-model.md` §6.
2. **Workflow name** — short name.
3. **Persona** — the persona this row models. (Same workflow appears in multiple persona files when more than one persona experiences it; each persona file holds its own row, NOT a duplicated copy.)
4. **Design verdict** — one of the 6 enum values above.
5. **Implementation state** — one of the 6 enum values above.
6. **Verification state** — one of the 4 enum values above.
7. **What works now** — bullet list of concretely-built capabilities. Each bullet must cite a commit hash, file path, or test path.
8. **What does not work yet** — bullet list of named gaps. Be specific (column missing, route missing, UI missing).
9. **Files / tests / commit refs** — anchors. Click-through targets.
10. **Current owner / current slice** — who is touching this workflow now, or "none" if dormant.
11. **Next required step** — the very next action that moves this row's Implementation state forward.

## Required persona-file structure (every persona file)

1. **Persona scope note** (1 paragraph). Who the persona is (link to master plan §O), their daily phone/language/role, the slice of workflows they own.
2. **Mermaid overview graph** — one diagram showing all of this persona's workflows + their current Implementation state via colour or annotation. Stays at the persona level; does NOT explode into per-workflow diagrams. (See Q2 friend ruling.)
3. **Workflow table** — every workflow this persona experiences, using the 11-column schema above.
4. **Current active slice affecting this persona** — name + branch + commit + which workflow rows it touches.
5. **Known risks / drift watchouts** — things that could go wrong if we don't watch them next session.
6. **Recent commits touching this persona** — last 5–10 commits, with one-line summary.

## Required structure for `combined.md`

1. **Combined workflow summary table** — every workflow, with the cross-persona Implementation/Verification roll-up: BACKEND_READY / SURFACES_READY / END_TO_END / BLOCKED_BY_X.
2. **Cross-persona Mermaid sequence diagrams** — at minimum, the F26 (acting cover) and F27 (permanent reassignment) end-to-end handoffs. Others added when needed.
3. **Overlap-risk section** — what happens when two workflows fire simultaneously for the same site / supervisor / worker.
4. **Current end-to-end gaps** — explicit list: workflows that are coherent backend-only vs surface-only vs neither.
5. **Blocked-by analysis** — for each workflow not `END_TO_END`: blocked by missing backend, missing surface, missing policy, or missing decision.

**Combined is not optional.** It exists specifically to answer: do Supervisor / Worker / HR / Owner line up together?

## Failure-mode rules (non-negotiable — friend 2026-05-15 evening review)

These rules apply across all three handoff layers (execution-state + workflow-maps + generated). They exist because the friend's reviews have repeatedly caught drift; they prevent it from coming back.

### Core anti-drift rules (rules 1–5)

1. **No code outside the tracker.** If you (Claude or human) are about to write code for a workflow that isn't represented in `execution-state/` and `workflow-maps/`, **stop**. Update both first. Adding a row + a journey step is cheap; tracking-after-the-fact is where drift starts.
2. **Slice-truth and tracker-truth must agree at commit time.** If a slice changes any cell in any workflow row (Implementation state shift, new file path, new commit hash, Verification status change), update the tracker in the same local work session **before** marking the slice done. If the slice changes how a workflow actually flows (new step, new branch, new handoff), update `workflow-maps/` too.
3. **Pause discipline.** If work is paused mid-slice (interrupted, blocked, waiting for review), mark the row's Implementation state as `WIP` or `BLOCKED` with the exact files/commit/stash reference. No anonymous working-tree state.
4. **Mandatory read at session start.** Any new Claude session must read `handoff/NEXT_SESSION.md`, this `INDEX.md`, `workflow-maps/INDEX.md`, the relevant persona file(s) in both folders, plus `combined.md` / `combined-system.md` — **before** continuing any work.
5. **Reconcile on disagreement.** If `NEXT_SESSION.md`, execution-state, workflow-maps, or generated outputs disagree about any workflow's state, **stop**. Reconcile before any coding resumes. Precedence: canonical markdown (execution-state + workflow-maps) > generated outputs. `NEXT_SESSION.md` is a session summary, not workflow-level truth; it must align anywhere it references a workflow.

### Generated-artifact discipline (rules 6–14 — friend 2026-05-15)

6. **Canonical source edits first.** Any workflow/design/build-state change MUST be recorded first in the canonical source files (`execution-state/` and/or `workflow-maps/`). Never edit `generated/app-workflow-dashboard.html` or `generated/app-workflow-state.json` directly. They are read-only outputs.
7. **Regenerate on every truth change.** If `execution-state/` or `workflow-maps/` is changed, regenerate the two outputs in `generated/` in the **same work session** — not "later", not "next slice".
8. **Three-trigger update cadence (mandatory).** Per slice, update + regenerate at exactly three moments:
   - **Before** the first code edit of a new slice.
   - **At** pause / block.
   - **After** verification / commit of the slice.
9. **"Done" definition.** A slice is not done unless ALL of these are updated: (a) execution-state rows, (b) workflow-maps if flow truth changed, (c) regenerated `app-workflow-dashboard.html`, (d) regenerated `app-workflow-state.json`, (e) verification state moved appropriately, (f) current-slice marker moved forward.
10. **WIP visibility.** Mid-flight work must be visible in the generated outputs: `WIP` / `BLOCKED` badge + last-updated timestamp + current branch + current commit + next required action.
11. **Generated artifacts are derivations only.** Never hand-maintain HTML or JSON. Always regenerate via `pnpm run build:handoff` (or equivalent script). If the script doesn't run cleanly, fix the canonical source first — never patch the output.
12. **Session-start rule for the JSON.** New sessions MAY consume `generated/app-workflow-state.json` for machine context. But if JSON and the canonical markdown disagree, the markdown wins and the JSON must be regenerated immediately.
13. **Commit-time rule.** If a commit changes any canonical workflow truth and the tracker/generated outputs are not updated in the same commit (or the immediately preceding commit), the slice is incomplete. Stop and update before surfacing the work.
14. **Finalization transitions are everywhere.** When a workflow moves from `PARTIAL` → `BUILT`, `BLOCKED` → `WIP`, `UNVERIFIED` → `REAL_DB`, etc., that transition must appear in: execution-state row, workflow-maps step state (if relevant), generated HTML, generated JSON.
15. **Drift detection.** If you (Claude) notice code/files/tests no longer match the tracker or generated artifacts, **stop coding** and reconcile first. Adding the discrepancy to the tracker without fixing it is also acceptable as long as it's surfaced.

### Required metadata in generated outputs

Both `app-workflow-dashboard.html` and `app-workflow-state.json` must carry:

- `last_updated_at` — ISO 8601 UTC.
- `source_commit` — the git commit hash that produced this generation.
- `source_branch` — current branch.
- `active_slice` — name of the slice currently in flight (or "none").
- `verification_level` — highest verification state reached this session.
- `generated_from` — list of canonical source files used.
- `staleness_warning` — non-empty if the generation is older than the most recent commit touching `execution-state/` or `workflow-maps/`.

This way anyone opening the HTML / JSON can tell at a glance whether it's fresh truth or stale output.

## Update cadence (strict but practical)

Trigger an execution-state update at exactly these three moments per slice:

1. **Before the first code edit of a new slice.** Add or refresh the affected rows (Implementation state may transition to `WIP`); cite the planned branch + commit shape.
2. **At pause or block.** Mark `WIP` or `BLOCKED` with the exact pause anchor (commit hash, file paths, reason).
3. **After verification / commit of the slice.** Move rows forward (e.g., `WIP` → `PARTIAL` or `BUILT`; `UNVERIFIED` → `LOCAL` → `REAL_DB`).

That's three updates per slice, not three updates per file edit. Don't over-update.

## Cross-references back into handoff

- `handoff/NEXT_SESSION.md` mentions the active slice + the workflow IDs it touches.

## What this folder will not do

- Will not duplicate the 5 audit drafts (those are `[WORKS]`/`[CONFUSING]`/etc. design judgments at design-time; this folder is build-state at implementation-time).
- Will not host design debate; that's the audit + closure + responsibility-model corpus.
- Will not promote anything to `Active` in `canonical-truth.md`; that's the promotion checklist.
- Will not contain per-workflow Mermaid diagrams for all 29 workflows up front. Those grow organically only for genuinely complex flows.

---

**Created:** 2026-05-15 (friend-approved durable control surface).
**Maintained by:** every session, per the failure-mode rules.
