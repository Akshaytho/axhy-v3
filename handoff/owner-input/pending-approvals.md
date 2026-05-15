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

### Slice: `chat-writes-proposed-decisions` (F-002) — CHANGES_REQUESTED 2026-05-15 evening

- **Status:** `CHANGES_REQUESTED` — friend's production-grade review at HEAD `c0c000a` surfaced 4 findings that the new rule 24 (production-grade rulebook) explicitly says are NOT absolvable by documentation. The slice's shape is correct; the safety guarantees are not. Per rule P7 ("documented limitation ≠ acceptable limitation"), this is a blocker, not a footnote.
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at review:** `c0c000a` (tracker propagation); slice body at `662e146`.
- **Slice commits still in tree:** `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146`. They stay (no rebase); remediation lands as additive commits on top.
- **Friend's verbatim summary:** "He built the shape of the design, but not the safety guarantees the design really needed … apply is not truly atomic for most actions; backward-compat path leaves stale PROPOSED rows; some decision kinds are not routed to the current responsible supervisor; concurrent apply/dismiss can break state integrity."

#### The 4 findings (rulebook citations)

| #   | Finding                                                                                                                                                                                                   | Rule    | Severity                 | Location                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `appliedAt` commits before the real domain effect succeeds. Inject-style branches (mark_absent / leave / swap / create_assignment / living_doc_update) → orphan APPLIED on domain failure.                | P3 + P7 | corrupts business truth  | `apps/backend/src/routes/chat.ts` — pre-block `applyProposedDecision` call before each `app.inject` branch.                                 |
| F2  | `ApplyDecisionCardInput.decisionId` is OPTIONAL → old clients can apply without closing the row. PROPOSED stays open; can be applied or dismissed a second time.                                          | P4      | duplicate-effect / stale | `packages/shared-schema/src/zod/chat.ts` + the `if (parsed.data.decisionId && ...)` branch in `chat.ts`.                                    |
| F3  | New kinds (`SWAP_WORKER`, `TERMINATE_WORKER`, `CREATE_ASSIGNMENT`) are in `TOOL_TO_DWI` writer mapping but NOT in F-001's `WORKER_TARGETED_KINDS` / `SITE_TARGETED_KINDS` read sets. Fall back to origin. | P5      | misrouted responsibility | `apps/backend/src/routes/decisions.ts:54-58` + `apps/backend/src/lib/supervisor-decision-writer.ts:78-79` (duplicated sets — drift hazard). |
| F4  | `applyProposedDecision` + `dismissProposedDecision` use `findUnique → check → update`. Two concurrent requests can both pass guards. Row can end with BOTH `appliedAt` AND `dismissedAt` set.             | P1 + P2 | state-integrity / race   | `apps/backend/src/lib/supervisor-decision-writer.ts` — apply at L268+, dismiss at L356+.                                                    |

#### Remediation plan (for your approval BEFORE I write code)

Confidence: 87% own. Below the rule 23 ≥90% threshold for code execution, so I want your go-ahead on the plan shape before implementing. Per rule P9 I will research Prisma `updateMany` semantics + PostgreSQL row-locking + CHECK constraint behaviour before each commit; sources cited in each commit message.

**Fix 1 — atomic apply (P3, fixes F1).** Default: **apply-after-domain with conditional UPDATE**.

- Re-order each `/chat/apply` inject-style branch: auth + responsibility check FIRST (read-only), then domain inject, then `UPDATE WHERE id=? AND appliedAt IS NULL AND dismissedAt IS NULL`. If `count === 0` after a 2xx domain response: the row was concurrently dismissed/applied — return 409 + emit a new `DWI_RACE_DETECTED` audit row.
- `propose_termination` stays fully atomic (no change — its tx already inlines lifecycle + worker.update).
- Alternative: intermediate `appliedAttemptedAt` state. Heavier; new migration; needs a reconciler. Default rejects this in favour of apply-after-domain unless you say otherwise.

**Fix 2 — `decisionId` becomes required (P4, fixes F2).**

- Tighten Zod: `decisionId: z.string().uuid()` (drop `.optional()`).
- Delete the `if (parsed.data.decisionId && ...)` branch entirely — old clients hit 400 BAD_INPUT.
- Sunset: the back-compat path was never deployed (this is `feat/layer-1-core-primitives`, not `main`). Safe to delete now. No mobile-app coordination needed.

**Fix 3 — wire new kinds into routing (P5, fixes F3).**

