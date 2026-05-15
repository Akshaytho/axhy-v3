# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English (re-scoped 2026-05-16 per owner directive)

**Problem (re-scoped):** when an acting supervisor's cover window ends, two things should happen — (1) responsibility flips back to the permanent supervisor (or to whatever binding underlies the acting one), and (2) downstream side effects fire (audit row, "while you were out" digest, notifications). The first is already done by `getEffectiveBinding` (read-time filter `effectiveFrom <= at AND (effectiveUntil IS NULL OR effectiveUntil > at) AND endedAt IS NULL` — the moment `effectiveUntil` passes, the acting binding naturally falls out of the result set). The second has no trigger — there is no scheduled job that observes "this binding just expired" and emits the audit + digest.

**Simplest business rule:** add a small cron framework. Start with `binding-expire-sweep` whose ONLY job is the side-effect side of an already-completed time-based expiry: for each binding whose `effectiveUntil` has just passed and that has not yet been processed, emit a `BINDING_ENDED_AUTO` AuditEvent. The sweep does NOT decide who is responsible — that decision is already time-based and already correct in `getEffectiveBinding`. Future sweeps land in later slices using the same framework: `decision-expire-sweep`, `flagged-visit-auto-escalate`, `hr-queue-age-escalation`, `hr-availability-sweep`, plus the "while you were out" digest generator.

**Code (only after scope-artifact approval):** new `apps/backend/src/jobs/` dir + cron framework module + `binding-expire-sweep` job + real-DB integration test. The framework follows the same shape as the existing `reset-ai-spend` cron (OS-cron + HTTP endpoint). Per-binding work in its own short transaction (independent side effects; one row failing must not block the others). `BINDING_ENDED_AUTO` AuditEvent kind already in the closure-spec catalogue (§11). Run cadence locked at **every 5 minutes** per closure spec §10 (line 560).

**Why scope first:** F-003 is medium-major (new infra dir + scheduling pattern). Per `feedback_plan_mode_for_medium_major_changes.md`, scope artifact + owner approval must come BEFORE code. Open picks below.

## Owner's re-scope directive (verbatim, 2026-05-16)

> "For supervisor responsibility itself, I do NOT want cron to be the source of truth. Use effective-dated bindings as the truth. If a binding has effectiveFrom/effectiveUntil, then current responsibility should switch automatically by read-time logic. So for acting supervisor coverage: no cron needed to decide who is current supervisor; read-time effective binding logic should handle that. Cron is only acceptable for secondary effects: BINDING_ENDED_AUTO audit/event, while-you-were-out digest, notifications, cleanup/materialized bookkeeping if needed. Re-scope F-003 accordingly: do not make cron responsible for supervisor switching; make cron responsible only for post-expiry side effects."

This matches mature enterprise patterns: Oracle / Workday / SAP all use effective-dated records as the source of truth for "who owns this responsibility now," and scheduled jobs handle side effects (downstream events, notifications, cleanup). The owner's directive aligns Axhy with that pattern.

**What is already correctly time-based in the codebase (verified at HEAD `361acf5`):**

- `getEffectiveBinding` in `apps/backend/src/lib/effective-responsibility.ts:62-86` — the predicate `effectiveFrom <= at AND (effectiveUntil IS NULL OR effectiveUntil > at) AND endedAt IS NULL` correctly excludes an acting binding the instant `effectiveUntil` passes, with no cron needed. Acting precedence over permanent is applied in-memory after the read. This is the source of truth for current responsibility.

**What still needs cron (the actual F-003 scope):**

- Emit `BINDING_ENDED_AUTO` AuditEvent for each binding whose `effectiveUntil` just passed. Downstream consumers (notification dispatcher F-007, digest generator, audit-trail reports) need this event signal.
- (Later slices on the same framework) Generate "while you were out" digest for the returning supervisor. Fire notifications. Process `decision-expire-sweep`. Etc.

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

## Two contradictions in the prior draft (caught by friend 2026-05-16, fixed here)

