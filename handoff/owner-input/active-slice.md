# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** Today HR can switch a site's supervisor at any moment of the day. This forced the F-002 round-2 work to engineer around a stale-authority race (atomic preCheck + service + commitApply re-check inside one tx) and a deterministic test-only hook in round 3. All of that complexity exists only because responsibility can change mid-day — a rare operational edge case.

**Simplest business rule:** Once the day starts in the tenant's local timezone, no supervisor responsibility change may take effect for that site until the next tenant-local midnight. This covers new acting cover, permanent reassignment, ending the current responsible binding, or any other binding mutation that would change who is officially responsible for today. Same-day emergencies are handled operationally (phone, WhatsApp, the existing acting cover relationship), not by mutating system ownership for today. No account sharing.

**Code (only if still needed, after spec lock):** One server-side guard at the HR binding-mutation layer — applied to every code path that can change today's responsibility. Concretely: HR binding-create (`effectiveFrom >= tomorrow-midnight-tenant-local`), HR binding-end (`effectiveUntil >= tomorrow-midnight-tenant-local`), and `reassignPermanentBinding` (the new and the closed binding both honor the same boundary). Any path that mutates a SiteSupervisorBinding row in a way that would change "who is officially responsible today" is rejected with 400 BAD_INPUT. The F-002 round-2 atomicity + commitApply auth re-check stay as defense-in-depth — they cost nothing now and remain correct if the policy is ever loosened.

**Why this code is necessary:** without the policy lock the race is still possible by construction; with the policy lock the race becomes impossible by construction, and a small set of API-layer guards enforces it. The guard is framed around the business rule ("no responsibility change takes effect today") rather than around a single field name, so a future new code path that mutates responsibility through a different field cannot silently bypass it. Per rule 25: simplify the business rule first, then engineer the simpler system. Spec lock first (responsibility model + closure spec wording), code second.

## Current

| Field                             | Value                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                    | `same-day-supervisor-freeze` (S-001)                                                                                                                                  |
| **Status**                        | `AWAITING_APPROVAL` (S-001 code slice complete; helper + wire + 5 new tests + 4 adapted; 17/17 files, 84/84 cases green; stop for review per friend's execution rule) |
| **Branch**                        | `feat/layer-1-core-primitives` (continues from F-002; S-001 lands on top)                                                                                             |
| **Last landed commit**            | `d234e77` — `feat(s-001): assertNotChangingTodaysResponsibility guard + wire into reassignPermanentBinding (S-001.1, 5 new tests / 4 adapted)`                        |
| **S-001 commits (oldest→newest)** | `2835e84` (spec lock — wording v2 landed in both specs + stale control-file line cleaned) · `d234e77` (helper + wire + 5 new tests + 4 adapted)                       |
| **Tests status**                  | **17/17 test files green · 84/84 cases pass** on fresh local Postgres 16 (15 F-002 baseline + 4 reassign-basics adapted + 5 S-001 new).                               |
| **Verification status**           | `REAL_DB` — fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432), all 12 migrations applied. Full sweep in one run.                                  |

## Spec lock — what needs to land before code

1. `axhy-v3/docs/specs/2026-05-14-supervisor-responsibility-model.md` — add the freeze rule as a new pick (alongside the existing 9). Wording draft below.
2. `axhy-v3/docs/specs/2026-05-15-workflow-design-closure.md` — reflect the simplification (round-2 atomicity stays as defense-in-depth, not primary mechanism).

