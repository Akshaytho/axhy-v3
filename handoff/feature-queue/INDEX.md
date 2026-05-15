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

### F-002 — D17 SupervisorDecision writer

- **id:** F-002
- **title:** Chat extractor writes PROPOSED SupervisorDecision rows
- **why:** The largest workflow gap. Today chat-MVP applies decisions directly, skipping the PROPOSED → APPLIED lifecycle. Every EMPLOYMENT-tier ack, undo, dismiss, originContext-across-binding ride on this writer.
- **depends on:** F-001 (APPROVED 2026-05-15 evening) — dependency met.
- **personas touched:** Ravi (originator), Lakshmi/Anjali (current responsible), Kavitha (EMPLOYMENT ack gate), Suresh (subject).
- **workflows touched:** D17, D20 (writer side), C11 / E21 / E22 / E24 (DWI-driven kinds).
- **entities/routes/tables touched:** `apps/backend/src/routes/chat.ts` (extractor wires DWI write), new `POST /decisions/:id/apply`, new `POST /decisions/:id/dismiss`, `SupervisorDecision` writes.
- **expected verification gate:** `REAL_DB`.
- **status:** `AWAITING_APPROVAL` (round-2 R2b-iii remediation complete; 9 fix commits landed addressing all 3 round-2 findings + 1 control-surface cleanup; 13/13 test files green, 69/69 cases; 4 inject-style branches now atomic via tx-callable services; P10 failure matrix fully answered in `owner-input/pending-approvals.md`).

### F-003 — Cron framework + `binding-expire-sweep`

- **id:** F-003
- **title:** Daily cron framework + first sweep job
- **why:** Closure spec mandates several crons (`binding-expire-sweep`, `decision-expire-sweep`, `hr-queue-age-escalation`, `hr-availability-sweep`). Today only `reset-ai-spend` exists. Bindings can't auto-expire; "while-you-were-out" digests can't fire.
- **depends on:** F-001.
- **personas touched:** Ravi (expiry trigger), all when downstream sweeps land.
- **workflows touched:** F26 (acting window expiry), C12 (decision expiry).
- **entities/routes/tables touched:** `apps/backend/src/jobs/*` (new dir), cron framework module, `binding-expire-sweep` job, integration test.
- **expected verification gate:** `REAL_DB`.
- **status:** `QUEUED`.

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