1. **Transaction shape was inconsistent.** Prior draft said "Single Prisma transaction per sweep" in the Code section AND "one tx per row at launch" in pick 4 — those describe different designs and would produce different failure behavior. Resolved below: **one tx per row** (per-row side effects are independent; if one row's audit-emit fails, the others must still succeed). The Code section above and pick 4 below now match.
2. **Run cadence was inconsistent with the spec.** Prior draft recommended every minute; closure spec §10 (line 560) already locks **every 5 minutes**. The spec wins. Cadence pick below is now closed at the spec value.

## What the F-003 scope artifact needs to lock (open picks for owner + friend)

These are surfaced as scope-stage questions; no code lands until they are answered. Picks marked CLOSED below are already determined by existing spec or by friend's 2026-05-16 fix.

1. **Scheduler shape** — in-process `setInterval` / `node-cron` package / external Postgres `pg_cron` / OS-level cron firing an HTTP endpoint? Trade-off: in-process is simplest but doesn't survive single-replica restart cleanly and double-fires on multi-replica; pg_cron is at-most-once across the cluster but couples scheduling to the DB; OS-cron + HTTP endpoint is what `reset-ai-spend` already does — favoured for consistency unless there's a strong reason to diverge. Recommended pick: **OS-cron + HTTP endpoint** (matches `reset-ai-spend`).
2. **Run cadence for `binding-expire-sweep`** — **CLOSED: every 5 minutes** per closure spec §10 line 560. The prior "every minute" recommendation was a spec contradiction and is withdrawn.
3. **S-001 interaction** — does the sweep count as a "responsibility change today"? The sweep does NOT change responsibility (responsibility already switched the instant `effectiveUntil` passed, at read-time, in `getEffectiveBinding`); the sweep emits side-effect audit only. Recommended pick: **sweep is exempt from the S-001 guard** — S-001 runs on writes that set `effectiveFrom` / `effectiveUntil`, not on side-effect audit emit.
4. **Failure handling and transaction shape** — **one tx per row**. Per-row side effects (the audit emit; later, the digest generation; later, the notification fan-out) are independent. If one row's work fails the others must still succeed. A whole-sweep tx would amplify any single failure into a total rollback — undesirable for side-effect work. The "Code" section above is consistent with this pick.
5. **Multi-replica deduplication** — if backend ever runs 2+ replicas, two replicas may both fire the sweep at the same minute. Either coordinate via Postgres advisory lock per-job-name, or accept that idempotency (the marker chosen in pick 7 ensures the second runner finds nothing to do) is enough. Recommended pick: **rely on idempotency** at launch; advisory lock added later if cost is observed.
6. **`BINDING_ENDED_AUTO` audit payload shape** — closure spec catalogue (§11) names the kind; payload needs locking. Recommended pick: `{ bindingId, siteId, userId, actingForUserId, effectiveFrom, effectiveUntil, sweptAt }`.
7. **Idempotency marker (new pick — flagged by re-scope)** — the sweep must not re-emit `BINDING_ENDED_AUTO` for the same binding on every 5-minute tick. Two clean options:
   - **(a) audit-existence check.** Sweep query: `effectiveUntil <= now AND NOT EXISTS (SELECT 1 FROM AuditEvent WHERE kind='BINDING_ENDED_AUTO' AND targetId = binding.id)`. No schema change. Slightly more expensive query but fine at 5-min cadence.
   - **(b) new column `autoExpireProcessedAt` on `SiteSupervisorBinding`.** Cheap query. Adds a column whose only purpose is sweep bookkeeping. Schema migration required.
   - **NOT (c):** set `endedAt = effectiveUntil`. ❌ This would break point-in-time historical queries because `getEffectiveBinding` filters by `endedAt IS NULL` and would then incorrectly exclude this binding from queries at past instants `at < effectiveUntil`. Endedat must remain reserved for manual early-termination, not auto-expiry bookkeeping.
   - Recommended pick: **(a) audit-existence check** — no schema change; matches owner's directive ("no schema cleanup unless needed").

## What this slice does NOT do

- **Does not change who is the current supervisor for any site.** Responsibility switching is already time-based and read-time-evaluated by `getEffectiveBinding`; the sweep is post-expiry side effects only.
- Does not implement `decision-expire-sweep`, `flagged-visit-auto-escalate`, `hr-queue-age-escalation`, or `hr-availability-sweep` — those are separate later slices on top of the same framework.
- Does not implement the "while you were out" digest. That is a downstream consumer of `BINDING_ENDED_AUTO` and lands in its own slice once the audit emit is reliable.
- Does not introduce a new entity. `BINDING_ENDED_AUTO` AuditEvent kind is already catalogued (closure spec §11).
- Does not change the S-001 guard. Sweep emits side-effect audit only.
- Does not set `endedAt` on auto-expired bindings (would break historical point-in-time queries via `getEffectiveBinding`).
- Does not amend the closure spec wording at line 560 ("Closes any binding") — that wording can be read as "cron decides who's responsible," which contradicts the re-scope. A small clarifying spec amendment to line 560 should land as part of the F-003 scope artifact: "emits `BINDING_ENDED_AUTO` for any binding whose `effectiveUntil` has passed" (drop the misleading "Closes"). The amendment is a docs change, not a code change.
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
