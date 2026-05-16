# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## Current

| Field                  | Value                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**         | `BETWEEN_SLICES — AWAITING_OWNER_PICK` 2026-05-16 23:00. F-007 round 2 v11 just merged at `79e38aa`; next-slice picker below.                                                                                                                     |
| **Status**             | n/a — between slices                                                                                                                                                                                                                              |
| **Branch**             | `main` at `79e38aa`. Working tree clean.                                                                                                                                                                                                          |
| **Last landed commit** | `79e38aa` — `Merge F-007 round-2 v11 — Notification persistence + audience resolution for supervisor_change (APPROVED at HEAD cbb7646)`                                                                                                           |
| **Dependencies**       | F-001 + F-002 + S-001 + F-003 + F-004 + F-007 — all DONE on main. F-007 produces the immutable Notification rows the next-slice consumers (F-011 OneSignal push delivery + F-006 worker mobile in-app panel + F-012 paid SMS/WhatsApp) will read. |
| **Tests status**       | GREEN at merge — 20/20 files · 123/123 cases on fresh local Postgres 16. F-007 added migration `20260520_f007_notification_supervisor_change_idempotency` (partial unique index + DB CHECK constraint).                                           |
| **Verification gate**  | F-007 = `REAL_DB` met. Next slice picks its own gate at scope time.                                                                                                                                                                               |

## What F-007 round 2 v11 just landed

F-007 ships the canonical persistence layer for `supervisor_change` notifications. When HR creates a binding (acting cover, permanent rebind) or when an acting binding's `effectiveUntil` fires:

1. F-004's `writeHandoffPackage` / F-003's `binding-expire-sweep` emits the source `HANDOFF_PACKAGE_GENERATED` / `BINDING_ENDED_AUTO` AuditEvent + enqueues `notification.supervisor_change` outbox row, **all in the same DB transaction** (Maya P3 invariant — if any one fails, none commit).
2. The dispatcher handler reads the outbox row → resolves audience point-in-time at `effectiveAt` (workers ACTIVE on site with valid assignment windows + outgoing supervisor + incoming permanent supervisor for `acting_end` via point-in-time read at `effectiveUntil + 1ms`) → INSERTs one immutable Notification row per (recipient × channel × site × source-event).
3. Channel set = `push` + `in_app_banner` for user-backed recipients. `Worker.userId IS NULL` exception: `in_app_banner` only.
4. Idempotent replay via ONE partial unique index; P2002 → handler logs `idempotent_skip` and continues.
5. DB CHECK constraint enforces audience mutual exclusion (`(audienceUserId IS NULL) <> (audienceWorkerId IS NULL)`).
6. **ZERO** audit emits from F-007 (`WORKER_SUPERVISOR_CHANGE_NOTIFIED` fires at delivery time in F-011, not at persistence time).
7. Real push delivery deferred to **F-011 (OneSignal SDK + identity linking + adapter + delivery-time audit emit)**. In-app panel UI deferred to **F-006**. SMS/WhatsApp deferred to **F-012**.

## Next-slice candidates (owner picks)

| ID     | Title                                                               | Why now                                                                                                                                                                                                                                                                                                                 | Recommended?                                  |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| F-011  | **OneSignal mobile SDK + identity linking + push delivery adapter** | Closest vertical-slice consumer of F-007 — turns the persisted `push` rows into actual push notifications. Needs F-006 mobile app to host the SDK; owner may want to do F-006 + F-011 together as one mobile-app+adapter slice, OR F-011 backend-adapter first (with mock SDK call) for the pure-backend feedback loop. | ✓ — closest vertical-slice extension of F-007 |
| F-006  | **Worker + supervisor mobile in-app notification panel**            | Our own panel reading from the F-007 Notification table. Closes Suresh audit W-1/W-2/W-7 lived-experience pain (Lakshmi appears with no signal). Requires the mobile app scaffold to exist.                                                                                                                             | ✓ — pairs naturally with F-011                |
| F-005  | **Admin-web HR portal scaffold**                                    | Closure §4 + Decision 1. 9 HR workflows are BACKEND_READY but have no HR portal surface. Kavitha persona benefit. Unblocks F-008 bootstrap-seed-review UI.                                                                                                                                                              |                                               |
| F-008  | **Bootstrap-seed migration + HR review UI**                         | Closure Decision 6 + responsibility-model pick 8. Onboarding new tenants. Depends on F-005.                                                                                                                                                                                                                             |                                               |
| F-009  | **Project memory service (Postgres + pgvector retrieval)**          | Discipline-gap fix surfaced during F-004 scope drift. Eligible now (F-004 DONE).                                                                                                                                                                                                                                        |                                               |
| F-010  | **Handoff v2 / client-context expansion**                           | Suresh Pillai panel finding — client preferences transfer beyond F-004's siteRules-only scope. Eligible now (F-004 DONE).                                                                                                                                                                                               |                                               |
| F-007b | **Supervisor burst-grouping digest (optional follow-up)**           | Only if F-006 UI aggregation alone proves insufficient at field testing. Defer until production observation.                                                                                                                                                                                                            |                                               |
| F-012  | **SMS + WhatsApp adapter (paid)**                                   | AWAITING_OWNER_GO_ON_PAID_CHANNELS. Closes the `Worker.userId IS NULL` delivery gap via `Worker.phone`.                                                                                                                                                                                                                 |                                               |

**Recommended order (per vertical-slices methodology):**

1. **F-006 + F-011 together** — small mobile-app scaffold + OneSignal SDK install + identity linking + delivery adapter. Closes Suresh audit pain end-to-end (worker actually receives a push when supervisor changes).
2. Then **F-005** — HR portal so HR has a surface to drive bindings from.
3. Then **F-008 / F-009 / F-010 / F-012** in owner preference order.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly.

## F-001..F-007 closure summary (for cross-slice context)

| Slice                                  | Status                             | Approval at    | Friend's verbatim                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-001 (binding-effective-routing)      | DONE                               | —              | —                                                                                                                                                                                  |
| F-002 (chat-writes-proposed-decisions) | DONE (merged `a29f9f6`)            | HEAD `12c1df6` | "P1 is really fixed · P2 is really fixed enough for approval · APPROVED."                                                                                                          |
| S-001 (same-day-supervisor-freeze)     | DONE (merged `a29f9f6`)            | HEAD `2a0f27c` | "I do not see a new code bug or a new tracker-truth bug · Decision: APPROVED."                                                                                                     |
| F-003 (cron + binding-expire-sweep)    | DONE (merged `2bc815b`)            | HEAD `c4c335b` | "The round-2 review cleanup is real · Decision: APPROVED."                                                                                                                         |
| F-004 (HandoffPackage composer)        | DONE (merged `b19e03c` 2026-05-16) | HEAD `ef0aadd` | "APPROVED. I verified the actual repo at HEAD `ef0aadd`. The last stale writer comment is fixed. F-004 is approved for merge."                                                     |
| F-007 (Notification persistence)       | DONE (merged `79e38aa` 2026-05-16) | HEAD `cbb7646` | "CODE: APPROVED. Owner can push this branch and merge to main." (after v11 plan + 11-voice panel test + scope round-2 v11 review + code round-1 + code round-2 fix-up — all green) |
