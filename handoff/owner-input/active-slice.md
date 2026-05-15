# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** the closure spec lists four crons the system needs (`binding-expire-sweep`, `decision-expire-sweep`, `hr-queue-age-escalation`, `hr-availability-sweep`), but only one cron exists in the codebase today (`reset-ai-spend`). Without the framework + first sweep, bindings can't auto-expire when `effectiveUntil` passes, "while you were out" digests can't fire, decisions can't auto-expire when their tier deadline passes, and HR queue items can't escalate. Every downstream slice (F-004 HandoffPackage composer, F-005 HR portal, F-007 notification dispatcher) eventually needs one of these sweeps to be real.

**Simplest business rule:** add a small cron framework that runs short idempotent "sweep" jobs on a schedule. Start with `binding-expire-sweep`: any SiteSupervisorBinding whose `effectiveUntil` has passed AND whose `endedAt` is still NULL gets `endedAt` set to `effectiveUntil` AND a `BINDING_ENDED_AUTO` AuditEvent emitted. Idempotent (re-runs are no-ops). Future sweeps land in subsequent slices using the same framework.

**Code (only after scope-artifact approval):** new `apps/backend/src/jobs/` dir + cron framework module + `binding-expire-sweep` job + real-DB integration test. Single Prisma transaction per sweep. No new schema field; `BINDING_ENDED_AUTO` AuditEvent kind is already in the spec catalogue (closure §11). The framework follows the same shape as the existing `reset-ai-spend` cron.

**Why scope first:** F-003 is a medium-major change (new infra dir + scheduling pattern + first auto-mutation of `SiteSupervisorBinding` rows). Per `feedback_plan_mode_for_medium_major_changes.md` discipline lock, plan-mode + scope artifact + owner approval must come BEFORE code. The scope artifact will surface trade-offs (in-process vs OS cron, run-cadence pick, what happens if a sweep fails mid-batch, multi-replica deduplication, S-001 interaction — does the sweep itself count as a "responsibility change today" or is it always-allowed because it just bookkeeps an already-expired binding).

## Current

| Field                  | Value                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**         | `cron-framework-binding-expire-sweep` (F-003)                                                                                                                                                        |
| **Status**             | `PLANNED — AWAITING_SCOPE_APPROVAL` (scope artifact draft to land at `handoff/feature-queue/scopes/F-003.md`; owner + friend approve picks; then code)                                               |
| **Branch**             | `feat/layer-1-core-primitives` (current) — note: F-002 + S-001 are both APPROVED on this branch but not yet DONE (DONE = merged to main); merge to main is a separate ops step at owner's discretion |
| **Last landed commit** | `2a0f27c` — `docs(handoff): propagate ab4d9a2 into S-001 control surface (S-001.4)` (S-001 closure tracker propagation; S-001 is APPROVED)                                                           |
| **Dependencies**       | F-001 (APPROVED 2026-05-15), F-002 (APPROVED 2026-05-16), S-001 (APPROVED 2026-05-16) — all met                                                                                                      |
| **Tests status**       | n/a — code not started; scope phase                                                                                                                                                                  |
| **Verification gate**  | will be `REAL_DB` once code lands                                                                                                                                                                    |

## What the F-003 scope artifact needs to lock (open picks for owner + friend)

These are surfaced as scope-stage questions; no code lands until they are answered.

