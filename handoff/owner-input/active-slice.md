# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** Today HR can switch a site's supervisor at any moment of the day. F-002 round-2 + round-3 had to engineer around the resulting stale-authority race (atomic preCheck + service + commitApply re-check inside one tx + a deterministic test-only hook). All of that complexity exists only because responsibility can change mid-day — a rare operational edge case.

**Simplest business rule:** Once the day starts in the tenant's local timezone, no supervisor responsibility change may take effect for that site until the next tenant-local midnight. This covers new acting cover, permanent reassignment, ending the current responsible binding, or any other binding mutation that would change who is officially responsible for today. Same-day emergencies are handled operationally outside ownership-change logic. No account sharing.

**Code fix (landed):** one shared API-layer guard `assertNotChangingTodaysResponsibility({ now?, tenantTimeZone?, effectiveFrom?, effectiveUntil? })` throws `SameDayFreezeError(code='SAME_DAY_FREEZE')` whenever a mutation would change today's responsible supervisor. Wired into `reassignPermanentBinding` (covers both the new `effectiveFrom` AND the closed `effectiveUntil` because they share the cutover instant). Exported and ready to drop into the future F-005 HR binding-create / binding-end routes. The guard is framed around the business outcome ("no responsibility change takes effect today"), not around a single field, so a future code path mutating responsibility through a different field cannot silently bypass it.

**Why this code is necessary:** without the helper the spec is words; with the helper any HR-driven mutation that would change today's responsible supervisor is rejected by construction. F-002 round-2 atomicity + round-3 auth re-check stay as defense-in-depth — they cost nothing now and remain correct if the policy is ever loosened.

## Current

| Field                             | Value                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                    | `same-day-supervisor-freeze` (S-001)                                                                                                                                                                                                                                                                                                                       |
| **Status**                        | `AWAITING_APPROVAL` (spec lock + code + tests complete; 17/17 files, 84/84 cases green on fresh local Postgres 16; stop for review per friend's execution rule)                                                                                                                                                                                            |
| **Branch**                        | `feat/layer-1-core-primitives` (continues from F-002; S-001 lands on top)                                                                                                                                                                                                                                                                                  |
| **Last landed commit**            | `ab4d9a2` — `docs(handoff): S-001 control-surface cleanup — purge pre-code phrasing + describe delivered shape (S-001.3)`                                                                                                                                                                                                                                  |
| **S-001 commits (oldest→newest)** | `2835e84` (spec lock — wording v2 landed in both specs + stale control-file line cleaned) · `d234e77` (helper + wire into `reassignPermanentBinding` + 5 new tests + 4 adapted) · `8e763f8` (tracker propagation → AWAITING_APPROVAL) · `ab4d9a2` (control-surface cleanup — pre-code phrasing purged + feature-queue entry describes the delivered shape) |
| **Tests status**                  | **17/17 test files green · 84/84 cases pass** on fresh local Postgres 16 (15 F-002 baseline + 4 reassign-basics adapted + 5 S-001 new).                                                                                                                                                                                                                    |
| **Verification status**           | `REAL_DB` — fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432), all 12 migrations applied. Full sweep in one run.                                                                                                                                                                                                                       |

## How each S-001 planned test case is closed

