# Drift Inventory & Fix Plan — 2026-05-17 PM

> **Status:** Awaiting founder approval. NO code change until approved.
> **Discipline rule:** `feedback_find_all_errors_then_plan_then_execute.md` — every error found at once, root-causes named, batched plan, executed as one.
> **Why this exists:** During the deep codebase + docs scan, multiple drift sites were found between the canonical state-machines package and the shipped routes / Zod schemas / tests / today-service. Fixing one at a time would create a thrash loop. This doc names every site, the root causes, and the batched fix.

---

## TL;DR

- **13 CRITICAL drift findings.** All trace to two root causes:
  1. **Visit state vocabulary in shipped code (Zod + route + tests + my new today-service) does not match the canonical `@axhy/state-machines/visit.ts` package.** Canonical 12-state machine was added later; shipped routes were never migrated.
  2. **Mobile tab order in `apps/mobile/app/(supervisor)/_layout.tsx` still on R1 (Chat-first) while R6 design has been Active since 2026-05-12.** Already locked to flip in this sprint.
- Plus 2 MEDIUM findings and 1 LOW finding (schema timestamp gaps, DWI not materialized, etc.) — non-blocking.
- **Most importantly: one design call required before code** — what does the `POST /visits/:id/end` route actually mean in the canonical machine? The current code writes `'ENDED'` (not a canonical state). The canonical flow says workers clock out → photos pending → AI verify → VERIFIED/FLAGGED. The supervisor's "end visit" route either (a) bypasses the machine entirely as an admin override, (b) means `CLOCK_OUT → PHOTOS_PENDING`, or (c) is obsolete and should be removed once worker mobile clocks visits out itself.

---

## Canonical sources of truth (verified at scan time)

