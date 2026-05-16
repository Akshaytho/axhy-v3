# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** when HR creates a binding (acting cover, permanent rebind) or when an acting binding's `effectiveUntil` fires, F-003 + F-004 emit AuditEvent rows but **no notification reaches the affected workers or the involved supervisors**. The Suresh audit (W-1 / W-2 / W-7) flagged this as the largest open product gap. The Notification table + Zod schemas already exist; what's missing is the writer that turns the audit events into Notification rows.

**Simplest business rule (v11 — locked):** when `HANDOFF_PACKAGE_GENERATED` (F-004) or `BINDING_ENDED_AUTO` (F-003) fires, F-007 fans out per closure §7 audience rules — affected workers (`Assignment.state='ACTIVE'` on the site at the event timestamp) + outgoing supervisor (may be null) + incoming supervisor (never null). **Every (recipient × channel × site × source-event) produces exactly one immutable Notification row.** Channel set per recipient = `push` + `in_app_banner` (with ONE exception: `Worker.userId IS NULL` recipients get only `in_app_banner`, since OneSignal has no derivable `external_id` for them). **NO coalescing in persistence** — multi-site bursts produce N source events → N row sets; supervisor burst grouping is presentation-side (F-006 UI / optional F-007b digest). **NO `WORKER_SUPERVISOR_CHANGE_NOTIFIED` audit emit from F-007** — that audit fires at delivery time in F-011, not at persistence time. Idempotent replay via ONE partial unique index `(companyId, kind, channel, COALESCE(audienceUserId), COALESCE(audienceWorkerId), siteId, sourceAuditId)`. v11 panel-test Maya invariant LOCKED EXPLICIT: the binding write, audit emit, and `enqueueOutbox(tx, ...)` happen in the same DB transaction; if any one fails, none commit.

**Code (only after round-2 v11 scope-artifact approval):** new `apps/backend/src/lib/notification-composer.ts` (read-only audience resolver) + new dispatcher handler `apps/backend/src/dispatcher/handlers/notifications.ts` (INSERT-or-skip-on-P2002, ~15 lines of business logic). One-line edits to `handoff-package-writer.ts` + `binding-expire-sweep.ts` adding `enqueueOutbox(tx, { topic: 'notification.supervisor_change', payload: { sourceAuditId, bindingId, eventKind } })` inside their existing txs (plus return-value tweaks on `recordHandoffPackageGenerated` + `recordBindingEndedAuto` to return `{ id }`). Migration adds ONE partial unique index for idempotency + a DB CHECK constraint `(audienceUserId IS NULL) <> (audienceWorkerId IS NULL)` if not already present (P1 — invariants enforced, not described). Real-DB integration tests verify immutable-row semantics + idempotent replay + cross-tenant isolation + Telugu/Hindi localisation with apostrophe + edge cases.

**Why this code is necessary:** Decision 4 (closure §5) makes worker-side supervisor-change notification MANDATORY. The audit pain (Suresh Month 8a / 9a) is concrete: Lakshmi appears at Suresh's site, no notification, no way to know who to call when something goes wrong. F-007 is the canonical persistence layer beneath that future delivery — Decision 4 compliance lands across F-007 (persistence) + F-011 (OneSignal SDK + delivery adapter + delivery-time audit emit) + F-006 (worker mobile in-app panel) + optionally F-012 (paid SMS/WhatsApp).

## Current

| Field                  | Value                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**         | `notification-dispatcher` (F-007 round 2 v11 — Notification persistence + audience resolution for `supervisor_change`)                                                                                                                                                                                                                             |
| **Status**             | `SCOPE_DRAFT_PENDING_REVIEW (round 2 v11 — OneSignal direction + reachability + pricing + deactivation/removal policy + collapsed eligibility rule)` 2026-05-16. Scope artifact at [handoff/feature-queue/scopes/F-007.md](../feature-queue/scopes/F-007.md). 8 picks; no blocking owner picks; recommended defaults stand unless owner overrides. |
| **Branch**             | `feat/f-007-notification-dispatcher` — forked from main `04c5e59` 2026-05-16. v11 scope + tracker propagation lands as next commit; no code yet.                                                                                                                                                                                                   |
| **Last landed commit** | `04c5e59` — `docs(handoff): F-004 → DONE; merged to main at b19e03c; next-slice picker surfaced`                                                                                                                                                                                                                                                   |
| **Dependencies**       | F-001 + F-002 + S-001 + F-003 + F-004 — all DONE on main. F-007 consumes F-004's `HANDOFF_PACKAGE_GENERATED` + F-003's `BINDING_ENDED_AUTO`. Notification table + Zod schemas already shipped — only ONE partial unique index migration (+ possibly a DB CHECK constraint if not already present) for idempotent replay.                           |
| **Tests status**       | n/a — code not started; scope-artifact phase                                                                                                                                                                                                                                                                                                       |
| **Verification gate**  | will be `REAL_DB` once code lands (~120 cases total: 109 prior baseline + ~11 new F-007 cases)                                                                                                                                                                                                                                                     |

