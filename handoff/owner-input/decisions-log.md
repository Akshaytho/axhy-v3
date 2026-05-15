# Owner Decisions Log (append-only)

> Every owner-level decision lands here with date, decision, and the commit (or slice) that captured it.
> Append only. No retroactive edits. If an old decision is superseded, add a new entry referencing it.

---

## 2026-05-15 evening — Build a 4-layer handoff system before any more backend slices

- **Context:** Akshay's session-continuity worry → friend approved the 3-layer system (execution-state + workflow-maps + generated). Akshay then asked for: per-commit auto-update, owner-input section, approval gate, feature-queue, current-slice visibility, no vector DB as authority.
- **Decision:** Build the 4th layer (`handoff/owner-input/` + `handoff/feature-queue/`) and extend the generator to render the control state in HTML. Pause routing-slice resume until this lands.
- **Approval word:** "yes — take it one level further now" (paraphrased).
- **Captured at commit:** _this slice — pending_.

## 2026-05-15 afternoon — Move handoff/ out of docs/

- **Context:** Akshay reported docs/ was too cluttered.
- **Decision:** `git mv docs/handoff handoff` (top-level under axhy-v3).
- **Captured at commit:** `03d33dd` `docs(handoff): 3-layer system — move out of docs/, add workflow-maps + generated outputs`.

## 2026-05-15 — Pause routing slice mid-flight to build execution-state tracker

- **Context:** Akshay surfaced session-drift risk.
- **Decision:** WIP-commit routing work at `84ae39c`, build tracker, resume after.
- **Captured at commits:** `84ae39c`, `d4bb4c8`.

## 2026-05-15 — Promote workflow-design-closure spec to Active

- **Context:** Closure of the 5-persona audit phase; cross-cutting decisions ready.
- **Decision:** Promote `docs/specs/2026-05-15-workflow-design-closure.md` to `Active but contract-incomplete`.
- **Captured at commits:** `8b7e044`, `e8ae75e`, `e9c5ca1`.

## 2026-05-15 — P1.5 future-dated reassignment uses effectiveUntil, not endedAt

- **Context:** Friend's PR review caught that the helper set `endedAt` immediately, breaking future-dated handoffs.
- **Decision:** Rewrite `reassignPermanentBinding` to use `effectiveUntil`; reserve `endedAt` for manual early termination.
- **Captured at commit:** `44a453d`.

---

## How to add an entry

Append below the most recent entry. Format:

```
## YYYY-MM-DD — Short title

- **Context:** what triggered this
- **Decision:** what was decided
- **Approval word:** (the literal owner approval if any)
- **Captured at commit:** <hash> (or `pending` until landed)
```

No deletions, no reorderings. This is the audit trail.