| Source                                                          | What it locks                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/state-machines/src/visit.ts:17-29`                    | **VisitState = 12 values:** `SCHEDULED`, `NOTIFIED`, `EN_ROUTE`, `ON_SITE`, `IN_PROGRESS`, `PHOTOS_PENDING`, `AWAITING_VERIFICATION`, `VERIFIED`, `FLAGGED`, `CANCELLED`, `NO_SHOW`, `ARCHIVED`                                                   |
| `packages/state-machines/src/assignment.ts:9`                   | **AssignmentState = 3 values:** `DRAFT`, `ACTIVE`, `TERMINATED`                                                                                                                                                                                   |
| `packages/state-machines/src/worker.ts:17-32`                   | **WorkerState = 15 values:** `INVITED`, `PENDING_ACTIVATION`, `ACTIVE`, `ON_LEAVE`, `ON_SUSPENSION`, `ABSENT`, `AT_RISK`, `BLOCKED`, `DOC_PENDING`, `TRANSFER_PENDING`, `INACTIVE`, `TERMINATION_PENDING`, `TERMINATED`, `ARCHIVED`, `ANONYMIZED` |
| `packages/shared-schema/prisma/schema.prisma:562-580`           | **Attendance.status = 5 strings:** `PRESENT`, `ABSENT_NO_CALL`, `ABSENT_APPROVED_LEAVE`, `HALF_DAY`, `ON_BREAK`                                                                                                                                   |
| `docs/specs/2026-05-12-supervisor-mobile-r6-design.md` (Active) | **R6 tab order:** Today / Decisions / Activity / Chat / Profile                                                                                                                                                                                   |
| `docs/index/canonical-truth.md`                                 | Spec roster — Active vs Unaudited vs Historical                                                                                                                                                                                                   |

---

## Drift sites (all 13 CRITICAL findings, file:line)

### Cluster A — Visit state vocabulary (10 sites, one root cause)

| #   | File:line                                                                | What's wrong                                                                                                                                                                                                                                | Canonical                                                                                                     |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/shared-schema/src/zod/supervisor.ts:324-337`                   | `VisitStateSchema` lists 12 values, but they are: `DRAFT`, `DISPATCHED`, `ARRIVED`, `STARTED`, `IN_PROGRESS`, `ENDED`, `AI_VERIFIED`, `FLAGGED`, `COMPLETED`, `CANCELLED`, `BLOCKED` — almost none of these exist in the canonical machine. | Replace with the 12 canonical values; import from `@axhy/state-machines` or define `z.enum` matching exactly. |
| 2   | `packages/shared-schema/src/zod/supervisor.ts:361-366`                   | `EndVisitOutput.state` hardcodes `z.literal('ENDED')`. `ENDED` is not a canonical state.                                                                                                                                                    | Decide what the route actually transitions to (see Design Call below); update literal accordingly.            |
| 3   | `apps/backend/src/routes/visits.ts:30`                                   | `ENDABLE_STATES = new Set(['STARTED', 'IN_PROGRESS'])` — `STARTED` is not canonical.                                                                                                                                                        | Use canonical priors; e.g. `new Set(['IN_PROGRESS', 'PHOTOS_PENDING'])` depending on Design Call.             |
| 4   | `apps/backend/src/routes/visits.ts:74`                                   | `data: { state: 'ENDED', completedAt: endedAt }` — writes non-canonical `'ENDED'`.                                                                                                                                                          | Per Design Call.                                                                                              |
| 5   | `apps/backend/src/routes/visits.ts:130`                                  | Same as above on the recovery path.                                                                                                                                                                                                         | Per Design Call.                                                                                              |
| 6   | `apps/backend/src/lib/services/today-service.ts:189`                     | `visits.find((v) => v.state === 'COMPLETED')` — `COMPLETED` is not canonical.                                                                                                                                                               | Use canonical: `VERIFIED`, `FLAGGED` (or whichever signals "visit done for the day").                         |
| 7   | `apps/backend/src/lib/services/today-service.ts:24-27`                   | TSDoc references `Visit.state ∈ {IN_PROGRESS, COMPLETED}` — encodes the bug.                                                                                                                                                                | Rewrite comment with canonical mapping.                                                                       |
| 8   | `apps/backend/test/end-visit.test.ts:118, 130, 153, 166`                 | Test seeds `state: 'STARTED'`, `'IN_PROGRESS'`, expects `'ENDED'`. Tests pass against buggy code.                                                                                                                                           | Replace with canonical state seeds + expected transitions per Design Call.                                    |
| 9   | `apps/backend/test/supervisor-today.test.ts:176, 189`                    | Test seeds `state: 'COMPLETED'`. Pass-by-accident.                                                                                                                                                                                          | Replace with canonical `'IN_PROGRESS'` for ongoing and `'VERIFIED'`/`'FLAGGED'` for completed.                |
| 10  | (potential) any mobile / admin-web code consuming `EndVisitOutput.state` | Whatever consumes the existing literal `'ENDED'` will break when fixed.                                                                                                                                                                     | grep + fix in same batch.                                                                                     |

### Cluster B — Mobile IA drift (3 sites, one root cause; already locked to flip)

| #   | File:line                                                    | What's wrong                                                       | Canonical                                                                                          |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 11  | `apps/mobile/app/(supervisor)/_layout.tsx`                   | Tabs ordered as `Chat / Today / Summary / Updates / Profile` (R1). | Flip to `Today / Decisions / Activity / Chat / Profile` (R6).                                      |
| 12  | `apps/mobile/app/(supervisor)/summary.tsx`, `updates.tsx`    | Exist as main-tab stubs; R6 demotes them to secondary surfaces.    | Move out of `(supervisor)/` tab routes; keep as modal/sheet surfaces opened from Today or Profile. |
| 13  | `apps/mobile/app/(supervisor)/decisions.tsx`, `activity.tsx` | Do not exist; R6 requires them as main tabs.                       | Create stubs (R6 shell) for this sprint; populate per agreed scope (honest skeletons).             |

### Medium / Low findings (not blocking)

