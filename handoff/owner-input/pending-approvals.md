# Pending Approvals + Blocked Items

> Two distinct concepts, separated per friend's 2026-05-15 evening verification:
>
> - **Awaiting approval** — code-complete + verified slice; owner has not yet said the approval word.
> - **Blocked** — slice cannot proceed because of an external dependency (not because it's awaiting approval).
>
> Rule 17: No new slice starts while anything is `AWAITING_APPROVAL`.

## Approval-word convention (for the AWAITING_APPROVAL section below)

- `APPROVED` → slice moves to `APPROVED`; next slice can start.
- `CHANGES_REQUESTED` + a bullet list → slice stays `AWAITING_APPROVAL`; Claude addresses the list.
- `HOLD` → slice pauses; no next slice until lifted.
- (empty) → default `AWAITING_APPROVAL`; next slice does NOT start.

---

## Currently awaiting approval

### Slice: `handoff-control-loop`

- **Status:** `AWAITING_APPROVAL`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `7916a3b` (plus the verification-fix commit landing next)
- **Workflow IDs affected:** none directly (control surface, spans all 29)
- **What was built:** `handoff/owner-input/` (6 files) + `handoff/feature-queue/INDEX.md` + generator parses + renders 5 new HTML sections (Current Slice / Notes / Approvals / Blocked / Queue / History) + pre-commit auto-regen + filesystem-mtime stale detection + friend's first-pass 4 bugs fixed (template-as-note / header-vs-callout / stale active-slice / generated_from) + friend's second-pass 3 bugs fixed (commit-truth honest framing / hash-naming pinned to landed commits / AWAITING_APPROVAL+BLOCKED split).
- **What's NOT done:** Nothing in scope; both friend bug lists fully addressed.
- **Owner decision:** _empty — write `APPROVED` / `CHANGES_REQUESTED` / `HOLD`_

---

## Currently blocked (NOT awaiting approval — blocked by external dependency)

### Slice: `routing-foundation-read-apis`

- **Status:** `BLOCKED`
- **Branch:** `feat/layer-1-core-primitives`
- **WIP commit:** `84ae39c wip(routing): foundation read APIs — paused mid-slice for execution-state tracker`
- **Workflow IDs affected:** `D17`, `F26` (read side), `F27` (read side)
- **What's blocking:** `handoff-control-loop` slice not yet APPROVED. When that slice is approved + the routing block is removed, this slice resumes from WIP commit `84ae39c`.
- **What was built:** `getEffectiveBinding` + `deriveWorkerPrimarySiteId` + `GET /sites/:id/effective-supervisor` + `GET /decisions/proposed-for-me` + 3 of 4 test files. Doc-level checks green; real-DB sweep not yet run.
- **Remaining to finish slice:** 4th test file `effective-responsibility-point-in-time.test.ts`; real-DB sweep; split WIP commit into 3 clean commits.
- **Owner decision:** N/A (blocked, not awaiting approval). Decision belongs on `handoff-control-loop` first.

---

## Recently approved (last 5)

_None yet. Items move here after the owner writes `APPROVED`._

---

## Recently rejected / change-requested

_None._
