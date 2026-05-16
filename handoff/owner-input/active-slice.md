# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English (re-scoped 2026-05-16 per owner directive)

**Problem (re-scoped):** when an acting supervisor's cover window ends, two things should happen — (1) responsibility flips back to the permanent supervisor (or to whatever binding underlies the acting one), and (2) downstream side effects fire (audit row, "while you were out" digest, notifications). The first is already done by `getEffectiveBinding` (read-time filter `effectiveFrom <= at AND (effectiveUntil IS NULL OR effectiveUntil > at) AND endedAt IS NULL` — the moment `effectiveUntil` passes, the acting binding naturally falls out of the result set). The second has no trigger — there is no scheduled job that observes "this binding just expired" and emits the audit + digest.

**Simplest business rule:** add a small cron framework. Start with `binding-expire-sweep` whose ONLY job is the side-effect side of an already-completed time-based expiry: for each binding whose `effectiveUntil` has just passed and that has not yet been processed, emit a `BINDING_ENDED_AUTO` AuditEvent. The sweep does NOT decide who is responsible — that decision is already time-based and already correct in `getEffectiveBinding`. Future sweeps land in later slices using the same framework: `decision-expire-sweep`, `flagged-visit-auto-escalate`, `hr-queue-age-escalation`, `hr-availability-sweep`, plus the "while you were out" digest generator.

**Code (only after scope-artifact approval):** new `apps/backend/src/jobs/binding-expire-sweep.ts` + wire-in line inside `apps/backend/src/dispatcher/index.ts:tick` next to the existing `maybeResetAiSpend` call + real-DB integration test. **Piggybacks on the existing outbox dispatcher tick** (the actual existing pattern, verified pre-code in `dispatcher/index.ts:174-189`) — NOT a new OS-cron entry, NOT a new HTTP endpoint. The sweep work fires every 5 minutes via an in-memory `lastSweepInstant` marker, even though the dispatcher itself ticks every ~2 seconds. Per-binding work in its own short transaction (independent side effects; one row failing must not block the others). `BINDING_ENDED_AUTO` AuditEvent kind already in the closure-spec catalogue (§11). Run cadence locked at **every 5 minutes** per closure spec §10 (line 560).

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

| Field                             | Value                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Slice name**                    | `cron-framework-binding-expire-sweep` (F-003)                                                                                                                                                                                                          |
| **Status**                        | `AWAITING_APPROVAL` (code slice complete on dispatcher-piggyback pattern; 18/18 test files green · 92/92 cases pass; stop for review per friend's execution rule)                                                                                      |
| **Branch**                        | `feat/f-003-cron-framework` (forked from main `a29f9f6` after F-002 + S-001 merged DONE)                                                                                                                                                               |
| **Last landed commit**            | `737c066` — `feat(jobs): binding-expire-sweep + dispatcher wire-in + audit payload schema (F-003.1, 8 tests / 92/92 cases green)`                                                                                                                      |
| **F-003 commits (oldest→newest)** | `39b47b8` (scope LOCKED + A-vs-B record on feat/layer-1-core-primitives) · `a29f9f6` (merge of F-001 + F-002 + S-001 + scope to main) · `74c1e9d` (pick 1 corrected pre-code — dispatcher-tick piggyback, not OS-cron + HTTP) · `737c066` (code slice) |
| **Dependencies**                  | F-001 + F-002 + S-001 — all APPROVED + DONE (merged to main at `a29f9f6`)                                                                                                                                                                              |
| **Tests status**                  | **18/18 test files green · 92/92 cases pass** on fresh local Postgres 16 (84 baseline + 8 F-003 new). One full sweep, ~20s.                                                                                                                            |
| **Verification gate**             | `REAL_DB` — fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432), all migrations applied.                                                                                                                                             |

## Two contradictions in the prior draft (caught by friend 2026-05-16, fixed here)

