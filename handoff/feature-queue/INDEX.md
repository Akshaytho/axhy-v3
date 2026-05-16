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
- **status:** `DONE` — friend's file-grounded verification 2026-05-15 evening; WIP-split deviation accepted; merged to main at `a29f9f6` on 2026-05-16 alongside F-002 + S-001 + F-003 scope.

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
- **status:** `DONE` — friend's file-grounded verification 2026-05-16 at HEAD `2a0f27c`. Verbatim: "Final tracker propagation is clean · I do not see a new code bug or a new tracker-truth bug · Decision: APPROVED." Final S-001 commit chain: `2835e84` (spec lock) · `d234e77` (code) · `8e763f8` (tracker → AWAITING_APPROVAL) · `ab4d9a2` (control-surface cleanup) · `2a0f27c` (final tracker propagation). 17/17 files · 84/84 cases pass on fresh local Postgres 16. Merged to main at `a29f9f6` on 2026-05-16.

### F-002 — D17 SupervisorDecision writer

- **id:** F-002
- **title:** Chat extractor writes PROPOSED SupervisorDecision rows
- **why:** The largest workflow gap. Today chat-MVP applies decisions directly, skipping the PROPOSED → APPLIED lifecycle. Every EMPLOYMENT-tier ack, undo, dismiss, originContext-across-binding ride on this writer.
- **depends on:** F-001 (APPROVED 2026-05-15 evening) — dependency met.
- **personas touched:** Ravi (originator), Lakshmi/Anjali (current responsible), Kavitha (EMPLOYMENT ack gate), Suresh (subject).
- **workflows touched:** D17, D20 (writer side), C11 / E21 / E22 / E24 (DWI-driven kinds).
- **entities/routes/tables touched:** `apps/backend/src/routes/chat.ts` (extractor wires DWI write), new `POST /decisions/:id/apply`, new `POST /decisions/:id/dismiss`, `SupervisorDecision` writes.
- **expected verification gate:** `REAL_DB`.
- **status:** `DONE` — friend's file-grounded verification 2026-05-16 at HEAD `12c1df6`; round-3 fixes closed both P1 + P2; 15/15 test files green, 75/75 cases pass; merged to main at `a29f9f6` on 2026-05-16.

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
- **status:** `DONE` — friend's file-grounded verification 2026-05-16 at HEAD `c4c335b`. Verbatim: "The round-2 review cleanup is real · The stale doc lines I flagged are now fixed, and I do not see a new blocker · Decision: APPROVED." Full F-003 commit chain: `39b47b8` (scope LOCKED) · `a29f9f6` (F-002+S-001 merge) · `74c1e9d` (pick 1 corrected pre-code) · `737c066` (round-1 code) · `433985d` (round-1 tracker) · `3e2f6bf` (rule 26 locked) · `cd490d7` (round-2 P1: partial unique index + P2002 + 3 tests) · `802d28f` (round-2 P2 docs downgrade) · `c4c335b` (round-2 review cleanup) · `ad3b805` (closure + F-004 surfacing). 18/18 files · 95/95 cases pass on fresh local Postgres 16. **Merged to main at `2bc815b` on 2026-05-16.**

### F-004 — HandoffPackage composer

