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

### Slice: `routing-foundation-read-apis` (F-001) — AWAITING_APPROVAL 2026-05-15 evening

- **Status:** `AWAITING_APPROVAL`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `7e07a24` — `test(routing): point-in-time effective-responsibility (4th test file)`
- **Slice commits (oldest → newest):** `84ae39c` (WIP: helpers + routes + 3 of 4 tests) · `429886d` (fix: 2 route-test `issueAccessToken` calls — await + availableRoles + locale) · `7e07a24` (test: 4th test file, 3 point-in-time cases)
- **Workflow IDs affected:** D17 (read side), F26 (read side), F27 (read side)
- **Verification gate cleared:** `REAL_DB`. Fresh local Postgres 16 (Docker container `axhy-test-pg` on port 55432), `axhy_test` database, all 10 migrations applied via `prisma migrate deploy` (20260507 → 20260516). All 4 binding-routing test files green in one run: 8 helper + 5 sites-route + 7 decisions-route + 3 point-in-time = **23/23 cases**.
- **Decision needed:**
  1. Approve / change-request / hold the slice itself.
  2. Decide the WIP-split deviation. Friend's directive said "split WIP `84ae39c` into 3 clean commits (helpers / routes / tests)". A true rebase-split would have rewritten ~12 commit hashes already cited in `change-history.md` and `pending-approvals.md` (the just-locked control-loop slice). Chose to land the completion as 2 additive commits on top instead — slice is reviewable as 3 separately-themed commits without invalidating the handoff machinery. If you prefer the actual rebase-split, easy to redo now before approval.
- **Reproduction (for friend's spot-check):**
  ```
  docker exec axhy-test-pg pg_isready -U postgres
  cd apps/backend
  DATABASE_URL="postgres://postgres:test@localhost:55432/axhy_test?schema=axhy" \
  AXHY_DB_URL="postgres://postgres:test@localhost:55432/axhy_test?schema=axhy" \
  pnpm exec vitest run \
    test/effective-responsibility-helper.test.ts \
    test/sites-effective-supervisor-route.test.ts \
    test/decisions-proposed-for-me-route.test.ts \
    test/effective-responsibility-point-in-time.test.ts
  ```

---

## Currently blocked (NOT awaiting approval — blocked by external dependency)

_None._

---

## Recently approved (last 5)

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
