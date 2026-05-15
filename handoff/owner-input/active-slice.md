# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** Today HR can switch a site's supervisor at any moment of the day. This forced the F-002 round-2 work to engineer around a stale-authority race (atomic preCheck + service + commitApply re-check inside one tx) and a deterministic test-only hook in round 3. All of that complexity exists only because responsibility can change mid-day — a rare operational edge case.

**Simplest business rule:** Once the day starts, today's supervisor ownership is frozen. HR cannot change today's supervisor in the system. Any supervisor change starts tomorrow at tenant-local midnight. Same-day emergencies are handled operationally (phone, WhatsApp, the existing acting cover relationship), not by mutating system ownership for today. No account sharing.

**Code (only if still needed, after spec lock):** One server-side check in the HR binding-create service: reject `effectiveFrom < tomorrow-midnight-tenant-local` with 400 BAD_INPUT. The F-002 round-2 atomicity + commitApply auth re-check stays as defense-in-depth — they cost nothing now and remain correct if the policy ever loosens.

**Why this code is necessary:** without the policy lock the race is still possible by construction; with the policy lock the race becomes impossible by construction, and a single Zod check at the API layer enforces it. Per rule 25: simplify the business rule first, then engineer the simpler system. Spec lock first (responsibility model + closure spec wording), code second.

## Current

| Field                   | Value                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**          | `same-day-supervisor-freeze` (S-001)                                                                                                        |
| **Status**              | `PLANNED — AWAITING_SPEC_LOCK` (owner + friend lock the policy in the two specs before any code lands)                                      |
| **Branch**              | `feat/layer-1-core-primitives` (continues from F-002; S-001 lands on top)                                                                   |
| **Last landed commit**  | `12c1df6` — `docs(handoff): F-002 round-3 fixes complete → AWAITING_APPROVAL (F-002.20, 15 files / 75 cases green)` (F-002 closed APPROVED) |
| **Tests status**        | n/a — no code in flight                                                                                                                     |
| **Verification status** | n/a — spec phase                                                                                                                            |

## Spec lock — what needs to land before code

1. `axhy-v3/docs/specs/2026-05-14-supervisor-responsibility-model.md` — add the freeze rule as a new pick (alongside the existing 9). Wording draft below.
2. `axhy-v3/docs/specs/2026-05-15-workflow-design-closure.md` — reflect the simplification (round-2 atomicity stays as defense-in-depth, not primary mechanism).

**Wording draft for both specs (single source):**

> Same-day supervisor-freeze policy (S-001 lock, 2026-05-16). Once the day has started in the tenant's local timezone, the supervisor responsible for each site is frozen for the remainder of that day. HR can create or end SiteSupervisorBinding rows only with `effectiveFrom >= tomorrow-midnight-tenant-local`. Same-day emergencies are handled operationally (phone, WhatsApp, the existing acting cover relationship for absent supervisors), not by mutating system ownership for today. No account sharing. The atomicity + auth-re-check protections inside `/chat/apply` (F-002 round 2 + round 3) remain in place as defense-in-depth and are correct even if this policy is ever loosened.

## After spec lock — the slice body (no code until owner says GO)

- One change in the HR binding-create service: parse `effectiveFrom` with a Zod refine that rejects `< tomorrow-midnight-tenant-local`. 400 BAD_INPUT.
- Same check on `reassignPermanentBinding` (per the existing `endedAt` mechanism — `effectiveUntil` cannot be set to a past or same-day time either, except for "end immediately at the close of today" which is reframed as "end at end-of-day tenant-local").
- Two tests:
  - HR cannot create a same-day binding (rejected with 400 BAD_INPUT).
  - The supervisor-app routing behavior is unchanged for any day's current binding (already permanent or pre-tomorrow scheduled).
- F-002 tests that seed bindings with `effectiveFrom = now() - 60_000` are unaffected — they write directly via Prisma, not through the HR API; the policy is at the API layer.

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

## Reproduction (F-002 baseline — applies until S-001 lands new tests)

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
  test/chat-apply-stale-auth-route.test.ts
```

Expected: 15 files, 75 cases, all green (F-002 baseline).

## Decision needed (owner + friend, before any S-001 code)

- `SPEC LOCK APPROVED` → spec wording lands in both specs in one commit batch; then S-001 code (Zod check + 2 tests) lands in a second commit.
- `CHANGES_REQUESTED on wording` → bullet list of wording adjustments.
- `HOLD` → S-001 pauses. F-002's round-2+3 protections continue to carry the load.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
