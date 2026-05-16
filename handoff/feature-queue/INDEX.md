# Feature Queue

> Upcoming slices in priority order. Each row is a candidate next slice with enough detail that any session can pick it up and start.
>
> The HTML dashboard renders this queue; clicking a feature in the dashboard surfaces all its scope detail.

## Status enum (same as owner-input)

`QUEUED` · `READY` · `WIP` · `BLOCKED` · `DONE`

- `QUEUED` — surfaced, not yet ready to start (dependencies open).
- `READY` — dependencies met; this is the next slice.
- `WIP` — being worked on right now (should match `active-slice.md`).
- `BLOCKED` — explicitly blocked; the blocker is named.
- `DONE` — merged + verified end-to-end.

## Ordering rule

The queue is ordered from "next" at top to "later" at bottom. Items don't auto-reorder; ordering is an explicit owner decision (or a friend recommendation).

## How to read each item

Every queued feature has the 9 fields from `INDEX.md` rule:

- **id** — short identifier
- **title** — what it builds
- **why** — the problem it solves
- **depends on** — what must be true first
- **personas touched** — Ravi / Suresh / Kavitha / Reddy
- **workflows touched** — IDs from ops-workflow-model
- **entities / routes / tables touched** — code surface
- **expected verification gate** — `LOCAL` / `REAL_DB` / `PROD_APPLIED`
- **status** — from the enum

---

## Queue

### F-001 — Resume routing slice from WIP `84ae39c`

