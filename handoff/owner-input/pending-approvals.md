# Pending Approvals + Blocked Items

> Two distinct concepts, separated per friend's 2026-05-15 evening verification:
>
> - **Awaiting approval** — code-complete + verified slice; owner has not yet said the approval word.
> - **Blocked** — slice cannot proceed because of an external dependency (not because it's awaiting approval).
>
> Rule 17: No new slice starts while anything is `AWAITING_APPROVAL`.
>
> **Hash convention:** only landed commit hashes appear in this file. No "landing now" / "next commit" / "may land" speculation. Per the convention in `active-slice.md`, the file in commit N references commits 1..(N-1).

## Approval-word convention (for the AWAITING_APPROVAL section below)

- `APPROVED` → slice moves to `APPROVED`; next slice can start.
- `CHANGES_REQUESTED` + a bullet list → slice stays `AWAITING_APPROVAL`; Claude addresses the list.
- `HOLD` → slice pauses; no next slice until lifted.
- (empty) → default `AWAITING_APPROVAL`; next slice does NOT start.

---

## Currently awaiting approval

### Scope approval: `F-002` — Chat extractor writes PROPOSED SupervisorDecision rows

- **Type:** Scope artifact (NOT a code slice yet). No code commits to review.
- **Artifact:** `handoff/feature-queue/scopes/F-002.md`
- **Why surfacing first:** Per rule 23 (confidence-score-before-acting) + friend's 2026-05-15 evening directive on approving F-001 ("surface the next planned slice before writing code"). Five sub-decisions in §7 of the scope doc are below the ≥90% own-confidence threshold; friend's pick on each is wanted before any code lands.
- **Open questions (default picks proposed if friend doesn't choose):**
  - Q1. `originContext` JSON shape — default (b) best-effort capture, refine later.
  - Q2. Single slice vs split into 2 — default (a) single slice covering PROPOSED + apply + dismiss.
  - Q3. Dismiss in this slice — default (a) include.
  - Q4. State ENUM column — default (b) defer.
  - Q5. `proposedDuringAbsence` detection — default approach (reuse F-001 helpers).
- **Decision needed:** `APPROVED` (with optional Q1–Q5 overrides) / `CHANGES_REQUESTED` / `HOLD`. F-002 implementation starts only after this lands.

---

## Currently blocked (NOT awaiting approval — blocked by external dependency)

_None._

---

## Recently approved (last 5)

### Slice: `routing-foundation-read-apis` (F-001) — APPROVED 2026-05-15 evening

- **Status:** `APPROVED`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `aa363f0` — `docs(handoff): routing slice F-001 → AWAITING_APPROVAL (23/23 green)`
- **Slice commits (oldest → newest):** `84ae39c` · `429886d` · `7e07a24` (plus tracker propagation `aa363f0` outside the slice's code surface)
- **Workflow IDs affected:** D17 (read side), F26 (read side), F27 (read side)
- **Approval received:** Friend's file-grounded verification pass at HEAD `aa363f0`. Verbatim: "no blocking findings · handoff/control state is consistent · routing code and 4th test file are real · DB container/migration state is real · accept the WIP-split deviation and approve the slice".
- **Friend's directive on approval:** mark APPROVED → move active slice forward in canonical files → regenerate outputs → surface the next planned slice (F-002) before writing code.
- **Friend's residual note:** could not personally rerun the 4-file Vitest sweep in their verification shell because pnpm wasn't on PATH and the local Rollup native-module path hit a code-signing issue. Acknowledged as a verification-shell tooling limitation, not a slice bug. Approval not gated on it.
- **WIP-split deviation:** ACCEPTED. Friend's verbatim: "Given the control-loop/history machinery already cites these hashes, additive completion on top is the cleaner choice unless there is a strong review reason to rewrite."

### Slice: `handoff-control-loop` — APPROVED 2026-05-15 evening

- **Status:** `APPROVED`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `03a1c22` — `docs(handoff): rule 23 — confidence-score-before-acting (Akshay directive)`
- **Slice commits (oldest → newest):** `f9fbe68` · `0445110` · `7916a3b` · `b35748e` · `eefaf11` · `091c2a6` · `03a1c22`
- **Workflow IDs affected:** none directly (control surface, spans all 29)
- **Approval received:** Friend's 5th file-grounded verification pass declared the control loop lock-ready at HEAD `091c2a6`. Verbatim: "the control-loop slice is now trustworthy enough to lock."
- **Friend's directive on approval:** mark APPROVED → unblock F-001 → resume from WIP `84ae39c` → finish 4th routing test → run real-DB sweep → split WIP into clean commits → stop for review.

---

## Recently rejected / change-requested

_None._