**Wording draft for both specs (single source, v2 per friend's 2026-05-16 CHANGES_REQUESTED):**

> Same-day supervisor-freeze policy (S-001). Once the day has started in the tenant's local timezone, no supervisor responsibility change may take effect for that site until the next tenant-local midnight. This includes new acting cover, permanent reassignment, ending the current responsible binding, or any other binding mutation that would change who is officially responsible for today. Same-day emergencies are handled operationally outside ownership-change logic. No account sharing. F-002's atomicity and auth re-check protections remain in place as defense-in-depth.

**Wording v1 (superseded — kept for audit):**

> ~~Same-day supervisor-freeze policy (S-001 lock, 2026-05-16). Once the day has started in the tenant's local timezone, the supervisor responsible for each site is frozen for the remainder of that day. HR can create or end SiteSupervisorBinding rows only with `effectiveFrom >= tomorrow-midnight-tenant-local`. Same-day emergencies are handled operationally (phone, WhatsApp, the existing acting cover relationship for absent supervisors), not by mutating system ownership for today. No account sharing. The atomicity + auth-re-check protections inside `/chat/apply` (F-002 round 2 + round 3) remain in place as defense-in-depth and are correct even if this policy is ever loosened.~~

Friend's reason for the wording change (verbatim): "it defines the rule in business terms: no responsibility change takes effect today · it avoids tying the policy too narrowly to one field name · it covers acting cover, permanent reassignment, and ending today's ownership · it avoids future loopholes where a new code path mutates responsibility without touching effectiveFrom in the exact way the sentence assumed."

## After spec lock — the slice body (no code until owner + friend say GO)

The guard is framed around the business rule, not around one field. Every HR-driven binding-mutation entry point honors the same boundary:

- **HR binding-create:** Zod refine rejects `effectiveFrom < tomorrow-midnight-tenant-local`. 400 BAD_INPUT.
- **HR binding-end:** Zod refine rejects `effectiveUntil < tomorrow-midnight-tenant-local` (you can end a binding effective tomorrow-or-later, never today). 400 BAD_INPUT.
- **`reassignPermanentBinding`:** both the new binding's `effectiveFrom` AND the closed binding's `effectiveUntil` must be `>= tomorrow-midnight-tenant-local`. 400 BAD_INPUT if either side would change today's responsible supervisor.
- **Any new code path that mutates a SiteSupervisorBinding row** — write the check at a shared helper (`assertNotChangingTodaysResponsibility(tenantTimeZone, mutation)`) so a future binding-mutation route can't silently bypass the rule by touching a different field.

Tests (4):

1. HR cannot create a same-day acting binding (rejected with 400).
2. HR cannot end the current responsible binding effective today (rejected with 400).
3. `reassignPermanentBinding` with same-day boundary is rejected (rejected with 400).
4. The supervisor-app routing behavior is unchanged for any day's current binding (already permanent or pre-tomorrow scheduled).

F-002 tests that seed bindings with `effectiveFrom = now() - 60_000` are unaffected — they write directly via Prisma, not through the HR API; the policy is at the API layer.

## What this slice does NOT do

- Does not modify F-002 round-2 atomicity or round-3 auth re-check. Both stay as defense-in-depth.
- Does not introduce a new transaction pattern.
- Does not add a cron job or schedule mid-day binding flips.
- Does not change the SiteSupervisorBinding schema.

## F-002 closure summary (for the record)

F-002 (`chat-writes-proposed-decisions`) was approved by friend at HEAD `12c1df6` on 2026-05-16. Verbatim: "I do not have any new blocking findings · P1 is really fixed · P2 is really fixed enough for approval · handoff/control state is consistent · APPROVED." Friend's verification limitation noted (could not personally rerun the 2 new Vitest files in their shell because pnpm wasn't on PATH); not gating approval.

- **Round-1 (pre-remediation) commits:** `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146`
- **Round-1 remediation commits:** `f2b2d74` · `ec01f62` · `38b9987` · `2e03315` · `4506b3d` · `2557e1f`
- **Round-2 control-surface cleanup:** `75b56f8`
- **Round-2 fix commits:** `a1f6a2d` (G1) · `c63a163` (G2 lifecycle, R2a) · `d8b664b` (R3 writer-level tests) · `0cbb8ed` (assignment service) · `6e4c677` (leave + attendance services) · `50a859c` (swap service) · `cb3ae13` (R2b-iii chat refactor) · `92294f3` (atomicity tests)
- **Round-3 commits:** `c8c34b3` (rule 25 + approval propagation) · `5972881` (R3.1) · `990b96e` (R3.2-a)
- **Tracker propagation:** `fe927b2` (round-2 → AWAITING_APPROVAL) · `dc0ae2d` (round-3 findings surfaced) · `12c1df6` (round-3 fixes complete → AWAITING_APPROVAL)
- **Workflow IDs affected:** `D17` · `D20` · `C11` · `E21` · `E22` · `E24`
- **Verification at approval:** 15/15 test files green · 75/75 cases pass on fresh local Postgres 16 (all 12 migrations applied). Reproduction snippet below for any future replay.

