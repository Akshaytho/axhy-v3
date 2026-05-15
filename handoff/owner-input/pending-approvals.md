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

### Slice: `chat-writes-proposed-decisions` (F-002 remediation pass) — AWAITING_APPROVAL 2026-05-15 evening

- **Status:** `AWAITING_APPROVAL`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `2557e1f` — `test(decisions): F-002 remediation tests — concurrency + new kinds + stale-client (F-002.7)`
- **Original slice commits:** `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146` (kept; not rebased)
- **Remediation commits:** `f2b2d74` (F-002.1 registry) · `ec01f62` (F-002.2 CHECK) · `38b9987` (F-002.3 race-safe writer) · `2e03315` (F-002.4+5 apply-after-domain + required decisionId) · `4506b3d` (F-002.6 read-side registry) · `2557e1f` (F-002.7 tests)
- **All 4 findings closed.** See `active-slice.md` for the per-finding resolution table and the P10 failure matrix.
- **Verification:** `REAL_DB` — fresh local Postgres 16, all 12 migrations (20260507 → 20260518). **11/11 test files, 61/61 cases green** in one sweep, including 4 new concurrency cases (apply-vs-apply, apply-vs-dismiss, DB CHECK constraint, normal terminal states) and 3 new-kind binding-change cases (CREATE_ASSIGNMENT, TERMINATE_WORKER, SWAP_WORKER each route via current responsible after acting cover).
- **Friend's required additions delivered:**
  1. apply-vs-dismiss race test present in `supervisor-decision-concurrency.test.ts` — asserts exactly one wins, the other gets 409, DB state valid, audit matches winner only.
  2. Stale-client success-path test in `chat-apply-transitions-decision.test.ts` rewritten to assert 400 BAD_INPUT + row stays PROPOSED + no domain side effect.
  3. One shared decision-kind registry (`packages/shared-schema/src/zod/supervisor-decision-kinds.ts`) — TOOL_TO_DWI + WORKER_TARGETED_KINDS + SITE_TARGETED_KINDS gone; writer + read-side + authorization all derive from `DECISION_KIND_REGISTRY`.
- **Research sources cited per Rule P9:**
  - https://www.prisma.io/docs/orm/reference/prisma-client-reference#updatemany
  - https://www.postgresql.org/docs/current/transaction-iso.html
  - https://www.postgresql.org/docs/current/ddl-constraints.html
- **Decision needed:** `APPROVED` / `CHANGES_REQUESTED` (with bullet list) / `HOLD`. On APPROVED, the slice moves to APPROVED; F-002 is shippable; next slice can start.

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

### Slice: `chat-writes-proposed-decisions` (F-002, initial pass) — CHANGES_REQUESTED 2026-05-15 evening

- **Original status:** `CHANGES_REQUESTED` at HEAD `c0c000a`. Resolved by the remediation pass surfaced as AWAITING_APPROVAL above.
- **Friend's verbatim review:** "He built the shape of the design, but not the safety guarantees the design really needed … apply is not truly atomic for most actions; backward-compat path leaves stale PROPOSED rows; some decision kinds are not routed to the current responsible supervisor; concurrent apply/dismiss can break state integrity."
- **4 findings (all resolved in the remediation pass):**
  - F1 — orphan APPLIED on domain failure (rule P3 + P7). Resolved by F-002.4 apply-after-domain.
  - F2 — optional `decisionId` left stale PROPOSED rows (rule P4). Resolved by F-002.5 — decisionId required.
  - F3 — SWAP/TERMINATE/CREATE_ASSIGNMENT bypassed binding routing (rule P5). Resolved by F-002.1 + F-002.6 unified registry.
  - F4 — concurrent apply/dismiss race could corrupt state (rules P1 + P2). Resolved by F-002.2 DB CHECK constraint + F-002.3 race-safe updateMany.
- **Friend's 3 required additions on the remediation plan:**
  1. apply-vs-dismiss race test (not only apply-vs-apply). Delivered in `supervisor-decision-concurrency.test.ts`.
  2. Replace the stale-client success-path test with a 400-assertion test. Delivered in `chat-apply-transitions-decision.test.ts`.
  3. One shared decision-kind registry, not drifting parallel lists. Delivered as `DECISION_KIND_REGISTRY` in shared-schema.