1. **Transaction shape was inconsistent.** Prior draft said "Single Prisma transaction per sweep" in the Code section AND "one tx per row at launch" in pick 4 — those describe different designs and would produce different failure behavior. Resolved below: **one tx per row** (per-row side effects are independent; if one row's audit-emit fails, the others must still succeed). The Code section above and pick 4 below now match.
2. **Run cadence was inconsistent with the spec.** Prior draft recommended every minute; closure spec §10 (line 560) already locks **every 5 minutes**. The spec wins. Cadence pick below is now closed at the spec value.

## What the F-003 scope artifact needs to lock (open picks for owner + friend)

These are surfaced as scope-stage questions; no code lands until they are answered. Picks marked CLOSED below are already determined by existing spec or by friend's 2026-05-16 fix.

1. **Scheduler shape** — **CORRECTED 2026-05-16 pre-code:** the original wording said "OS-cron + HTTP endpoint, matches `reset-ai-spend`". Pre-code verification of `apps/backend/src/jobs/reset-ai-spend.ts` + `apps/backend/src/dispatcher/index.ts:174-189` showed the existing pattern is actually **dispatcher-tick piggyback** — `maybeResetAiSpend` is called on every dispatcher tick (~2s) with an in-memory date marker so the actual reset fires only at UTC midnight. Truthful pick: **piggyback on the existing outbox dispatcher tick** — add `maybeRunBindingExpireSweep(client, log)` next to the `maybeResetAiSpend` call in `dispatcher/index.ts:180` and gate it with an in-memory `lastSweepInstant` marker so the sweep fires every 5 minutes. No new HTTP route, no OS-cron entry, no new scheduler infrastructure. Direction unchanged (polling-style, in-process, idempotent).
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
- **Closure-spec wording amendment** — landed in the same commit as this re-scope (per friend's directive that the spec match the re-scope before F-003 coding starts). Two lines amended in `docs/specs/2026-05-15-workflow-design-closure.md`:
  - §3.1 Binding lifecycle (line 175): now spells out that the `effectiveUntil`-path ACTIVE → ENDED transition is time-based and read-time-evaluated via `getEffectiveBinding`; cron is for the side-effect side only.
  - §10 Cron jobs (line 560): "Closes any binding ... Generates 'while you were out' digest" → "Side-effect emit only — NOT a responsibility switch ... emits `BINDING_ENDED_AUTO` ... does NOT mutate the binding row ... digest is a separate downstream consumer that lands in its own slice."
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

**Code slice complete 2026-05-16.** Scope locked at `39b47b8` (Approach A approved, B rejected, A-vs-B record permanently in `handoff/feature-queue/scopes/F-003.md` §3). Pick 1 corrected pre-code at `74c1e9d` (dispatcher-tick piggyback, not OS-cron). Code landed at `737c066`. F-002 + S-001 merged to main at `a29f9f6` (now DONE). F-003 awaits friend's file-grounded review.

## How the F-003 scope picks map to the landed code

| Pick                   | Locked value                                                                             | Where it lands in code                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Scheduler shape     | Dispatcher-tick piggyback (corrected pre-code)                                           | `apps/backend/src/dispatcher/index.ts:tick` adds `maybeRunBindingExpireSweep` next to `maybeResetAiSpend`. Same `.catch()` wrapper. No HTTP route, no OS-cron entry.                  |
| 2. Run cadence         | Every 5 min (per closure spec §10 line 560)                                              | `SWEEP_INTERVAL_MS = 5 * 60 * 1000` in `binding-expire-sweep.ts`. In-memory `lastSweepInstant` marker gates the sweep work even though dispatcher tick fires every ~2s.               |
| 3. S-001 interaction   | Sweep exempt                                                                             | Sweep does not mutate the binding row, only emits an audit. Documented at the top of `binding-expire-sweep.ts`.                                                                       |
| 4. Transaction shape   | One tx per row                                                                           | `emitAuditForOneBinding` wraps each row in its own `client.$transaction(...)`. Per-row failure caught + logged + counted; batch continues.                                            |
| 5. Multi-replica dedup | Rely on idempotency                                                                      | Audit-existence check inside the per-row tx is the dedup mechanism. Verified by test case 8 (pre-seeded audit row → skipped).                                                         |
| 6. Audit payload       | `{ bindingId, siteId, userId, actingForUserId, effectiveFrom, effectiveUntil, sweptAt }` | New `BindingEndedAutoPayloadSchema` in `packages/shared-schema/src/zod/audit-payloads.ts`. Validated via `recordBindingEndedAuto` typed helper in `site-supervisor-binding.ts`.       |
| 7. Idempotency marker  | Audit-existence check (no schema change)                                                 | `findBindingsNeedingAuditEmit` queries expired bindings, then filters out those that already have a `BINDING_ENDED_AUTO` audit row. Defense-in-depth re-check inside each per-row tx. |

## What landed (file inventory)

- **NEW** `apps/backend/src/jobs/binding-expire-sweep.ts` — `maybeRunBindingExpireSweep` + `_resetSweepMarkerForTesting` + internal helpers (`emitAuditForOneBinding`, `findBindingsNeedingAuditEmit`).
- **WIRED** `apps/backend/src/dispatcher/index.ts` — added import + one line in `tick()` calling the sweep next to `maybeResetAiSpend`, both `.catch()`-wrapped so a failure never breaks the outbox-poll loop.
- **NEW** `packages/shared-schema/src/zod/audit-payloads.ts` — `BindingEndedAutoPayloadSchema` + `BindingEndedAutoPayload` type.
- **WIRED** `apps/backend/src/lib/site-supervisor-binding.ts` — `recordBindingEndedAuto` typed helper (Zod-parses payload + hardcodes kind).
- **NEW** `apps/backend/test/binding-expire-sweep.test.ts` — 8 real-DB integration cases (audit emit · idempotency · no-mutate · routing-unchanged · skip-manually-ended · first-boot · cadence gate · pre-seeded-audit skip + other-row continues).

## What this slice does NOT do (preserved from scope §6)

- Does not implement `decision-expire-sweep`, `flagged-visit-auto-escalate`, `hr-queue-age-escalation`, `hr-availability-sweep` — separate later slices on the same framework.
- Does not implement the "while you were out" digest — separate downstream-consumer slice.
- Does not introduce a new entity. `BINDING_ENDED_AUTO` audit kind already catalogued (closure spec §11).
- Does not mutate the binding row (`endedAt` stays NULL on auto-expired rows — historical point-in-time queries via `getEffectiveBinding` continue to work).
- Does not change the S-001 guard.
- Does not push or merge `feat/f-003-cron-framework` — that's a separate ops step after friend's approval.

## P10 failure matrix for F-003

| Question                                                       | Answer                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?                     | (1) Every binding whose `effectiveUntil` has passed gets exactly one `BINDING_ENDED_AUTO` audit row. (2) The sweep does not mutate the binding row. (3) Re-running the sweep is a no-op.                                                                                                                               |
| How is each invariant enforced?                                | (1) `findBindingsNeedingAuditEmit` filters expired rows that already have audit, then emits one audit per remaining row. (2) Sweep code never writes to `siteSupervisorBinding` — only reads. (3) Audit-existence check at both the find-step and inside each per-row tx (defense-in-depth).                           |
| What happens on per-row failure?                               | Per-row catch logs + increments `failed` counter; the batch continues with remaining rows. Next sweep tick picks the failed row up again automatically (the audit-existence predicate filters out rows that succeeded).                                                                                                |
| What happens on batch-level failure (e.g. find query crashes)? | Outer catch logs + returns `{ran: false}` WITHOUT advancing the marker. Next tick retries the whole batch. The dispatcher's outbox-poll loop continues unaffected.                                                                                                                                                     |
| What happens on multi-replica races?                           | Both replicas' find queries return the same candidate set. Each runs per-row tx with a defense-in-depth audit-existence re-check inside the tx — only the first replica's tx commits the audit; the second's re-check finds the audit already exists and returns early. No duplicate audits, no constraint violations. |
| What happens for getEffectiveBinding consumers?                | Unchanged. The sweep does not mutate the binding row; `endedAt` stays NULL. Historical queries at `at < effectiveUntil` continue to return the binding correctly. Verified by test case 4.                                                                                                                             |
| What happens for S-001 interaction?                            | Sweep is exempt. The S-001 guard runs on writes that set `effectiveFrom` / `effectiveUntil`; the sweep emits side-effect audit only and does not call any HR API path.                                                                                                                                                 |
| What is still deferred?                                        | Other sweep jobs (decision-expire, flagged-visit-auto-escalate, hr-queue-age-escalation, hr-availability-sweep); "while you were out" digest; notification dispatcher F-007; multi-replica advisory lock; `Company.timeZone` column.                                                                                   |

## Reproduction (full 18-file sweep)

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
  test/same-day-supervisor-freeze.test.ts \
  test/binding-expire-sweep.test.ts
```

Expected: 18 files, 92 cases, all green (84 prior baseline + 8 new F-003 cases).

## Decision needed on F-003 code

- `APPROVED` → slice moves to APPROVED; ready to merge `feat/f-003-cron-framework` to main.
- `CHANGES_REQUESTED` (bullet list) → name what to change.
- `HOLD` → F-003 code pauses; next slice instead.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