- **id:** F-004
- **title:** Auto-compose `handoffPackage` JSON at every binding creation
- **why:** Closure Decision 8 + §3.7 — site rules, recent complaints (90d), active worker context, open `PROPOSED` decisions, +7-day calendar embedded into binding row. The `handoffPackage` JSON column on `SiteSupervisorBinding` already exists (nullable); the composer doesn't yet. Without it, every incoming supervisor walks in cold and every downstream surface (digest, HR portal handoff card, notification payload) has to rebuild the same context separately.
- **depends on:** F-001 + F-002 + S-001 + F-003 — all DONE on main (F-001/F-002/S-001 merged at `a29f9f6`; F-003 merged at `2bc815b`). All met.
- **personas touched:** Lakshmi/Anjali (incoming supervisors get the package); Ravi (originating supervisor — no behavior change for him).
- **workflows touched:** F26 (acting binding create), F27 (permanent reassign).
- **entities/routes/tables touched:** NEW `apps/backend/src/lib/handoff-package-composer.ts` exporting `composeHandoffPackage(tx, args)` — tx-callable shape matching the existing `recordBindingCreated` pattern per rule 26. Wires into the existing binding-create flow + `reassignPermanentBinding`. NEW `HandoffPackagePayloadSchema` in shared-schema/zod. NO schema migration (column already exists). NO HTTP route in this slice.
- **expected verification gate:** `REAL_DB` — composition correctness across acting / permanent / reassign paths + empty-state defaults + cross-tenant isolation.
- **status:** `DONE` — friend's final approval 2026-05-16 at HEAD `ef0aadd`. Verbatim: "APPROVED. I verified the actual repo at HEAD `ef0aadd`. The last stale writer comment is fixed, and I do not see a new blocking issue now. F-004 is approved for merge." Full F-004 commit chain: `19b6016` (round-1 scope) · `6969be9` (round-2 scope) · `5cd4105` (round-3 scope) · `daae04b` (round-4 v1 + rule 27 v1) · `c8dbeaa` (F-009 queued) · `4bd9631` (round-4 v3 panel pass) · `3f54587` (round-4 v4 spec amendment + F-010 queued) · `5bbf6e2` (active-slice 9-field catch-up) · `3abf55b` (round-1 code) · `0c9bdb7` (round-2 fixes: summary entry + site-scoped openItems + hard truncation) · `f5e00bd` (round-2.5 doc-truth) · `ef0aadd` (round-2.6 stale comment). 19/19 files · 109/109 cases pass on fresh local Postgres 16. **Merged to main at `b19e03c` on 2026-05-16.** Round-1 = 3 shape drifts; round-2 = 2 more shape drifts + 1 citation gap; round-3 fixed shape drifts but introduced 2 honesty-of-wording drifts caught by friend: (a) pick 1 + pick 3 overclaimed "EXACTLY per spec" / "no additions, no omissions" while Open Q5's interim `kind`-field default is still in play — cannot claim exact alignment to a locked field while one mapping is interim; (b) Open Q2 smuggled a first-ever-binding summary-entry text ("First binding for `<siteName>` on `<date>` — no prior supervisor context") as if spec-locked, but it is a NEW product choice without owner sign-off. **Round-4 revision 2026-05-16 late evening:** pick 1 + pick 3 reworded honestly ("matches spec §3.7 line 307's field set, with `kind` using an interim default per Open Q5 until a dedicated schema field exists"); Open Q2 reframed as a new product choice (3 options listed: (a) write "First binding for `<siteName>` on `<date>` — no prior supervisor context" / (b) write NO entry / (c) owner-supplied wording; recommended (a), but NOT locked; owner picks). **Rule 27 expanded** to lock the **Postgres + pgvector + delta/live AI-memory architecture** as the 4-bucket model: (1) exact SQL truth — relational rows point-in-time; (2) frozen SNAPSHOT — immutable JSON capturing judgement; (3) live-or-delta-refreshed — on-demand SQL or event-invalidated cache; (4) vector-retrievable memory — pgvector similarity over embedded text. Do NOT collapse buckets. Pre-design checklist Q3 expanded from 2 buckets (LIVE/SNAPSHOT) to 4-bucket model; Q4 now covers BOTH shape redesign AND honesty-of-wording. F-004 §0 Q1 adds the pgvector/4-bucket architecture as a locked product-behavior row; §0 Q3 restructured to label every data piece into 4 buckets (handoffPackage = bucket-2 only; getEffectiveBinding = bucket-1; LivingDoc rules = bucket-1+4; long-horizon planning = bucket-3+4). Rule-27 locks updated across all 4 places (INDEX.md + production-grade-rulebook.md + memory + portable). 8 picks substance unchanged; round-4 changes are wording-honesty + 4-bucket architecture lock. Awaits owner + friend sign-off on round 4 (owner explicitly picks Open Q2 option a/b/c); no code lands until both sign off.

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

### F-006 — Worker + supervisor mobile in-app notification panel