- **Schema timestamp columns missing** for some canonical Visit transitions: `flaggedAt`, `cancelledAt`, `archivedAt`. Today only `startedAt` and `completedAt` exist. → Additive migration in a follow-up sprint; not required for Today UI to render.
- **DecisionWorkspaceItem table not materialized** — design spec (2026-05-12) calls for a 6-state model. Code currently uses `SupervisorDecision` with `appliedAt`/`dismissedAt` discriminator. → Defer to P1; supervisor sprint can ship Decisions tab as honest skeleton.
- **All 23 ADRs `docs/decisions/0001-*.md` … `0023-*.md` are Unaudited** per canonical-truth.md. → Separate audit pass; doesn't block the sprint.
- **R3 spec still in repo** (`docs/specs/2026-05-11-supervisor-mobile-r3-design.md`) — explicitly superseded by R6. → Will not follow. Safe to leave in place for historical traceability.

### What's actually CLEAN (verified, no drift)

- Assignment state usages — all match canonical 3-state machine.
- Worker state usages — all match canonical 15-state machine.
- Attendance.status usages — all match canonical 5 strings.
- SiteSupervisorBinding field names — all match schema (the P1.5b helpers I built last week are aligned).
- Outbox topic names — follow `<consumer>.<action>` pattern; no drift.
- AuditEvent kinds — intentionally schema-flexible; no enum required.

---

## Root cause table

| Root cause                                                                                                                                                                                                                                                                                                                                              | How it happened                                                                                                                                                        | Sites affected            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **R1: Pre-state-machines code never migrated.** Routes (`visits.ts`) + Zod (`supervisor.ts`) + tests (`end-visit.test.ts`) were written before `@axhy/state-machines/visit.ts` was finalized. When the canonical machine landed, the integration step was skipped.                                                                                      | Inherited from earlier phase; visible only when canonical states are loaded fresh.                                                                                     | Cluster A sites #1–8.     |
| **R2: My today-service was written against the spec, not the code reality.** I read the operations-workflow spec which says 12 canonical states, wrote derivation against those, then wrote tests that seeded canonical-looking-but-different names (`COMPLETED` instead of `VERIFIED`). Tests passed because seed and reader agreed on the wrong name. | I should have grep'd Visit.state writers in the actual code first. The `feedback_planning_decision_rules.md` rule "every claim points to one real thing" was violated. | Cluster A sites #6, 7, 9. |
| **R3: Design spec ahead of mobile code.** R6 spec promoted to Active on 2026-05-12; mobile `_layout.tsx` was never rebased.                                                                                                                                                                                                                             | Normal in active development; already known and queued for this sprint.                                                                                                | Cluster B sites #11–13.   |

---

## Design call required (before any fix code)

**What does `POST /visits/:id/end` actually mean in the canonical machine?**

The canonical machine has no `ENDED` state. It says: `IN_PROGRESS` → CLOCK_OUT → `PHOTOS_PENDING` → photos upload → `AWAITING_VERIFICATION` → AI → `VERIFIED` or `FLAGGED` → eventually `ARCHIVED`.

Three plausible interpretations of the existing route:

- **Interpretation X — Supervisor manual clock-out for the worker.** The route is the supervisor's override when a worker can't clock out themselves (dead phone, lost device, network issue at the site). It performs the CLOCK_OUT transition → state becomes `PHOTOS_PENDING`. Photos either skip (with `photosBefore=0, photosAfter=0`) or get uploaded later.
- **Interpretation Y — Supervisor jumps to `VERIFIED` directly.** The supervisor inspected the work themselves and is confirming "this visit is done, no AI verification needed." State becomes `VERIFIED`. Bypasses photo + AI flow.
- **Interpretation Z — The route is obsolete.** Worker mobile (Phase D) will own clock-out via the canonical machine. The current route was a placeholder before worker mobile existed. Remove or deprecate.

The Today aggregator depends on the answer because "on_site for the day" must include the right set of canonical states.

---

## Proposed fix plan (batched, sequenced)

Once the design call is made:

### Batch 1 — Visit state vocab unification (Cluster A, sites #1–10)

Single atomic commit; tests green at the end, not after each file.