## §0 Pre-decided product behavior (rule 27, locked in F-007 v11 scope)

Full §0 lives in [handoff/feature-queue/scopes/F-007.md §0](../feature-queue/scopes/F-007.md). Summary of the owner-locked product behaviors F-007 must conform to:

- **Worker MUST be notified when their supervisor changes (closure Decision 4 — locked).** Push + in-app banner (+ SMS fallback in F-012). Localised. Multi-site workers receive one notification per site, NOT aggregated (Decision 4 line 80 verbatim).
- **F-007 produces persistence + audience-resolved Notification rows; delivery is separate.** Vertical-slices methodology (`feedback_vertical_slices_not_backend_first.md`). Round 1 = groundwork beneath Decision 4 delivery.
- **Immutable rows; no write-time coalescing (v7 reset).** Every (source event × recipient × channel × site) = one row. Grouping is presentation-side (F-006 / F-007b).
- **OneSignal is the managed push provider (v8).** Our DB owns truth + audit + history + panel; OneSignal owns push subscription plumbing + delivery transport. F-006 reads OUR Notification table, NOT OneSignal in-app messages.
- **Channel set = push + in_app_banner**, with `Worker.userId IS NULL` exception (in_app_banner only).
- **`push` = push INTENT row** for a user-backed recipient; reachability is checked at F-011 dispatch time, not F-007 write time.
- **Outbox + same-tx invariant (v11 panel-test Maya LOCKED):** binding write + audit emit + `enqueueOutbox(tx, ...)` commit together or none commit.
- **Localisation:** rendered via `${var}` placeholder with escape rule for `${`, `}`, `\\`, single/double-quote, devanagari combining marks. Worker source: `Worker.preferredLanguage`. Supervisor source: `User.locale`. Fallback Policy → 'hi'.

## 8 picks proposed in the round-2 v11 scope artifact

Full text + rule-26 existing-pattern survey + rule-27 §0 (4-bucket Q3) live in [handoff/feature-queue/scopes/F-007.md](../feature-queue/scopes/F-007.md). Summary:

1. **Source events subscribed** — `HANDOFF_PACKAGE_GENERATED` (F-004) + `BINDING_ENDED_AUTO` (F-003).
2. **Architecture** — Pattern A (outbox emit inside source tx). One-line `enqueueOutbox` additions in F-004 + F-003. **v11 panel-test Maya invariant LOCKED:** same-tx atomicity.
3. **Notification kind + payload shape** — `kind: 'supervisor_change'`. Single flat Zod record (NO discriminated union). `schemaVersion: 1` first field. Fields: `messageKey + messageVars + eventKind + bindingId + outgoingSupervisorId + incomingSupervisorId + siteId + sourceAuditId + effectiveAt`. No parallel arrays, no `firstSourceAuditId`, no `recipientKind` (audience FK on the row already encodes it).
4. **Audience resolution** — workers ACTIVE on site at event `effectiveAt` + outgoing + incoming. Workers without `User` get `audienceWorkerId` only.
5. **Channels per audience entry** — `push` + `in_app_banner` (with `Worker.userId IS NULL` → in_app_banner only). `push` = INTENT; reachability is F-011's concern.
6. **Coalescing** — NONE in persistence. Workers + supervisors both one-per-(recipient, channel, siteId, sourceAuditId). Grouping is presentation-side.
7. **Idempotent replay** — ONE partial unique index `(companyId, kind, channel, COALESCE(audienceUserId::text, ''), COALESCE(audienceWorkerId::text, ''), payload->>'sourceAuditId', payload->>'siteId') WHERE kind='supervisor_change'`. P2002 → handler logs `idempotent_skip` and continues. **v11 panel-test Vikram (P1):** also add DB CHECK constraint `(audienceUserId IS NULL) <> (audienceWorkerId IS NULL)` if not already present.
8. **No audit emit from F-007 round 1** — `WORKER_SUPERVISOR_CHANGE_NOTIFIED` fires in F-011 at delivery time.