- **id:** F-006
- **title:** First worker / supervisor mobile app screens — auth + home + attendance subject view + **OUR own in-app notification panel / banner consumer / unread-read state / supervisor burst-grouping UI** backed by OUR Notification table
- **why:** All 18 Suresh workflows are NOT_STARTED because `apps/worker-mobile/` doesn't exist. The structurally-invisible-worker problem from audit Round 2. F-006 also owns the supervisor burst-grouping presentation (UI aggregation by `(outgoingSupervisorId, incomingSupervisorId, eventKind)` within a short time window) — F-007 deliberately writes immutable per-event rows; F-006 groups them at read time.
- **Architecture rule (v8 locked, applies to F-006):** F-006 reads from OUR Notification table (`schema.prisma:931`) and writes `ackedAt` on user dismiss/read. **NOT** OneSignal in-app messages — those are a separate OneSignal feature useful for marketing pop-ups, not for our product-native notification inbox/history.
- **depends on:** F-001, F-007 (immutable Notification rows). F-011 (OneSignal push delivery) is independent — F-006 panel works from DB regardless of push transport state.
- **personas touched:** Suresh (primary), Ravi/Anjali/Lakshmi (supervisor panel including burst grouping for multi-site rebinds).
- **workflows touched:** A1, A3, A4 (worker side), C11 (subject), E21 (initiator), F26/F27 (supervisor banner grouping).
- **entities/routes/tables touched:** new `apps/worker-mobile/` Expo app, auth + home + attendance + notification-panel screens, in-app banner rendering, unread/read state from `Notification.deliveredAt IS NOT NULL AND ackedAt IS NULL`, supervisor burst-grouping UI aggregating per-site rows into "you're covering Ravi at 8 sites — tap to expand."
- **expected verification gate:** Playwright + `REAL_DB`.
- **status:** `QUEUED`.

### F-007 — Notification dispatcher (round 2 v11 — supervisor_change persistence + audience resolution)