1. **Update Zod** `packages/shared-schema/src/zod/supervisor.ts:324-337`: replace `VisitStateSchema` with the 12 canonical values, importing `VisitStateValue` from `@axhy/state-machines` to enforce single-source.
2. **Update Zod output** `packages/shared-schema/src/zod/supervisor.ts:361-366`: `EndVisitOutput.state` becomes whichever canonical state the route transitions to (Design Call).
3. **Update route** `apps/backend/src/routes/visits.ts:30, 74, 130`: prior-state set + transition target per Design Call.
4. **Update today-service** `apps/backend/src/lib/services/today-service.ts:24-27, 189`: derive on_site from canonical states (e.g. `IN_PROGRESS`, `PHOTOS_PENDING`, `AWAITING_VERIFICATION`, `VERIFIED`); derive no_show from `Attendance.status='ABSENT_NO_CALL'` OR `Visit.state='NO_SHOW'`; derive pending from `SCHEDULED`/`NOTIFIED`/`EN_ROUTE`/`ON_SITE`; derive late from `IN_PROGRESS` with `startedAt > 15min after shiftStart` (current logic, just confirm canonical).
5. **Update tests** `apps/backend/test/end-visit.test.ts:118-166`, `apps/backend/test/supervisor-today.test.ts:176, 189`: seeds use canonical states.
6. **Grep + fix all consumers** of `EndVisitOutput.state` literal `'ENDED'` (mobile, admin-web). I'll grep before edit so no surprise breaks.
7. **Run full backend test suite.** Confirm all visit-touching tests pass. Confirm typecheck.

### Batch 2 — Mobile IA flip (Cluster B, sites #11–13)

Already approved in scope. Single atomic commit.

1. **Update** `apps/mobile/app/(supervisor)/_layout.tsx`: tab order Today / Decisions / Activity / Chat / Profile.
2. **Move** `summary.tsx` and `updates.tsx` out of tab route folder; they become secondary surfaces opened from Today / Profile.
3. **Create** `apps/mobile/app/(supervisor)/decisions.tsx` and `activity.tsx` as honest R6 skeletons (no fake buttons; "Coming with P1 routing" copy where backend not ready).

### Batch 3 — Today UI build (Sub-slice 3 of the original sprint plan)

After Batch 1 + Batch 2 are green and pushed to production main:

1. Build R6-faithful Today components under `apps/mobile/components/today/` per the approved scenarios doc.
2. Visually verify (Playwright + Expo Web on Intel Mac) per `feedback_visual_verification_not_curl.md`.
3. Verify scenario-by-scenario PASS/FAIL/DEFERRED per the features-and-scenarios doc.

### Batch 4 — Other tabs honest-skeleton fill-in (per agreed scope)

Chat audit + finish, Profile polish, Decisions/Activity/Updates R6 shells with proper "Coming with X" copy.

### Batch 5 — End-of-sprint verification

Done memo with scene-by-scene matrix; adversarial panel; push to production main; smoke deployed URL.

---

## What I'm NOT proposing to do (out of scope this sprint, but flagged)

- Schema migration for `flaggedAt` / `cancelledAt` / `archivedAt` timestamp columns — additive migration in a follow-up sprint.
- DecisionWorkspaceItem table + state machine materialization — P1.
- Worker mobile clock-in/out implementation — Phase D.
- HR portal pages — Phase D.
- ADR audit pass (23 unaudited ADRs) — separate hygiene pass.
- Migration to apply pending Prisma migrations to Railway prod (per the deep scan, "PR 1 migration chain locally verified but NOT yet applied to Railway prod" — needs a separate planned deploy moment).

---

## Decision needed from founder

1. **Interpretation X, Y, or Z** for `POST /visits/:id/end` route semantics (Design Call above).
2. **Confirm batched fix order** — Batch 1 first (Visit state vocab), then Batch 2 (mobile IA flip), then Batch 3+ (Today UI per scenarios). Or redirect.
3. **Confirm I should not push Sub-slice 1+2 to production yet** — Sub-slice 1 (mark-absent hardening) is clean and could push standalone; Sub-slice 2 (Today aggregator) has the Visit state bug and should NOT push until Batch 1 lands.

---

**Authored:** 2026-05-17 PM, via comprehensive drift sweep per `feedback_find_all_errors_then_plan_then_execute.md`.
