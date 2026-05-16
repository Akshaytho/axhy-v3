# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** when HR creates a binding (acting cover, permanent rebind) or when an acting binding's `effectiveUntil` fires, F-003 + F-004 emit AuditEvent rows but **no notification reaches the affected workers or the involved supervisors**. The Suresh audit (W-1 / W-2 / W-7) flagged this as the largest open product gap: workers walk into a site and a different person is supervising, with no signal at all. The Notification table + Zod schemas already exist (`Notification` model in `schema.prisma:931`, `NotificationKindSchema` in `zod/notification.ts`) — what's missing is the writer that turns the audit events into Notification rows.

**Simplest business rule:** when `HANDOFF_PACKAGE_GENERATED` (F-004) or `BINDING_ENDED_AUTO` (F-003) fires, F-007 fans out per closure §7 audience rules — affected workers (`Assignment.state='ACTIVE'` on the site at the event timestamp) + outgoing supervisor + incoming supervisor. Each audience entry gets one Notification row per channel (`in_app_banner` real + `push`/`sms`/`whatsapp_out`/`email` log-stub per Open Q1). Coalesce multi-binding events for the same supervisor pair within a 60-second window (closure §7). Emit `WORKER_SUPERVISOR_CHANGE_NOTIFIED` audit per worker row (closure Decision 4). No new schema table; partial unique index added for idempotent replay.

**Code (only after scope-artifact approval):** new `apps/backend/src/lib/notification-composer.ts` (`composeSupervisorChangeNotifications`) + new dispatcher handler at `apps/backend/src/dispatcher/handlers/notifications.ts`. One-line edits to `handoff-package-writer.ts` + `binding-expire-sweep.ts` adding `enqueueOutbox(tx, { topic: 'notification.supervisor_change', payload: { sourceAuditId, bindingId, eventKind } })` inside their existing txs. Real-DB integration tests verify audience resolution + coalescing + idempotent replay + cross-tenant isolation + localisation + edge cases.

**Why this code is necessary:** Decision 4 (closure §5) makes worker-side supervisor-change notification MANDATORY. The audit pain (Suresh Month 8a / 9a) is concrete: Lakshmi appears at Suresh's site, no notification, no way to know who to call when something goes wrong. F-007 is the natural F-003/F-004 consumer — it tests whether the audit events that F-003/F-004 emit are sufficient shape for downstream notification needs (vertical-slice feedback loop per `feedback_vertical_slices_not_backend_first.md`).

## Current

| Field                  | Value                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Slice name**         | `notification-dispatcher` (F-007 round 1 — worker-side supervisor-change only)                                                                                                                                                                                                                                                                   |
| **Status**             | `SCOPE_DRAFT_PENDING_REVIEW` 2026-05-16 — scope artifact at [handoff/feature-queue/scopes/F-007.md](handoff/feature-queue/scopes/F-007.md). 8 picks + 5 open Qs surfaced. Owner explicitly picks Open Q1 (5-channel rows per audience vs in_app_banner-only). Code does not start until owner + friend sign off.                                 |
| **Branch**             | `feat/f-007-notification-dispatcher` — forked from main `04c5e59` 2026-05-16 to host the scope artifact + the eventual code slice (no code yet)                                                                                                                                                                                                  |
| **Last landed commit** | `04c5e59` — `docs(handoff): F-004 → DONE; merged to main at b19e03c; next-slice picker surfaced` (last commit on main before this branch forked)                                                                                                                                                                                                 |
| **Dependencies**       | F-001 + F-002 + S-001 + F-003 + F-004 — all DONE on main. F-007 consumes F-004's `HANDOFF_PACKAGE_GENERATED` audit + F-003's `BINDING_ENDED_AUTO` audit. Notification table + Zod schemas already shipped (no migration). Closure spec §7 audience rules + Decision 4 (mandatory worker-side supervisor-change notification) lock the behaviour. |
| **Tests status**       | n/a — code not started; scope phase                                                                                                                                                                                                                                                                                                              |
| **Verification gate**  | will be `REAL_DB` once code lands (~120 cases total: 109 prior baseline + ~10 new F-007 cases)                                                                                                                                                                                                                                                   |