- **id:** F-007 (round 2 v11)
- **title:** Convert F-003 + F-004 audit events into immutable `Notification` rows. Persistence + audience resolution only — delivery is F-011's job.
- **why:** Closure Decision 4 (mandatory worker-side supervisor-change notification) + audit Suresh W-1/W-2/W-7 (largest open product gap from the year-long simulation). F-004's `HANDOFF_PACKAGE_GENERATED` + F-003's `BINDING_ENDED_AUTO` audits emit but no notification rows reach the affected workers or involved supervisors. F-007 is the canonical persistence layer beneath Decision 4 delivery; F-011 + F-006 + F-012 close the rest.
- **Round-history:** round 1 → 2-v2 (worker coalescing dropped + 1-row variant removed + tracker-truth) → v3 (supervisor-coalescing replay + Device push-token) → v4 (audit semantic + Path B + handler stale + Path A/B) → v5 (payload contract + event-time + audienceWorkerId push-skip + schemaVersion + array invariant) → v6 (replay misroute + full-burst event-time + cleanup) → **v7 RESET** (drop write-time coalescing — immutable rows; store truth first, group later) → v8 (OneSignal direction change for F-011) → v9 (reachability + softened pricing) → v10 (deactivation/removal policy + cost-model rewording) → **v11** (logout collapse + collapsed eligibility rule) → comprehensive 11-voice production-readiness panel test 2026-05-16 21:35; friend APPROVED 21:36 with 5 material findings folded.
- **depends on:** F-003 + F-004 (both DONE on main). Notification table + Zod schemas already shipped (`schema.prisma:931`, `zod/notification.ts`).
- **personas touched:** Suresh (worker — primary, finally gets a row when his supervisor changes); Ravi/Anjali/Lakshmi (outgoing + incoming supervisors get rows).
- **workflows touched:** F26 (acting cover; covers W-1/W-2/W-7), F27 (permanent rebind; covers W-3 transitively).
- **entities/routes/tables touched:** NEW `apps/backend/src/lib/notification-composer.ts` (read-only audience resolver). NEW `apps/backend/src/dispatcher/handlers/notifications.ts` (~15-line INSERT-or-skip handler). EDIT `dispatcher/handlers/registry.ts` (register topic `notification.supervisor_change`). EDIT `handoff-package-writer.ts` + `binding-expire-sweep.ts` (one-line `enqueueOutbox` + return-value tweaks). **NO** typed audit-payload schema, **NO** `recordWorkerSupervisorChangeNotified` helper — both moved to F-011 (audit fires at delivery time, not at persistence). NEW migration: ONE partial unique index on `Notification (companyId, kind, channel, COALESCE(audienceUserId::text, ''), COALESCE(audienceWorkerId::text, ''), payload->>'sourceAuditId', payload->>'siteId') WHERE kind='supervisor_change'` for idempotent replay. **Plus DB CHECK constraint** `(audienceUserId IS NULL) <> (audienceWorkerId IS NULL)` if not already present on Notification table (v11 panel-test Vikram — P1 invariant enforced, not described).
- **Architecture invariants (v11 — locked):** immutable rows (no write-time coalescing); single idempotency index; `push` row = INTENT for user-backed recipient (reachability is F-011's concern); `Worker.userId IS NULL` → in_app_banner only; `${var}` placeholder template with explicit escape rule; **outbox same-tx invariant (v11 panel-test Maya):** binding write + audit emit + `enqueueOutbox(tx, ...)` commit together or none commit.
- **expected verification gate:** `REAL_DB` — ~120 cases total (109 baseline + ~11 new F-007 cases including immutable-row semantics + idempotent replay worker+supervisor + Telugu/Hindi + apostrophe rendering + cross-tenant + edge cases).
- **status:** `SCOPE_DRAFT_PENDING_REVIEW (round 2 v11 — OneSignal direction + reachability + pricing + deactivation/removal policy + collapsed eligibility rule)` — scope artifact at `handoff/feature-queue/scopes/F-007.md`. 8 picks; no blocking owner picks; recommended defaults stand unless owner overrides. Awaits owner + friend sign-off; no code lands until both sign off.

### F-007b — Supervisor burst-grouping digest (optional follow-up to F-007 + F-006)

- **id:** F-007b
- **title:** Send-time digest aggregator that batches recent supervisor-change Notification rows for one (outgoingSupervisorId, incomingSupervisorId, eventKind) pair into a single push payload.
- **why:** F-007 writes per-event immutable rows; F-006 aggregates at read time for in-app panel. But for PUSH delivery (F-011), an 8-site rebind generates 16 push notifications to the incoming supervisor (8 events × 2 channels — push + in_app_banner per event). This is by design ("store truth first, group later") but creates a notification storm at production scale. F-007b is an optional follow-up: a send-time digest job that batches recent push rows for the same supervisor pair into a single OneSignal call ("you're now covering Ravi at 8 sites — tap to expand"). Only ships IF F-006 UI aggregation alone proves insufficient at field testing.
- **depends on:** F-007 (immutable rows ship first) + F-011 (push delivery exists) + F-006 (UI aggregation tried first). Owner picks whether F-007b is actually needed after observing real production behavior.
- **personas touched:** Ravi/Anjali/Lakshmi (supervisors — reduces push storm during portfolio rebalances).
- **workflows touched:** F26 + F27 (multi-site bursts).
- **entities/routes/tables touched:** likely a new send-time digest job in `apps/backend/src/jobs/` that batches recent unsent `Notification.channel='push'` rows for a supervisor pair within a configurable window and dispatches a single OneSignal call with a digest payload. F-007 persistence rows remain individual; digest is a send-time view over them.
- **expected verification gate:** `REAL_DB` + production observation period.
- **status:** `QUEUED — AWAITING_F-006_FIELD_OBSERVATION`. Optional; only built if needed.

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

### F-009 — Project memory service (Postgres + pgvector retrieval layer for Claude workflow)

- **id:** F-009
- **title:** A project-scoped memory service that lets Claude retrieve founder decisions, panel locks, scope artifacts, spec sections, UI intent, audit findings, review findings, and recurring code patterns by semantic + metadata + exact-id lookup.
- **why:** owner directive 2026-05-16 evening. Three rounds of F-004 scope drift surfaced a recurring pattern — pre-decided product behaviors (base+delta+live model; mechanism Z; spec §3.7 shape) keep getting re-debated because Claude doesn't reliably re-read the locked sources before drafting. Friend is doing the work of "re-grounding Claude in already-decided facts" round after round. A project memory service is the systemic fix — but it is an ENABLER, not a substitute for discipline (rule 27 still applies). Owner verbatim: "vector DB = very useful; vector DB alone = not enough."
- **NOT a blocker for F-004 or any current slice.** Discipline gaps (re-reading locked behavior, checking panel files, keeping scope wording truthful) are human/design problems first; the memory service is an upgrade-path, not a replacement.
- **depends on:** F-004 done; ideally F-005 done too (so admin-web exists if the service needs an HR-visible surface).
- **personas touched:** none directly (operator-side infrastructure). Indirectly: every persona because Claude's drafts become more grounded.
- **workflows touched:** none directly (workflow-design specs unchanged).
- **entities/routes/tables touched (proposed shape — owner-locked 2026-05-16; refine at scope time):**
  - **Table 1 — `memory_artifacts`:** `id, kind (spec | panel_note | owner_decision | review_finding | rule | ui_note | audit | code_pattern | scope_artifact), title, source_path, source_hash, created_at, updated_at, scope_tags STRING[] (e.g. f-004, handoff, r6, supervisor), persona_tags STRING[] (anjali, ravi, kavitha, suresh, reddy)`.
  - **Table 2 — `memory_chunks`:** `id, artifact_id, chunk_text, embedding VECTOR, ordinal, metadata JSONB`. Requires `pgvector` extension on the local + Railway Postgres. Embedding model + dimension picked at scope time.
  - **Table 3 — `memory_links`:** `from_artifact_id, to_artifact_id, relation ENUM(supports | contradicts | supersedes | implements | ui_for | review_of)`. Captures spec→audit→panel→review traceability.
  - **Retrieval pipeline (in this order — do NOT collapse layers):** (1) exact metadata filter first (scope, persona, slice id, date range); (2) vector similarity over the filtered candidate set; (3) full-text / exact-id lookup for spec sections, file paths, commit hashes; (4) assemble compact working context (typed, deduplicated, source-cited).
  - **Delta refresh:** when canonical files (specs, scope artifacts, panel notes, memory feedback files) change, re-chunk + re-embed only the diff; preserve link graph.
- **Discipline warning (owner-locked):** vector retrieval is NOT a substitute for (a) canonical source of truth (the files in repo), (b) verification (rule 23 confidence check + rule 27 re-reading locked behavior before drafting), or (c) explicit owner/friend decisions. The service is a RETRIEVAL LAYER on top of canonical truth, not a replacement for it. Maps onto the rule-27 4-bucket model: this slice builds out bucket 4 (vector-retrievable memory) at the workflow-tooling layer, parallel to where rule 27 already names it at the product-data layer.
- **expected verification gate:** `REAL_DB` — embedding round-trip + metadata filter correctness + delta refresh idempotency + link graph traversal.
- **status:** `QUEUED — AWAITING_F-004_DONE`. Do not start before F-004 is APPROVED + DONE. Owner explicit: "Do not pause F-004 to build this first."

### F-010 — Handoff v2 / client-context expansion

- **id:** F-010
- **title:** A clean first-class transfer of L3 client-side context (`LivingDoc.clientPreferences`) on permanent rebind — beyond F-004's siteRules-only scope.
- **why:** F-004 round-4 v3 panel pass surfaced (Suresh Pillai, FM ops 22yr field) that client-side context — building manager name, what triggers the client's complaints, finish standards, escalation paths — is at least as load-bearing for the incoming supervisor on day-1 as the operational site rules. Audit Ravi Month 9b's pain ("Anjali rediscovers lobby-mop-twice-daily via complaint") generalizes to client context: she'll also rediscover "Mr. Rao calls Reddy directly when the kitchen-floor isn't waxed by 6:30 AM" the same way. F-004 deliberately stays strict-spec (siteRules only); F-010 expands the transfer model with proper design instead of ad-hoc bolt-on.
- **NOT a blocker for F-004.** Owner picked β on 2026-05-16: keep F-004 strict; queue F-010 for clean expansion. Owner explicit rejection of option γ ("do not stuff client preferences into siteRules.ruleText — that will create semantic mess").
- **Interim until F-010 ships** (recorded in closure spec §3.7 Invariants + F-004 non-claims): supervisors should record client-specific operational points as proper site rules under L3 `siteRules` so they get transferred via mechanism Z. Pure client-preference data without an operational site-rule expression stays with the outgoing supervisor.
- **depends on:** F-004 done.
- **scope at design time (do NOT lock here; refine in scope artifact when F-010 starts):** decide which of (a) add `clientPreferences` to the frozen package alongside `siteRules` + copy on permanent rebind; (b) add a separate `handoff-context-package` JSON (decoupled lifecycle); (c) embed bucket-4 retrieval over `clientPreferences` text in the F-009 memory service (no frozen snapshot, just retrieval). Likely (a) for parity with siteRules, but design pass required.
- **closure spec impact:** likely amends §3.7 to bump schemaVersion to 2 + adds `clientPreferences` to the field set (or adds a sibling package); design decides.
- **personas touched:** Anjali (incoming on permanent rebind — primary benefit); Ravi (outgoing — no behavior change for him).
- **workflows touched:** F27 (permanent reassign primarily); F26 acting cover may also benefit, but cover is temporary so the client-context value is lower.
- **entities/routes/tables touched (proposed; refine at scope time):** likely additions to `HandoffPackagePayloadSchema` (or sibling), additions to mechanism-Z LivingDoc copy logic (`handoff-package-writer.ts`), new test cases.
- **expected verification gate:** `REAL_DB` — clientPreferences-copy correctness across acting / permanent paths + cross-tenant isolation + schemaVersion bump correctness.
- **status:** `QUEUED — AWAITING_F-004_DONE`. Owner-locked deferral 2026-05-16 (F-004 round-4 v3 panel pass, Material #2 = β).

### F-011 — OneSignal mobile SDK + identity linking + push delivery adapter

- **id:** F-011
- **title:** OneSignal mobile SDK install + `OneSignal.login(external_id = User.id)` identity linking + backend push delivery adapter consuming F-007's `channel='push'` rows + delivery-time `WORKER_SUPERVISOR_CHANGE_NOTIFIED` audit emit + pre-dispatch eligibility re-check + typed `failureReason` enum.
- **why:** Decision 4 (mandatory worker supervisor-change notification) requires real push delivery. F-007 ships the persistence rows; F-011 turns them into actual push notifications via OneSignal. Replaces an earlier "FCM/Expo + push-token on Device" plan dropped at v8 in favor of the managed-provider approach.
- **Architecture rule (v8 locked):** our DB owns truth + audit + unread/read history + app panel; **OneSignal owns push subscription plumbing + delivery transport only**; future grouping stays read-side, not write-side. **NO** `pushToken` / `pushPlatform` / `tokenUpdatedAt` fields on `Device` — OneSignal SDK owns subscription/token lifecycle entirely.
- **depends on:** F-007 (Notification rows exist) + F-006 (worker mobile app exists to install the SDK in). OneSignal account setup is a prerequisite operational task.
- **personas touched:** Suresh (worker — receives actual push), Ravi/Anjali/Lakshmi (supervisors — receive actual push).
- **workflows touched:** F26 + F27 push delivery; F-006 in-app banner remains independent (F-006 reads DB regardless of push state).
- **entities/routes/tables touched:**
  - **Mobile SDK install** in `apps/worker-mobile/` + `apps/supervisor-mobile/` (or wherever F-006 lands).
  - **Identity lifecycle:** call `OneSignal.login(external_id = User.id)` on every identified app open / login. On app logout: `OneSignal.logout()` to detach the current device. On User soft-delete-and-re-create (rare): `OneSignal.logout()` on old session + re-link on next login under the new `external_id`.
  - **Backend delivery adapter** consuming F-007's `channel='push'` rows where `deliveredAt IS NULL AND failedAt IS NULL`. Dispatches via OneSignal REST API targeting by `external_id`.
  - **Pre-dispatch eligibility re-check (v11 — material correctness rule):** for each push row, the adapter re-fetches the target User (reference the existing schema soft-delete signal — likely `User.deletedAt`; verify against `packages/shared-schema/prisma/schema.prisma` at implementation time):
    - User not found → stamp `failedAt + failureReason='recipient_removed'` (terminal — no retry).
    - User soft-deleted/inactive → stamp `failedAt + failureReason='recipient_inactive'` (terminal — no retry).
    - User active + OneSignal active subscription count = 0 → stamp `failedAt + failureReason='no_active_subscription'` (terminal — covers logout, uninstall, never-opened-app, all-tokens-expired).
    - User active + ≥1 subscription → dispatch.
  - **On successful delivery:** stamp `Notification.deliveredAt = now()` + emit `WORKER_SUPERVISOR_CHANGE_NOTIFIED` AuditEvent + optionally record `providerMessageId` on the row for observability.
  - **Failure policy — typed `failureReason` enum (v11 — 6 round-1 values):** terminal-no-retry: `'no_active_subscription'` / `'recipient_inactive'` / `'recipient_removed'`. Transient-bounded-backoff-retry: `'rate_limited'` / `'provider_error'` / `'network_error'`. `'expired_token'` reserved for future use (only emitted if OneSignal returns a distinct token-dead signal not subsumed by zero-subscription state).
- **Pricing/business note (NOT an architecture rule):** OneSignal billing is per **active mobile subscription** (MAU), NOT per User row or employee — one user with two active devices counts as 2 MAUs. Free/Growth/Professional tier boundaries are commercial details that can change; verify current OneSignal billing terms before go-live and at every scale-up decision.
- **Owner-digest segmentation requirement (panel-test Naina + Reddy):** the owner monthly digest MUST group failed rows by `failureReason` to distinguish "transport failed — actionable" from `'no_active_subscription'` which is an onboarding/adoption signal (workers haven't installed the app yet). Without segmentation, a fresh tenant's first month will look like a 70%+ failure rate. Documented as an explicit requirement for the owner-digest slice.
- **expected verification gate:** `REAL_DB` + OneSignal sandbox project + Playwright on mobile builds.
- **status:** `QUEUED — AWAITING_F-007_DONE_AND_F-006_DONE`.

### F-012 — SMS + WhatsApp adapter (paid channels)

- **id:** F-012
- **title:** SMS + WhatsApp delivery adapter for `Notification.channel='sms'` + `'whatsapp_out'` rows; primary use is delivering to `Worker.userId IS NULL` recipients (no OneSignal subscription possible) via `Worker.phone`.
- **why:** Decision 4 channel chain (closure §5 line 78): push → SMS → WhatsApp-out → email. Also closes the persistent push-gap for workers with no User account (v11 panel-test Suresh Pillai). SMS/WhatsApp are PAID — owner go required before this slice opens.
- **depends on:** F-007 (rows exist) + F-011 (push transport for primary channel exists) + owner approval on paid-channel spend.
- **personas touched:** Suresh-without-User-account (primary — finally has a delivery path), all workers as push-fallback.
- **workflows touched:** F26 + F27 channel-fallback chain.
- **entities/routes/tables touched:** SMS provider integration (TBD: Twilio / Gupshup / etc.); WhatsApp Business API integration (TBD); F-007 channel-set extension to include `'sms'` + `'whatsapp_out'` rows when paid channels are live; channel-fallback retry chain logic (push fails → SMS → WhatsApp → email).
- **expected verification gate:** `REAL_DB` + provider sandbox.
- **status:** `QUEUED — AWAITING_OWNER_GO_ON_PAID_CHANNELS`.

---

## How to add an item to the queue

Insert in priority order. Use the F-NNN convention (next free number). Match the field set above exactly. Update status as work progresses.