| Test case (from the slice plan)                                                                                   | Status | Resolution                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. HR cannot create a same-day acting binding (rejected with 400)                                                 | CLOSED | `same-day-supervisor-freeze.test.ts` case 1 — helper rejects same-day `effectiveFrom` with `SameDayFreezeError(code='SAME_DAY_FREEZE')`. Helper-level because the HR binding-create HTTP route lands in F-005 (admin-web HR portal). The guard is exported and ready to wire in when that route ships. |
| 2. HR cannot end the current responsible binding effective today (rejected with 400)                              | CLOSED | `same-day-supervisor-freeze.test.ts` case 2 — helper rejects same-day `effectiveUntil` with `SameDayFreezeError`. Same F-005 deferral reason. Proves the guard covers `effectiveUntil`-only mutations, not just `effectiveFrom`.                                                                       |
| 3. `reassignPermanentBinding` with same-day boundary is rejected                                                  | CLOSED | `same-day-supervisor-freeze.test.ts` case 3 — real-DB test against the service helper; rejects with `SameDayFreezeError` BEFORE the prior-find runs. Seed remains intact; no `BINDING_CREATED` or `BINDING_ENDED_SUPERSEDED_BY_PERMANENT` audit emitted.                                               |
| 4. Supervisor-app routing behavior is unchanged for any day's current binding (already permanent or pre-tomorrow) | CLOSED | `same-day-supervisor-freeze.test.ts` case 4 — `getEffectiveBinding` returns userA right now (before cutover) and userB at a post-cutover instant. Direct-Prisma seeding bypasses the API guard by design (F-002 baseline pattern, called out in the closure spec's 2026-05-16 update).                 |

## S-001 file inventory (new + adapted in this slice)

- `apps/backend/src/lib/same-day-freeze.ts` — NEW. Helper module exporting `assertNotChangingTodaysResponsibility`, `SameDayFreezeError`, `tomorrowMidnightInTimeZone`, `DEFAULT_TENANT_TIME_ZONE`.
- `apps/backend/src/lib/site-supervisor-binding.ts` — wires the guard into `reassignPermanentBinding`; adds optional `tenantTimeZone` to `ReassignPermanentBindingInput`.
- `apps/backend/test/same-day-supervisor-freeze.test.ts` — NEW. 5 cases (4 from the plan + 1 helper sanity).
- `apps/backend/test/binding-permanent-reassignment-basics.test.ts` — 3 cases adapted to honor the new policy (cutover shifted to +36h; one case renamed and refactored to query effective-at-post-cutover instead of effective-now, the only correct shape under S-001).
- `docs/specs/2026-05-14-supervisor-responsibility-model.md` — "2026-05-16 Update" section appended (single-source wording).
- `docs/specs/2026-05-15-workflow-design-closure.md` — "2026-05-16 Update" section appended (single-source wording).

## P10 failure matrix for S-001

