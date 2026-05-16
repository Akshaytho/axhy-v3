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
- **status:** `AWAITING_APPROVAL` 2026-05-16 — code slice complete on `feat/f-004-handoff-package-composer`. Real-DB sweep **19/19 files · 106/106 cases pass** on fresh local Postgres 16 (95 baseline + 11 new F-004 cases). 3 new files (Zod schema, composer, writer); 2 wiring edits (site-supervisor-binding.ts + audit-payloads.ts/index.ts). All 8 picks + Open Q2=(b) + Open Q5 interim + schemaVersion=1 + STRICT CalendarEntry filter + Q2-locked-zero-LivingDoc-on-first-ever-binding + Material #2 β (clientPreferences NOT transferred) + 3 panel code-stage notes all implemented. Awaits friend's file-grounded review. Round-1 = 3 shape drifts; round-2 = 2 more shape drifts + 1 citation gap; round-3 fixed shape drifts but introduced 2 honesty-of-wording drifts caught by friend: (a) pick 1 + pick 3 overclaimed "EXACTLY per spec" / "no additions, no omissions" while Open Q5's interim `kind`-field default is still in play — cannot claim exact alignment to a locked field while one mapping is interim; (b) Open Q2 smuggled a first-ever-binding summary-entry text ("First binding for `<siteName>` on `<date>` — no prior supervisor context") as if spec-locked, but it is a NEW product choice without owner sign-off. **Round-4 revision 2026-05-16 late evening:** pick 1 + pick 3 reworded honestly ("matches spec §3.7 line 307's field set, with `kind` using an interim default per Open Q5 until a dedicated schema field exists"); Open Q2 reframed as a new product choice (3 options listed: (a) write "First binding for `<siteName>` on `<date>` — no prior supervisor context" / (b) write NO entry / (c) owner-supplied wording; recommended (a), but NOT locked; owner picks). **Rule 27 expanded** to lock the **Postgres + pgvector + delta/live AI-memory architecture** as the 4-bucket model: (1) exact SQL truth — relational rows point-in-time; (2) frozen SNAPSHOT — immutable JSON capturing judgement; (3) live-or-delta-refreshed — on-demand SQL or event-invalidated cache; (4) vector-retrievable memory — pgvector similarity over embedded text. Do NOT collapse buckets. Pre-design checklist Q3 expanded from 2 buckets (LIVE/SNAPSHOT) to 4-bucket model; Q4 now covers BOTH shape redesign AND honesty-of-wording. F-004 §0 Q1 adds the pgvector/4-bucket architecture as a locked product-behavior row; §0 Q3 restructured to label every data piece into 4 buckets (handoffPackage = bucket-2 only; getEffectiveBinding = bucket-1; LivingDoc rules = bucket-1+4; long-horizon planning = bucket-3+4). Rule-27 locks updated across all 4 places (INDEX.md + production-grade-rulebook.md + memory + portable). 8 picks substance unchanged; round-4 changes are wording-honesty + 4-bucket architecture lock. Awaits owner + friend sign-off on round 4 (owner explicitly picks Open Q2 option a/b/c); no code lands until both sign off.

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

---

## How to add an item to the queue

Insert in priority order. Use the F-NNN convention (next free number). Match the field set above exactly. Update status as work progresses.
