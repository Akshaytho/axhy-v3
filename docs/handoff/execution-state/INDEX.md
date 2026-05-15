# Execution State — Index + Legend + Rules

> **What this folder is.** The durable per-workflow truth surface for Axhy v3.
> Every named workflow from `operations-workflow-model.md` §6 (29 workflows)
> appears in exactly one persona file, with its current Design verdict,
> Implementation state, and Verification state. Plus a Combined file for
> cross-persona handoffs and overlap stress.
>
> **What this folder is NOT.** It's not a spec. Specs live in `docs/specs/`.
> It's not a plan. Plans live in `docs/plans/`. It's not the audit set. Audits
> live in `docs/audits/`. This folder is **build state** — what is actually
> coded, what is half-coded, what is not coded, and what is being worked on
> right now.

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

1. `docs/handoff/README.md`
2. `docs/handoff/NEXT_SESSION.md`
3. `docs/handoff/execution-state/INDEX.md` (this file)
4. The persona file(s) for the workflow(s) the current slice touches.
5. `docs/handoff/execution-state/combined.md` if the slice spans personas.

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

## Failure-mode rules (non-negotiable)

These are baked in to prevent the kind of drift the friend's reviews have been catching.

1. **No code outside the tracker.** If you (Claude or human) are about to write code for a workflow that isn't represented in `execution-state/`, **stop**. Update the tracker first. Adding a row to the tracker is cheap; tracking-after-the-fact is where drift starts.
2. **Slice-truth-and-tracker-truth must agree at commit time.** If a slice changes any cell in any workflow row (Implementation state shift, new file path, new commit hash, Verification status change), update the tracker in the same local work session **before** marking the slice done.
3. **Pause discipline.** If work is paused mid-slice (interrupted, blocked, waiting for review), mark the row's Implementation state as `WIP` or `BLOCKED` with the exact files/commit/stash reference. No anonymous working-tree state.
4. **Mandatory read at session start.** Any new Claude session must read `handoff/README.md`, `handoff/NEXT_SESSION.md`, this `INDEX.md`, the relevant persona file(s), and `combined.md` **before** continuing any work. Cited explicitly in `handoff/README.md` and `NEXT_SESSION.md`.
5. **Reconcile on disagreement.** If `STATUS.md` / `NEXT_SESSION.md` and the execution-state tracker disagree about any workflow's state, **stop**. Resolve the precedence before any coding resumes. The tracker is the workflow-level truth; STATUS / NEXT_SESSION are the phase-level summary. They must align at the rows they both reference.

## Update cadence (strict but practical)

Trigger an execution-state update at exactly these three moments per slice:

1. **Before the first code edit of a new slice.** Add or refresh the affected rows (Implementation state may transition to `WIP`); cite the planned branch + commit shape.
2. **At pause or block.** Mark `WIP` or `BLOCKED` with the exact pause anchor (commit hash, file paths, reason).
3. **After verification / commit of the slice.** Move rows forward (e.g., `WIP` → `PARTIAL` or `BUILT`; `UNVERIFIED` → `LOCAL` → `REAL_DB`).

That's three updates per slice, not three updates per file edit. Don't over-update.

## Cross-references back into handoff

- `handoff/README.md` points readers here at session start.
- `handoff/NEXT_SESSION.md` mentions the active slice + the workflow IDs it touches.
- `handoff/STATUS.md` cites this folder as the workflow-truth surface.

## What this folder will not do

- Will not duplicate the 5 audit drafts (those are `[WORKS]`/`[CONFUSING]`/etc. design judgments at design-time; this folder is build-state at implementation-time).
- Will not host design debate; that's the audit + closure + responsibility-model corpus.
- Will not promote anything to `Active` in `canonical-truth.md`; that's the promotion checklist.
- Will not contain per-workflow Mermaid diagrams for all 29 workflows up front. Those grow organically only for genuinely complex flows.

---

**Created:** 2026-05-15 (friend-approved durable control surface).
**Maintained by:** every session, per the failure-mode rules.