## How each S-001 test case maps to friend's plan

| Test case (from spec)                                                                                             | Status | Resolution                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. HR cannot create a same-day acting binding (rejected with 400)                                                 | CLOSED | `same-day-supervisor-freeze.test.ts` case 1 — helper rejects same-day `effectiveFrom` with `SameDayFreezeError(code='SAME_DAY_FREEZE')`. Helper-level because the HR binding-create HTTP route lands in F-005 (admin-web HR portal). The guard is exported and ready to wire in when that route ships. |
| 2. HR cannot end the current responsible binding effective today (rejected with 400)                              | CLOSED | `same-day-supervisor-freeze.test.ts` case 2 — helper rejects same-day `effectiveUntil` with `SameDayFreezeError`. Same F-005 deferral reason. Proves the guard covers `effectiveUntil`-only mutations, not just `effectiveFrom`.                                                                       |
| 3. `reassignPermanentBinding` with same-day boundary is rejected (rejected with 400)                              | CLOSED | `same-day-supervisor-freeze.test.ts` case 3 — real-DB test against the service helper; rejects with `SameDayFreezeError` BEFORE the prior-find runs. Seed remains intact; no `BINDING_CREATED` or `BINDING_ENDED_SUPERSEDED_BY_PERMANENT` audit emitted.                                               |
| 4. Supervisor-app routing behavior is unchanged for any day's current binding (already permanent or pre-tomorrow) | CLOSED | `same-day-supervisor-freeze.test.ts` case 4 — `getEffectiveBinding` returns userA right now (before cutover) and userB at a post-cutover instant. Direct-Prisma seeding bypasses the API guard by design (F-002 baseline pattern, called out in the closure spec's 2026-05-16 update).                 |

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

## P10 failure matrix for S-001

| Question                                              | Answer                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?            | (1) No supervisor responsibility change may take effect today. (2) Every HR-driven binding mutation that would change today's responsible supervisor is rejected with 400.                                                                                                        |
| How is each invariant enforced?                       | (1) Shared `assertNotChangingTodaysResponsibility` helper rejects same-day `effectiveFrom` / `effectiveUntil`. (2) `reassignPermanentBinding` calls the helper before doing any DB work. Future HR binding-create / binding-end routes (F-005) will call the helper the same way. |
| What happens on a same-day mutation attempt?          | `SameDayFreezeError` thrown (code `SAME_DAY_FREEZE`) before any write. No state change, no audit, no partial commit. HTTP route layer maps to 400 BAD_INPUT.                                                                                                                      |
| What happens for tomorrow-or-later mutations?         | Pass through unaffected. `reassignPermanentBinding` still performs its full supersession (bound old row's `effectiveUntil` + insert new row + emit BINDING_ENDED_SUPERSEDED_BY_PERMANENT + BINDING_CREATED).                                                                      |
| What happens for direct-Prisma seed/migration writes? | Bypasses the guard by design — the policy is at the API layer (per the spec). Bootstrap-seed migration (pick 8) and test seed paths can still write same-day rows where appropriate.                                                                                              |
| What happens to F-002's stale-authority protections?  | Unchanged. Round-2 atomic preCheck + service + commitApply tx and round-3 auth re-check in commitApply both remain. They cost nothing now and remain correct if the policy is ever loosened.                                                                                      |
| What happens for DST transitions?                     | `tomorrowMidnightInTimeZone` samples the tz offset at the candidate instant via `Intl.DateTimeFormat`, so spring-forward and fall-back are handled correctly. Asia/Kolkata has no DST so this is theoretical for launch; the helper still does the right thing in other tz.       |
| What is still deferred?                               | HR binding-create + binding-end HTTP routes (F-005 admin-web HR portal). When those land, they call the helper exported here. `Company.timeZone` schema field also deferred; the helper accepts the override now, so the wiring is a one-line change when the column ships.       |

## Decision needed (owner + friend, before any S-001 code)

- `SPEC LOCK APPROVED` → spec wording lands in both specs in one commit batch; then S-001 code (shared API-layer guard `assertNotChangingTodaysResponsibility` + 4 tests) lands in a second commit.
- `CHANGES_REQUESTED on wording` → bullet list of wording adjustments.
- `HOLD` → S-001 pauses. F-002's round-2+3 protections continue to carry the load.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
