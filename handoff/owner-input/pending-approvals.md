# Pending Approvals

> Slices that are code-complete + verified but have not yet been APPROVED by the owner.
>
> Rule 17: No new slice starts while a prior slice is `AWAITING_APPROVAL`.

## Approval-word convention (from `INDEX.md`)

- Owner writes `APPROVED` → Claude moves slice to `APPROVED` state + may begin next slice.
- Owner writes `CHANGES_REQUESTED` + a list → Slice stays `AWAITING_APPROVAL`; Claude addresses the list.
- Owner writes `HOLD` → Slice pauses indefinitely; no next slice.
- Empty → Default `AWAITING_APPROVAL`. Next slice does not start.

---

## Currently awaiting approval

### Slice: `routing-foundation-read-apis` (paused mid-flight)

- **Status:** `BLOCKED` (blocked by the control-loop slice currently being built)
- **Branch:** `feat/layer-1-core-primitives`
- **WIP commit:** `84ae39c wip(routing): foundation read APIs — paused mid-slice for execution-state tracker`
- **Workflow IDs affected:** `D17`, `F26` (read side), `F27` (read side)
- **What was built:** `getEffectiveBinding` + `deriveWorkerPrimarySiteId` + `GET /sites/:id/effective-supervisor` + `GET /decisions/proposed-for-me` + 3 of 4 test files. Doc-level checks green; real-DB sweep not yet run.
- **What's NOT done:** 4th test file `effective-responsibility-point-in-time.test.ts`; real-DB sweep; split into 3 clean commits.
- **Owner decision:** _empty — needs explicit APPROVED / CHANGES_REQUESTED / HOLD once control-loop ships_

### Slice: `handoff-control-loop` (in flight — this slice)

- **Status:** `WIP`
- **Branch:** `feat/layer-1-core-primitives`
- **Affects:** all 4 personas indirectly; primarily the control surface.
- **What's being built:** `handoff/owner-input/` + `handoff/feature-queue/` + extended generator + pre-commit auto-regen + updated handoff wiring.
- **Owner decision:** _empty — will move to AWAITING_APPROVAL after surface_

---

## Recently approved (last 5)

_None yet. Items move here after the owner writes `APPROVED`._

---

## Recently rejected / change-requested

_None._