- **id:** F-001
- **title:** Resume + finish foundation read APIs for routing
- **why:** Closes the routing slice that was paused to build the control loop. Read API for "who is currently responsible" — consumed by every future routed surface.
- **depends on:** `handoff-control-loop` slice (APPROVED 2026-05-15 evening at `03a1c22`).
- **personas touched:** Ravi (read side), Lakshmi (acting), Anjali (gaining permanent).
- **workflows touched:** D17, F26 (read), F27 (read).
- **entities/routes/tables touched:** `apps/backend/src/lib/effective-responsibility.ts` (new), `apps/backend/src/routes/decisions.ts` (new), `apps/backend/src/routes/sites.ts` (+1 endpoint), `apps/backend/test/*` (+4 files).
- **expected verification gate:** `REAL_DB` (fresh local Postgres + all 10 migrations + 4 new test files green).
- **status:** `APPROVED` (friend's file-grounded verification 2026-05-15 evening; WIP-split deviation accepted; ready to be marked DONE once branch merges to main).

### S-001 — Same-day supervisor-freeze policy

- **id:** S-001
- **title:** Shared `assertNotChangingTodaysResponsibility` guard at every HR binding-mutation entry point — no responsibility change may take effect today
- **why:** Eliminates the stale-authority race at the source rather than engineering around it (rule 25 — policy-first / no unnecessary complexity). F-002 round-2 + round-3 already cover the race as defense-in-depth; this slice makes the race impossible by construction. Framed around the business outcome ("no responsibility change takes effect today"), not around any single field, so a future code path mutating responsibility through a different field cannot silently bypass it.
- **depends on:** F-002 (APPROVED 2026-05-16) — dependency met. Spec lock in `2026-05-14-supervisor-responsibility-model.md` + `2026-05-15-workflow-design-closure.md` landed in `2835e84` (single-source v2 wording in both specs).
- **personas touched:** Kavitha (HR, gated at API layer), Ravi (originator, no behavior change for him), Lakshmi/Anjali (acting binding flows shift to next-day-effective).
- **workflows touched:** F26 (acting binding create), F27 (permanent reassign), binding-end mutations (any path that would change today's responsible supervisor).
- **entities/routes/tables touched:**
  - **NEW:** `apps/backend/src/lib/same-day-freeze.ts` exporting `assertNotChangingTodaysResponsibility({ now?, tenantTimeZone?, effectiveFrom?, effectiveUntil? })`, `SameDayFreezeError(code='SAME_DAY_FREEZE')`, `tomorrowMidnightInTimeZone(now, tz)` (DST-safe via `Intl.DateTimeFormat` offset sampling), `DEFAULT_TENANT_TIME_ZONE = 'Asia/Kolkata'`.
  - **WIRED:** `apps/backend/src/lib/site-supervisor-binding.ts` — `reassignPermanentBinding` calls the guard BEFORE the prior-find. Guard covers both the new binding's `effectiveFrom` AND the closed binding's `effectiveUntil` (they share the cutover instant in this path). `ReassignPermanentBindingInput` gains optional `tenantTimeZone`.
  - **NEW (deferred to F-005):** HR binding-create / binding-end HTTP routes (admin-web HR portal). The guard is exported and ready to drop into those routes when they ship.
  - **NO** schema change. **NO** new Prisma model. **NO** new HTTP route in this slice. **NO** `Company.timeZone` column (deferred — guard accepts the override parameter today).
- **expected verification gate:** `REAL_DB` — 5 new tests + 4 adapted existing tests:
  - **NEW** `apps/backend/test/same-day-supervisor-freeze.test.ts` (5 cases):
    1. helper rejects same-day `effectiveFrom` (proves reusable for future F-005 HR binding-create route);
    2. helper rejects same-day `effectiveUntil` (covers binding-end mutations);
    3. `reassignPermanentBinding` rejects same-day cutover (real-DB; seed remains, no audit emitted);
    4. supervisor-app routing unchanged for permanent + future-dated bindings (`getEffectiveBinding` returns userA now, userB at post-cutover);
    5. helper sanity — `tomorrowMidnightInTimeZone` returns 00:00 local in IST.
  - **ADAPTED** `apps/backend/test/binding-permanent-reassignment-basics.test.ts` (3 cases shifted to +36h cutovers; one case renamed and refactored to query effective-at-post-cutover, the only correct shape under S-001).
- **status:** `APPROVED` — friend's file-grounded verification 2026-05-16 at HEAD `2a0f27c`. Verbatim: "Final tracker propagation is clean · I do not see a new code bug or a new tracker-truth bug · Decision: APPROVED." Final S-001 commit chain: `2835e84` (spec lock) · `d234e77` (code) · `8e763f8` (tracker → AWAITING_APPROVAL) · `ab4d9a2` (control-surface cleanup) · `2a0f27c` (final tracker propagation). 17/17 files · 84/84 cases pass on fresh local Postgres 16. Ready to be marked DONE once branch merges to main.

### F-002 — D17 SupervisorDecision writer

- **id:** F-002
- **title:** Chat extractor writes PROPOSED SupervisorDecision rows
- **why:** The largest workflow gap. Today chat-MVP applies decisions directly, skipping the PROPOSED → APPLIED lifecycle. Every EMPLOYMENT-tier ack, undo, dismiss, originContext-across-binding ride on this writer.
- **depends on:** F-001 (APPROVED 2026-05-15 evening) — dependency met.
- **personas touched:** Ravi (originator), Lakshmi/Anjali (current responsible), Kavitha (EMPLOYMENT ack gate), Suresh (subject).
- **workflows touched:** D17, D20 (writer side), C11 / E21 / E22 / E24 (DWI-driven kinds).
- **entities/routes/tables touched:** `apps/backend/src/routes/chat.ts` (extractor wires DWI write), new `POST /decisions/:id/apply`, new `POST /decisions/:id/dismiss`, `SupervisorDecision` writes.
- **expected verification gate:** `REAL_DB`.
- **status:** `APPROVED` (friend's file-grounded verification 2026-05-16 at HEAD `12c1df6`; round-3 fixes closed both P1 + P2; 15/15 test files green, 75/75 cases pass; ready to be marked DONE once branch merges to main).

### F-003 — Cron framework + `binding-expire-sweep` (RE-SCOPED 2026-05-16)

- **id:** F-003
- **title:** Cron framework + first sweep job — **side-effect emit only, NOT a responsibility switch**
- **why:** Responsibility switching when `effectiveUntil` passes is already correct and time-based via `getEffectiveBinding` (read-time predicate excludes the expired acting row immediately). What does NOT exist today is a scheduled trigger that observes "this binding just expired" and emits the audit event + later the "while you were out" digest + later the notifications. F-003 fills only that side-effect gap. Matches Oracle / Workday / SAP effective-dating patterns: source-of-truth is date-based; scheduled jobs handle side effects.
- **depends on:** F-001 (APPROVED 2026-05-15) — dependency met. F-002 (APPROVED 2026-05-16) and S-001 (APPROVED 2026-05-16) not strictly required but both landed.
- **personas touched:** all 4 indirectly via downstream consumers of `BINDING_ENDED_AUTO` (notification dispatcher F-007, digest generator, audit-trail reports).
- **workflows touched:** F26 (acting binding expiry — emits audit; switching itself is already read-time correct), F27 (permanent reassign expiry — same), C12 (decision expiry — later slice on this framework).
- **entities/routes/tables touched:**
  - **NEW dir:** `apps/backend/src/jobs/` — cron framework module + `binding-expire-sweep` job.
  - **EMITS:** `BINDING_ENDED_AUTO` AuditEvent per binding whose `effectiveUntil` has just passed and that has not yet been processed (kind already catalogued in closure spec §11).
  - **DOES NOT MUTATE the binding row.** `endedAt` stays NULL for auto-expired bindings — setting it would break historical point-in-time queries via `getEffectiveBinding`.
  - **NEW test:** real-DB integration test verifying sweep is idempotent + emits the audit + does NOT mutate the binding row + does NOT change `getEffectiveBinding` results.
  - **NO** new entity. **NO** new Prisma model. **NO** HTTP route mutation lands. **One schema change** at round 2 (migration `20260519_f003_binding_ended_auto_dedup_index` — partial unique index on `AuditEvent` for `BINDING_ENDED_AUTO`-kind rows; narrow predicate, other kinds unaffected). The original round-1 scope said "no schema change" with an app-side audit-existence check; friend's round-1 P1 review correctly flagged that as race-prone, so round 2 moves the dedup guarantee to the DB.
- **expected verification gate:** `REAL_DB` (real Postgres + sweep run + idempotency assertion + read-time-routing-unchanged assertion).
- **spec amendment landed (docs-only, in the same commit as this re-scope):** two lines updated in `docs/specs/2026-05-15-workflow-design-closure.md` — §3.1 binding lifecycle (line 175) now says the `effectiveUntil`-path ACTIVE → ENDED transition is time-based and read-time-evaluated via `getEffectiveBinding`; §10 cron jobs (line 560) now says the sweep is "Side-effect emit only — NOT a responsibility switch ... does NOT mutate the binding row ... digest is a separate downstream consumer."
- **status:** `AWAITING_APPROVAL` (round 2) — friend's round-1 P1 fixed via DB-enforced partial unique index (`AuditEvent_binding_ended_auto_dedup` on (companyId, kind, targetId) WHERE kind='BINDING_ENDED_AUTO' AND targetId IS NOT NULL) + P2002 catch in the per-row emit (`cd490d7`). Friend's round-1 P2 fixed by downgrading the docs/claims to match what tests actually prove + adding 3 new dedup tests (Promise.all concurrent emit · direct DB unique-violation · partial-index narrowness). Rule 26 (inspect existing repo patterns BEFORE designing) locked in `3e2f6bf` as upstream prevention. 18/18 test files green · 95/95 cases pass on fresh local Postgres 16 (84 prior baseline + 11 F-003 cases). Awaits friend's round-2 file-grounded review.

### F-004 — HandoffPackage composer

- **id:** F-004
- **title:** Auto-compose `handoffPackage` JSON at every binding creation
- **why:** Closure Decision 8 + §3.7 — site rules, recent complaints, active worker context, open decisions/calendar embedded into binding row. Today the column is nullable; composer doesn't exist.
- **depends on:** F-001, F-002 (DWI writer needed for "open decisions" component).
- **personas touched:** Lakshmi/Anjali (incoming).
- **workflows touched:** F26, F27.
- **entities/routes/tables touched:** `apps/backend/src/lib/handoff-package-composer.ts` (new), wires into `recordBindingCreated` flow, `reassignPermanentBinding`.
- **expected verification gate:** `REAL_DB`.
- **status:** `QUEUED`.

### F-005 — Admin-web HR portal scaffold

- **id:** F-005
- **title:** First admin-web HR routes — queue + bindings create/reassign/end
- **why:** Closure §4 + Decision 1. 9 HR workflows are BACKEND_READY but have no HR portal surface (`apps/admin-web/app/hr/` doesn't exist).
- **depends on:** F-001, F-002, F-003.
- **personas touched:** Kavitha (primary).
- **workflows touched:** H-1, H-2, H-3, H-4, H-6, H-7, H-8, H-9, E21, E23, D20/E24 (ack gate).
- **entities/routes/tables touched:** `apps/admin-web/app/hr/{queue,bindings,seed-review,ack}/*` (new), wires to backend bindings + DWI APIs.
- **expected verification gate:** Playwright smoke + `REAL_DB`.
- **status:** `QUEUED`.

### F-006 — Worker mobile app scaffold

- **id:** F-006
- **title:** First worker mobile app screens — auth + home + attendance subject view
- **why:** All 18 Suresh workflows are NOT_STARTED because `apps/worker-mobile/` doesn't exist. The structurally-invisible-worker problem from audit Round 2.
- **depends on:** F-001, F-003 (notification dispatcher).
- **personas touched:** Suresh (primary).
- **workflows touched:** A1, A3, A4 (worker side), C11 (subject), E21 (initiator).
- **entities/routes/tables touched:** new `apps/worker-mobile/` Expo app, auth + home + attendance screens, push setup.
- **expected verification gate:** Playwright + `REAL_DB`.
- **status:** `QUEUED`.

### F-007 — Notification dispatcher

- **id:** F-007
- **title:** Outbox dispatcher delivers to push + SMS + WhatsApp + in-app
- **why:** Closure Decision 4 + 10 + AI budget alerts (G29). Every notification + digest + alert sits in Outbox today; no channel adapter wired.
- **depends on:** Backend stability (no specific dep from this list).
- **personas touched:** all four (anyone receiving notifications).
- **workflows touched:** F26 (W-1/W-2/W-3/W-7), F27 (W-3), E21 leave-status, E24 termination, G29 budget alert, owner monthly digest.
- **entities/routes/tables touched:** `apps/backend/src/dispatcher/handlers/*` (push, sms, whatsapp_out, email adapters), MSG91 webhook wiring.
- **expected verification gate:** `REAL_DB` + manual delivery confirmation on dev numbers.
- **status:** `QUEUED`.

### F-008 — Bootstrap-seed migration + HR review UI

- **id:** F-008
- **title:** Migration-time seed of permanent bindings from existing Assignments + HR review affordance
- **why:** Closure Decision 6 + responsibility-model pick 8. Onboarding new tenants needs initial bindings; HR must verify them.
- **depends on:** F-005 (HR portal must exist to show the review surface).
- **personas touched:** Kavitha (review), Ravi (sees inferred portfolio at first login).
- **workflows touched:** H-6, F26/F27 (after seed correction).
- **entities/routes/tables touched:** new migration script, admin-web/hr/seed-review page.
- **expected verification gate:** `REAL_DB`.
- **status:** `QUEUED`.

---

## How to add an item to the queue

Insert in priority order. Use the F-NNN convention (next free number). Match the field set above exactly. Update status as work progresses.