1. **Scheduler shape** — in-process `setInterval` / `node-cron` package / external Postgres `pg_cron` / OS-level cron firing an HTTP endpoint? Trade-off: in-process is simplest but doesn't survive single-replica restart cleanly and double-fires on multi-replica; pg_cron is at-most-once across the cluster but couples scheduling to the DB; OS-cron + HTTP endpoint is what `reset-ai-spend` already does — favoured for consistency unless there's a strong reason to diverge.
2. **Run cadence for `binding-expire-sweep`** — every minute? every 5 minutes? every hour? Trade-off: minute-cadence keeps expiry close to real-time for downstream consumers (e.g. F-004 "while you were out" digest at the moment of binding end) but burns ~1440 no-op queries/day per tenant; hourly is cheaper but introduces up to an hour of staleness in "currently effective" computed in callers that bypass `getEffectiveBinding` and trust `endedAt` instead. Recommended pick: **every minute** at launch (cheap query, tight downstream UX), revisit if cost matters.
3. **S-001 interaction** — does the sweep count as a "responsibility change today"? Argument it does NOT: the sweep just bookkeeps an `effectiveUntil` that was already locked at create-time + already passed; the responsibility-change moment was when HR set the `effectiveUntil`, not when the sweep observed it. Recommended pick: **sweep is exempt** — the S-001 guard runs on writes-that-set-effectiveFrom-or-effectiveUntil, not on the sweep's `endedAt` bookkeeping.
4. **Failure handling** — sweep crashes mid-batch: leave partial state + retry next tick (idempotent, fine since `endedAt IS NULL` predicate naturally filters already-swept rows) or wrap each row in its own short transaction (slower but stronger isolation)? Recommended pick: **one tx per row** at launch for clearest audit + simplest reasoning; can batch later if the row count grows.
5. **Multi-replica deduplication** — if backend ever runs 2+ replicas, two replicas may both fire the sweep at the same minute. Either coordinate via Postgres advisory lock per-job-name, or accept that idempotency (count=0 on the second runner) is enough. Recommended pick: **rely on idempotency** at launch; advisory lock added later if needed.
6. **Audit emit** — new `BINDING_ENDED_AUTO` AuditEvent kind exists in the closure spec catalogue (§11); payload shape needs locking: `{ bindingId, siteId, userId, effectiveUntil, sweptAt }`?

## What this slice does NOT do

- Does not implement `decision-expire-sweep`, `hr-queue-age-escalation`, or `hr-availability-sweep` — those are separate later slices on top of the same framework.
- Does not introduce a new entity. `BINDING_ENDED_AUTO` AuditEvent kind is already catalogued.
- Does not change the S-001 guard. Sweep is the bookkeeping side of a binding lifecycle event whose responsibility-change instant already locked at create-time.
- Does not auto-merge `feat/layer-1-core-primitives` to main. Merge is a separate owner-driven step.

## F-002 + S-001 closure summary (kept for cross-slice context)

| Slice                                  | Status              | Approval at    | Friend's verbatim                                                                                                                                                       |
| -------------------------------------- | ------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-002 (chat-writes-proposed-decisions) | APPROVED 2026-05-16 | HEAD `12c1df6` | "P1 is really fixed · P2 is really fixed enough for approval · handoff/control state is consistent · APPROVED."                                                         |
| S-001 (same-day-supervisor-freeze)     | APPROVED 2026-05-16 | HEAD `2a0f27c` | "Final tracker propagation is clean. The last remaining control-surface mismatch is fixed. I do not see a new code bug or a new tracker-truth bug. Decision: APPROVED." |

Both are ready to be marked DONE once branch merges to main.

**S-001 final commit chain:** `2835e84` (spec lock) · `d234e77` (helper + wire + 5 new tests + 4 adapted) · `8e763f8` (tracker → AWAITING_APPROVAL) · `ab4d9a2` (control-surface cleanup) · `2a0f27c` (final tracker propagation). Full real-DB sweep: 17 files · 84 cases, all green on fresh local Postgres 16.

Friend's standing verification-shell limitation noted across both approvals: pnpm / Vitest startup hits a local Rollup native-module/code-signing issue, so friend's approvals are file-grounded, not fresh-test-grounded. The Docker container `axhy-test-pg` remains running for any future replay.

## Reproduction (F-002 + S-001 baseline; applies until F-003 code lands new tests)

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

Expected: 17 files, 84 cases, all green.

## Decision needed (owner + friend, before any F-003 code)

- `SCOPE: GO with default picks (1: OS-cron + HTTP endpoint, 2: every-minute, 3: sweep exempt from S-001, 4: one tx per row, 5: rely on idempotency, 6: BINDING_ENDED_AUTO payload as above)` → I draft the scope artifact at `handoff/feature-queue/scopes/F-003.md` capturing the picks; on owner sign-off, code begins.
- `SCOPE: change picks` → name what to change.
- `HOLD` → F-003 pauses; surface a different next slice instead (e.g. F-004 HandoffPackage composer, F-005 HR portal scaffold, or a separate cleanup).
- `MERGE FIRST` → owner merges `feat/layer-1-core-primitives` to main first to graduate F-002 + S-001 from APPROVED to DONE; F-003 picks up after.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