## §0 Pre-decided product behavior (rule 27, locked in F-007 scope)

Full §0 lives in [handoff/feature-queue/scopes/F-007.md §0](handoff/feature-queue/scopes/F-007.md). Summary of the owner-locked product behaviors F-007 must conform to:

- **Worker MUST be notified when their supervisor changes (closure Decision 4 — locked).** Push + in-app banner + SMS fallback. Localised to worker's `preferredLanguage`. Fires on every binding change to a worker's site.
- **Event-driven, audience-resolved (closure §7).** Outbox topic fires → audience resolution job → Notification rows → channel handlers per row.
- **Audience per kind (closure §7):** `supervisor_change` → affected workers + outgoing supervisor + incoming supervisor.
- **Coalescing rule:** multi-binding events for the same supervisor pair within a short window → one notification per audience member.
- **Channel fallback chain:** push → SMS → WhatsApp-out → email. in_app_banner is parallel (always-on).
- **Localisation:** rendered in recipient's `User.preferredLanguage` / `Worker.preferredLanguage`.
- **Vertical-slices methodology (locked 2026-05-16 in `feedback_vertical_slices_not_backend_first.md`):** F-007 is a real consumer of F-003/F-004 emits, not more abstract backend. Backend-only is fine here because the consumer surface IS the production code path (worker-app banner; future channel adapters).

## 8 picks proposed in the scope artifact

Full text + rule-26 existing-pattern survey + rule-27 §0 (4-bucket Q3) live in [handoff/feature-queue/scopes/F-007.md](handoff/feature-queue/scopes/F-007.md). Summary:

1. **Source events subscribed** — `HANDOFF_PACKAGE_GENERATED` (F-004) + `BINDING_ENDED_AUTO` (F-003). Other binding kinds covered transitively or deferred.
2. **Architecture** — Pattern A (outbox emit inside source tx). One-line `enqueueOutbox` addition in F-004's `writeHandoffPackage` + F-003's sweep. Dispatcher handler `notification.supervisor_change` calls `composeSupervisorChangeNotifications`.
3. **Notification kind + payload shape** — `kind: 'supervisor_change'`; payload `{ messageKey, messageVars, sourceAuditId, bindingId, siteId, outgoingSupervisorId, incomingSupervisorId, eventKind }`. Template rendered per recipient.preferredLanguage at read time.
4. **Audience resolution** — workers ACTIVE on site at event time + outgoing + incoming. Workers without User get `audienceWorkerId` only.
5. **Channels per audience entry** — Open Q1 owner pick: 5-row (in_app_banner real + 4 log-stub) OR 1-row (in_app_banner only).
6. **Coalescing** — 60-second sliding window per (companyId, outgoing, incoming, recipient). Payload's `bindingId` + `siteId` become arrays.
7. **Idempotent replay** — partial unique index on `Notification (companyId, COALESCE(audienceUserId, sentinel), COALESCE(audienceWorkerId, sentinel), kind, payload->>'sourceAuditId') WHERE kind='supervisor_change'`. P2002 → handler treats as no-op race-loser.
8. **WORKER_SUPERVISOR_CHANGE_NOTIFIED audit** — one per worker Notification row. Supervisor-side notifications don't emit this audit (worker-compliance-specific).

## 5 small open Qs (recommended defaults; Open Q1 is the only blocker)