## 3 open Qs (recommended defaults; no blockers)

- **Q2** — template source: hardcoded `Record<lang, string>` in composer for round 1; Policy-driven future sub-slice.
- **Q3** — round-1 language coverage: 'hi' + 'en' + 'te'; others fall back to 'hi'.
- **Q4** — F-003 BINDING_ENDED_AUTO with no permanent-supervisor-at-end: skip notification, warning log, no throw.

**Round 2 v11 has no blocking owner picks** — Open Q1 (5-row vs 1-row) was REMOVED with the v2 channel-set decision; Open Q5 (log-stub semantics) was REMOVED because v11 doesn't fake delivery.

## Audit emits on F-007 run

- **ZERO audit emits from F-007 round 1.** `WORKER_SUPERVISOR_CHANGE_NOTIFIED` fires at delivery time in F-011, not at persistence time in F-007. Tests assert this count stays 0 after every scenario.
- N× new Notification rows persisted (sets up F-011 delivery + F-006 worker-app reads + downstream Digest composer).

## What this slice does NOT do (explicit non-claims)

- Does NOT install OneSignal SDK or build the push delivery adapter — **F-011** (OneSignal mobile SDK + identity linking via `OneSignal.login(external_id = User.id)` + provider delivery adapter + pre-dispatch eligibility re-check + typed `failureReason` enum + delivery-time `WORKER_SUPERVISOR_CHANGE_NOTIFIED` audit emit).
- Does NOT build the worker / supervisor mobile in-app notification panel — **F-006** (our own panel, NOT OneSignal in-app messages; reads OUR Notification table; writes `ackedAt` on dismiss/read).
- Does NOT build supervisor burst grouping UI — **F-006** (UI aggregation) or optional future **F-007b** (send-time digest).
- Does NOT add SMS / WhatsApp adapters — **F-012** (paid; AWAITING_OWNER_GO_ON_PAID_CHANNELS; primary use: deliver to `Worker.userId IS NULL` recipients via `Worker.phone`).
- Does NOT implement other notification kinds (`termination_applied`, `leave_status`, `replacement_invite`, `flag_alert`, `hr_update`, `ai_budget_alert`) — round 2+ sub-slices of F-007.
- Does NOT build the Digest composer ("while you were out", monthly owner) — separate slice; F-007 emits the source rows.
- Does NOT extend `Device` with `pushToken` / `pushPlatform` / `tokenUpdatedAt` — OneSignal SDK owns subscription/token lifecycle entirely.
- Does NOT lock OneSignal pricing thresholds into the architecture artifact — billing is per active mobile subscription (1 user × 2 devices = 2 MAUs); verify current OneSignal billing before go-live / scale-up decisions.
- Does NOT solve the persistent push-delivery gap for `Worker.userId IS NULL` recipients (v11 panel-test Suresh Pillai): no `external_id` → no OneSignal subscription → no push delivery, ever, even after F-011 ships. `in_app_banner` is also unreachable for them until F-006 worker login flow creates a User. Real resolution: F-012 SMS via `Worker.phone` OR future user-creation/login path.
- Does NOT touch F-001 / F-002 / S-001 / F-003 / F-004 behaviour beyond one outbox-emit line each + return-value tweaks on two typed audit helpers.

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

Expected: 19 files, 109 cases, all green. F-007 adds `test/notification-supervisor-change.test.ts` (~11 cases) → 20 files / ~120 cases total.

## Decision needed (owner + friend, before any F-007 code)

- `SCOPE: APPROVED (round 2 v11)` (8 picks + 3 open-Q recommended defaults stand) → I begin code immediately on `feat/f-007-notification-dispatcher`. Stop at `AWAITING_APPROVAL` after new test sweep is green (~120 cases).
- `SCOPE: CHANGES_REQUESTED on pick N or Open Q N` → I update + re-surface.
- `HOLD` → F-007 pauses; surface a different next slice instead.

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