- Consolidate `WORKER_TARGETED_KINDS` + `SITE_TARGETED_KINDS` into a single shared module: `packages/shared-schema/src/zod/supervisor-decision-kinds.ts`. Both `decisions.ts` and `supervisor-decision-writer.ts` import from there. Cannot drift.
- Add the 3 kinds:
  - `CREATE_ASSIGNMENT` → `WORKER_TARGETED_KINDS` (targetId is workerId; route via primary site)
  - `TERMINATE_WORKER` → `WORKER_TARGETED_KINDS` (targetId is workerId; route via primary site)
  - `SWAP_WORKER` → `SITE_TARGETED_KINDS` (targetId is siteId; direct route)
- Add a test per new kind: seed PROPOSED + binding change between propose-time and apply-time → currently responsible supervisor wins, original rejected with 403.

**Fix 4 — race-safe transitions (P1 + P2, fixes F4).**

- **DB layer** (rule P1 — invariants in the DB): new migration adds `CHECK (NOT ("appliedAt" IS NOT NULL AND "dismissedAt" IS NOT NULL))`. The impossible state becomes DB-impossible.
- **App layer** (rule P2 — no check-then-act): switch apply + dismiss to `prisma.supervisorDecision.updateMany` with the full precondition in WHERE. Inspect `count`; if 0, run a discriminator read to map to the right LifecycleError code.
- Add a concurrent-double-submit test: fire two `app.inject` calls in parallel, assert exactly one returns 200 and the other returns 409.

#### P10 failure matrix (post-remediation)

| Question                                                | Answer (after Fixes 1–4)                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What invariants does this slice introduce?              | (1) A PROPOSED row transitions to exactly one terminal state. (2) `appliedAt` + `dismissedAt` mutually exclusive. (3) Only the currently responsible supervisor (per F-001 routing) can transition it. |
| How is each invariant enforced?                         | (1) Conditional UPDATE on every transition. (2) DB CHECK constraint + conditional UPDATE both. (3) App-layer F-001 routing predicate on the unified kind sets.                                         |
| What happens on failure of the domain effect?           | Row stays PROPOSED (apply-after-domain). User retries or dismisses. No corruption.                                                                                                                     |
| What happens on retry / double-submit?                  | Conditional UPDATE returns 0 → 409 ALREADY_APPLIED. No double lifecycle effect. Domain side: depends on the domain route's own idempotency (mark_absent, leave, etc. already have it).                 |
| What happens under concurrent requests on the same row? | Exactly one wins via conditional UPDATE. The other gets 409. DB CHECK blocks the impossible (both-set) state even if app guard is bypassed.                                                            |
| What happens for a stale client (old shape)?            | 400 BAD_INPUT — `decisionId is required`. No back-compat fallback. Sunset: never deployed.                                                                                                             |
| What is still intentionally deferred (with sunset)?     | Full state ENUM column (FAILED / EXPIRED / UNDONE). Today's (appliedAt, dismissedAt) pair covers PROPOSED / APPLIED / DISMISSED. Other states get their own slice with concrete triggers.              |

#### Suggested commit shape (after plan approval)

1. `feat(schema): consolidate worker/site-targeted kind sets into shared-schema (F-002.1)`
2. `feat(schema): SupervisorDecision apply/dismiss mutual-exclusion CHECK constraint (F-002.2)`
3. `feat(decisions): race-safe applyProposedDecision + dismissProposedDecision via updateMany (F-002.3)`
4. `feat(chat): atomic apply via apply-after-domain pattern (F-002.4)`
5. `feat(chat): decisionId required on /chat/apply — drop back-compat (F-002.5)`
6. `feat(decisions): route SWAP / TERMINATE / CREATE_ASSIGNMENT via current responsible (F-002.6)`
7. `test(decisions): concurrent-double-submit + DB-constraint enforcement tests (F-002.7)`
8. `docs(handoff): F-002 remediation complete → AWAITING_APPROVAL`

Total: 7 fix commits + 1 tracker commit, additive on top of the 6 existing slice commits.

#### Decision needed

- `APPROVED on plan` → I research (P9), implement the 7 fixes, re-surface as AWAITING_APPROVAL with the P10 matrix filled in concretely.
- `CHANGES_REQUESTED on plan` → name what to change in the plan; I revise.
- `HOLD` → pause F-002. F-001's read API still works (no writer exists yet, so no production data is affected by pausing).

**I will not write a single line of fix code until this remediation plan is explicitly approved.**

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