- **Q1 BLOCKER** — channels per audience entry: 5-row variant vs 1-row variant. Recommended: 1-row (in_app_banner only) — friend's vertical-slice rule favours narrow scope; expand when real channel adapters land. Alternative 5-row variant creates rows for future adapters' observability. Owner picks.
- **Q2** — template source: (a) hardcoded Record<lang, string> in composer (default; 1 slice's worth of strings); (b) Policy table; (c) i18n file. Default (a) for round 1.
- **Q3** — round-1 language coverage: 'hi' + 'en' default; other languages fall back to 'hi'.
- **Q4** — F-003 BINDING_ENDED_AUTO with no permanent-supervisor-at-end: skip notification, warning log, no throw.
- **Q5** — log-stub channel records (if Q1 picks 5-row): handlers set `deliveredAt` immediately for observability + worker-app rendering.

## Audit emits on F-007 run

- N× `WORKER_SUPERVISOR_CHANGE_NOTIFIED` (one per worker Notification row — Decision 4 audit-trail compliance).
- N× new Notification rows persisted (sets up worker-app reads + downstream Digest composer).

## What this slice does NOT do (explicit non-claims)

- Does NOT wire real Gupshup / FCM / Twilio / SES channel adapters — deferred to a Phase C sub-slice per master plan §G.7.
- Does NOT implement other notification kinds (termination_applied, leave_status, replacement_invite, flag_alert, hr_update, ai_budget_alert) — round 2+ sub-slices.
- Does NOT build the worker-app banner UI — F-006 (worker mobile scaffold).
- Does NOT build the Digest composer ("while you were out", monthly owner) — separate slice; F-007 emits the source Notification rows.
- Does NOT implement the channel-fallback retry chain (push fails → SMS → WhatsApp → email) — lands with real channel adapters.
- Does NOT add Policy-driven per-tenant overrides — closure-spec defaults verbatim in round 1.
- Does NOT touch F-001 / F-002 / S-001 / F-003 / F-004 behaviour. F-003 + F-004 each gain ONE outbox-emit line; no other change.

## Reproduction (current baseline, pre-F-007 code)

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
  test/binding-expire-sweep.test.ts \
  test/handoff-package-composer.test.ts
```

Expected: 19 files, 109 cases, all green. F-007 adds `test/notification-supervisor-change.test.ts` (~10 cases) → 20 files / ~120 cases.

## Decision needed (owner + friend, before any F-007 code)

- `SCOPE: APPROVED (round 1)` + **owner picks Open Q1 (5-row vs 1-row)** → I begin code immediately on `feat/f-007-notification-dispatcher`. Stop at `AWAITING_APPROVAL` after new test sweep is green (~120 cases).
- `SCOPE: CHANGES_REQUESTED on pick N or Open Q N` → I update + re-surface.
- `HOLD` → F-007 pauses; surface a different next slice instead (F-005 admin HR portal / F-006 worker mobile / F-009 project memory / F-010 handoff v2).

## F-001..F-004 closure summary (for cross-slice context)

| Slice                                  | Status                             | Approval at    | Friend's verbatim                                                                                                              |
| -------------------------------------- | ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| F-001 (binding-effective-routing)      | DONE                               | —              | —                                                                                                                              |
| F-002 (chat-writes-proposed-decisions) | DONE (merged `a29f9f6`)            | HEAD `12c1df6` | "P1 is really fixed · P2 is really fixed enough for approval · APPROVED."                                                      |
| S-001 (same-day-supervisor-freeze)     | DONE (merged `a29f9f6`)            | HEAD `2a0f27c` | "I do not see a new code bug or a new tracker-truth bug · Decision: APPROVED."                                                 |
| F-003 (cron + binding-expire-sweep)    | DONE (merged `2bc815b`)            | HEAD `c4c335b` | "The round-2 review cleanup is real · Decision: APPROVED."                                                                     |
| F-004 (HandoffPackage composer)        | DONE (merged `b19e03c` 2026-05-16) | HEAD `ef0aadd` | "APPROVED. I verified the actual repo at HEAD `ef0aadd`. The last stale writer comment is fixed. F-004 is approved for merge." |

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