| Question                                              | Answer                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?            | (1) No supervisor responsibility change may take effect today. (2) Every HR-driven binding mutation that would change today's responsible supervisor is rejected with 400.                                                                                                             |
| How is each invariant enforced?                       | (1) Shared `assertNotChangingTodaysResponsibility` helper rejects same-day `effectiveFrom` / `effectiveUntil`. (2) `reassignPermanentBinding` calls the helper before doing any DB work. Future HR binding-create / binding-end routes (F-005) will call the helper the same way.      |
| What happens on a same-day mutation attempt?          | `SameDayFreezeError` thrown (code `SAME_DAY_FREEZE`) before any write. No state change, no audit, no partial commit. HTTP route layer maps to 400 BAD_INPUT.                                                                                                                           |
| What happens for tomorrow-or-later mutations?         | Pass through unaffected. `reassignPermanentBinding` still performs its full supersession (bound old row's `effectiveUntil` + insert new row + emit BINDING_ENDED_SUPERSEDED_BY_PERMANENT + BINDING_CREATED).                                                                           |
| What happens for direct-Prisma seed/migration writes? | Bypasses the guard by design — the policy is at the API layer (per the spec). Bootstrap-seed migration (pick 8) and test seed paths can still write same-day rows where appropriate.                                                                                                   |
| What happens to F-002's stale-authority protections?  | Unchanged. Round-2 atomic preCheck + service + commitApply tx and round-3 auth re-check in commitApply both remain. They cost nothing now and remain correct if the policy is ever loosened.                                                                                           |
| What happens for DST transitions?                     | `tomorrowMidnightInTimeZone` samples the tz offset at the candidate instant via `Intl.DateTimeFormat`, so spring-forward and fall-back are handled correctly. Asia/Kolkata has no DST so this is theoretical for launch; the helper still does the right thing in other tz.            |
| What is still intentionally deferred?                 | HR binding-create + binding-end HTTP routes (F-005 admin-web HR portal). When those land, they call the helper exported here. `Company.timeZone` schema column also deferred; the helper accepts the override parameter now, so the wiring is a one-line change when the column lands. |

## What this slice does NOT do

- Does not modify F-002 round-2 atomicity or round-3 auth re-check. Both stay as defense-in-depth.
- Does not introduce a new transaction pattern.
- Does not add a cron job or schedule mid-day binding flips.
- Does not change the SiteSupervisorBinding schema.
- Does not add the `Company.timeZone` schema column (deferred — helper accepts an override parameter today).
- Does not land HTTP routes for HR binding-create / binding-end (F-005 admin-web HR portal scope).

## Spec lock — what landed (2026-05-16)

Single-source wording (identical text in both specs):

> Same-day supervisor-freeze policy (S-001). Once the day has started in the tenant's local timezone, no supervisor responsibility change may take effect for that site until the next tenant-local midnight. This includes new acting cover, permanent reassignment, ending the current responsible binding, or any other binding mutation that would change who is officially responsible for today. Same-day emergencies are handled operationally outside ownership-change logic. No account sharing. F-002's atomicity and auth re-check protections remain in place as defense-in-depth.

- `docs/specs/2026-05-14-supervisor-responsibility-model.md` — "2026-05-16 Update" section (after the existing 2026-05-15 update). Adds interaction notes against §§3.1, 3.2, 4, 5, 7, 9, 10.
- `docs/specs/2026-05-15-workflow-design-closure.md` — "2026-05-16 Update" section after §15. Adds interaction notes against §§3.1, 4, 5.3, 5.2/5.4, 6.

Friend's `SPEC LOCK APPROVED` at HEAD `9e137e4`. Verbatim: "v2 wording is good · spec lock approved · fix one stale control-file line while landing it · then start S-001 code."

## F-002 closure summary (kept for cross-slice context)

F-002 (`chat-writes-proposed-decisions`) approved by friend at HEAD `12c1df6` on 2026-05-16. Verbatim: "I do not have any new blocking findings · P1 is really fixed · P2 is really fixed enough for approval · handoff/control state is consistent · APPROVED." Friend's verification limitation noted (could not personally rerun the 2 new Vitest files in their shell because pnpm wasn't on PATH); not gating.

- **F-002 round-1 commits:** `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146`
- **F-002 round-1 remediation:** `f2b2d74` · `ec01f62` · `38b9987` · `2e03315` · `4506b3d` · `2557e1f`
- **F-002 round-2:** `75b56f8` (control-surface cleanup) · `a1f6a2d` (G1) · `c63a163` (G2 lifecycle / R2a) · `d8b664b` (R3 writer-level tests) · `0cbb8ed` · `6e4c677` · `50a859c` · `cb3ae13` · `92294f3`
- **F-002 round-3:** `c8c34b3` (rule 25 + approval propagation) · `5972881` (R3.1) · `990b96e` (R3.2-a)
- **F-002 tracker propagation:** `fe927b2` · `dc0ae2d` · `12c1df6`
- **Workflow IDs affected (F-002):** `D17` · `D20` · `C11` · `E21` · `E22` · `E24`

## Reproduction (full S-001 + F-002 baseline sweep)

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
  test/chat-apply-transitions-decision.test.ts \
  test/supervisor-decision-concurrency.test.ts \
  test/supervisor-decision-new-kinds-routing.test.ts \
  test/chat-apply-route-concurrency.test.ts \
  test/chat-apply-atomicity.test.ts \
  test/chat-apply-validation.test.ts \
  test/chat-apply-stale-auth-route.test.ts \
  test/binding-permanent-reassignment-basics.test.ts \
  test/same-day-supervisor-freeze.test.ts
```

Expected: 17 files, 84 cases, all green (15 F-002 baseline + 4 reassign-basics adapted + 5 S-001 new).

## Decision needed on S-001 code

- `APPROVED` → slice moves to APPROVED; ready to be marked DONE once branch merges to main (alongside F-002).
- `CHANGES_REQUESTED` (bullet list) → name what to change.
- `HOLD` → S-001 pauses.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
