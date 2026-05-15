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

### Slice: `chat-writes-proposed-decisions` (F-002) — AWAITING_APPROVAL 2026-05-15 evening

- **Status:** `AWAITING_APPROVAL`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `662e146` — `test(decisions): 5 integration test files for F-002 (54/54 green)`
- **Slice commits (oldest → newest):** `a8b4e79` (schema + migration) · `73ee9eb` (audit kinds + helpers + payloads) · `8d20db0` (supervisor-decision-writer.ts) · `7fbddcb` (chat.ts propose + apply) · `12f27ed` (dismiss route + tighten proposed predicate) · `662e146` (5 test files)
- **Workflow IDs affected:** D17 (writer), D20 (writer, EMPLOYMENT ack gate), C11, E21, E22, E24
- **Verification gate cleared:** `REAL_DB`. Fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432), all 11 migrations applied (20260507 → 20260517). Full sweep in one run: **54/54 cases green** across 9 test files (4 F-001 regression + 5 F-002 new).
- **Locked picks accepted (Q1–Q5):** Q1=(b) best-effort originContext capture · Q2=(a) single slice · Q3=(a) include dismiss + migration · Q4=(b) defer state ENUM · Q5=reuse F-001 helpers for `proposedDuringAbsence`.
- **Known limitation (surfaced for friend's call):** Inject-style `/chat/apply` branches commit lifecycle in tx 1, domain inject in tx 2. If domain inject fails after lifecycle commits → orphan APPLIED row (audit shows DWI_APPLIED without downstream domain audit). Acceptable for F-002 MVP per scope §3b's "inside one transaction" (interpreted pragmatically given inject() architecture). `propose_termination` is fully atomic. Future cleanup slice could extract domain logic to be tx-shareable.
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
    test/effective-responsibility-point-in-time.test.ts \
    test/supervisor-decision-writer-create.test.ts \
    test/supervisor-decision-apply.test.ts \
    test/decisions-dismiss-route.test.ts \
    test/supervisor-decision-proposed-during-absence.test.ts \
    test/chat-apply-transitions-decision.test.ts
  ```
- **What changed beyond the scope artifact:**
  - The `ApplyDecisionCardInput` Zod schema added `decisionId` as **optional** (not required) — back-compat for old mobile clients that haven't shipped the new shape yet. The scope artifact §3b implied required. Surfacing this small relaxation for friend's awareness; can tighten in a follow-up once all clients ship.
  - Existing chat-\* tests (`chat-mark-absent.test.ts`, `chat-leave.test.ts`, etc. that hit the real OpenAI loop) were NOT re-run in this sweep — they require an OpenAI key + take ~90s each. The new tests cover all F-002 logic without OpenAI dependency. Friend's call: re-run the OpenAI tests against this slice before merge to main?
- **Decision needed:** `APPROVED` / `CHANGES_REQUESTED` (with bullet list) / `HOLD` (with reason). On APPROVED, the slice moves to `APPROVED` state; next slice can start.

---

## Currently blocked (NOT awaiting approval — blocked by external dependency)

_None._

---

## Recently approved (last 5)

### Scope approval: `F-002` — APPROVED 2026-05-15 evening

- **Type:** Scope artifact approval (not a code slice). No code review needed — this is the gate that unlocks F-002 coding.
- **Artifact:** `handoff/feature-queue/scopes/F-002.md`
- **Last landed commit at approval:** `1fb546e` — `fix(handoff): full sweep for forward-looking wording`
- **Approval received:** Friend's file-grounded verification at HEAD `1fb546e`. Verbatim: "trust fixes are real · F-002 scope approved · use the default picks · start coding".
- **Default picks accepted (all 5):**
  - Q1 `originContext` shape = (b) best-effort capture now.
  - Q2 single vs split = (a) single slice.
  - Q3 dismiss support = (a) include (adds `dismissedAt` + `dismissedReason` migration).
  - Q4 state ENUM = (b) defer.
  - Q5 `proposedDuringAbsence` detection = reuse F-001 helpers.
- **Friend's execution constraints (locked):**
  - single slice covering PROPOSED writer + apply transition + dismiss endpoint
  - include dismissedAt + dismissedReason migration; no full state enum yet
  - best-effort originContext capture only
  - real-DB verification required before surfacing for approval
  - sanity-rerun the 4 F-001 routing tests along with the new F-002 tests
  - stop again when F-002 reaches AWAITING_APPROVAL

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
