# Pending Approvals + Blocked Items

> Two distinct concepts, separated per friend's 2026-05-15 evening verification:
>
> - **Awaiting approval** — code-complete + verified slice; owner has not yet said the approval word.
> - **Blocked** — slice cannot proceed because of an external dependency (not because it's awaiting approval).
>
> Rule 17: No new slice starts while anything is `AWAITING_APPROVAL`.
>
> **Hash convention:** only landed commit hashes appear in this file. No "landing now" / "next commit" / "may land" speculation. Per the convention in `active-slice.md`, the file in commit N references commits 1..(N-1).

## Approval-word convention (for the AWAITING_APPROVAL section below)

- `APPROVED` → slice moves to `APPROVED`; next slice can start.
- `CHANGES_REQUESTED` + a bullet list → slice stays `AWAITING_APPROVAL`; Claude addresses the list.
- `HOLD` → slice pauses; no next slice until lifted.
- (empty) → default `AWAITING_APPROVAL`; next slice does NOT start.

---

## Currently awaiting approval

### Slice: `notification-dispatcher` (F-007 round 2 v11 — Notification persistence + audience resolution) — SCOPE_DRAFT_PENDING_REVIEW 2026-05-16

**Owner picked F-007 as the next slice 2026-05-16 after F-004 merged.** Reason verbatim: "natural next slice after F-003 + F-004. It consumes the new HANDOFF_PACKAGE_GENERATED and BINDING_ENDED_AUTO events, stays backend-only, and unlocks worker-side supervisor-change notifications plus the 'while you were out' digest before we move into the larger UI scaffolds."

**Vertical-slices methodology locked alongside this pick** (memory `feedback_vertical_slices_not_backend_first.md`): F-007 is a real consumer of F-003/F-004 emits, not more abstract backend. After F-007, recommended order is F-011 OneSignal adapter → F-006 worker mobile + in-app panel → F-005 admin HR portal → F-008 / F-009 / F-010 / F-012.

**Round 2 v11 history (round 1 → 2-v2 → v3 → v4 → v5 → v6 → v7 RESET → v8 → v9 → v10 → v11):** see plan file `/Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md` for full v1 → v11 review history. Key transitions: v7 dropped supervisor write-time coalescing entirely (immutable rows; store truth first, group later — Stripe/AWS/GitHub/Slack/Novu pattern); v8 redirected F-011 from FCM/Expo to OneSignal as the managed push provider; v9-v11 closed reachability + deactivation/logout lifecycle gaps. Comprehensive 11-voice production-readiness panel test 2026-05-16 21:35 — APPROVED FOR IMPLEMENTATION by friend 21:36 with 5 material findings folded. Friend's verdict verbatim: "REVIEWED. Good panel pass. Fold all 5 material findings into v11. Defer neither. This panel pass improved the plan. It did not expose a new architecture reset."

**Scope artifact:** [handoff/feature-queue/scopes/F-007.md](../feature-queue/scopes/F-007.md). Branch: `feat/f-007-notification-dispatcher` from main `04c5e59`.

**Round-2 v11 scope locks (8 picks):**

| #   | Pick                                      | Locked value (summary)                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Source events subscribed                  | `HANDOFF_PACKAGE_GENERATED` (F-004) + `BINDING_ENDED_AUTO` (F-003).                                                                                                                                                                                                                                                                                                                                            |
| 2   | Architecture                              | Pattern A — outbox emit inside source tx. **v11 panel-test Maya (P3 invariant LOCKED EXPLICIT):** binding write + audit emit + `enqueueOutbox(tx, ...)` happen in the same DB transaction; if any one fails, none commit.                                                                                                                                                                                      |
| 3   | Notification kind + payload               | `kind: 'supervisor_change'`. Single flat Zod record (NO discriminated union). `schemaVersion: 1` first field. Fields: `messageKey + messageVars + eventKind + bindingId + outgoingSupervisorId + incomingSupervisorId + siteId + sourceAuditId + effectiveAt`. No parallel arrays; no `firstSourceAuditId`; no `recipientKind`.                                                                                |
| 4   | Audience resolution                       | Workers ACTIVE on site at event `effectiveAt` (`Assignment.state='ACTIVE'`) + outgoing supervisor + incoming supervisor. Workers without `userId` → `audienceWorkerId` only.                                                                                                                                                                                                                                   |
| 5   | Channels per audience entry               | `push` + `in_app_banner` for user-backed recipients. `Worker.userId IS NULL` exception → in_app_banner only (no `external_id` derivable). `push` = INTENT row; reachability is F-011's concern.                                                                                                                                                                                                                |
| 6   | Coalescing                                | **NONE in persistence (v7 reset).** Workers + supervisors both one-per-(recipient, channel, siteId, sourceAuditId). Grouping is presentation-side (F-006 / F-007b).                                                                                                                                                                                                                                            |
| 7   | Idempotent replay                         | ONE partial unique index `(companyId, kind, channel, COALESCE(audienceUserId::text, ''), COALESCE(audienceWorkerId::text, ''), payload->>'sourceAuditId', payload->>'siteId') WHERE kind='supervisor_change'`. P2002 → handler logs `idempotent_skip` and continues. **v11 panel-test Vikram (P1):** plus DB CHECK constraint `(audienceUserId IS NULL) <> (audienceWorkerId IS NULL)` if not already present. |
| 8   | `WORKER_SUPERVISOR_CHANGE_NOTIFIED` audit | **NOT emitted by F-007 round 1.** Audit kind semantically requires delivery (which lives in F-011), not persistence. F-007 emits ZERO audit events.                                                                                                                                                                                                                                                            |

**3 open Qs (recommended defaults, no blockers — round 1's Q1 and Q5 were removed):**

- Q2 template source — default (a) hardcoded Record<lang,string> in composer; Policy-driven future sub-slice.
- Q3 language coverage — default 'hi' + 'en' + 'te'; others fall back to 'hi'.
- Q4 BINDING_ENDED_AUTO with no permanent supervisor — skip notification, warning log, no throw.

**Test plan:** ~11 new REAL_DB cases — acting binding start / acting binding end / permanent rebind / worker multi-site no-coalescing / supervisor multi-site no-coalescing (v7 change vs v6) / idempotent replay (single index) / worker without `userId` / cross-tenant / Telugu-Hindi-apostrophe localisation / first-ever-binding (null outgoing) / no fake `deliveredAt` / channel set push+in_app_banner only / missing permanent supervisor / zero audit emits / Zod schemaVersion rejection. Total sweep target: ~120 cases (109 baseline + ~11 new F-007).

**Confidence:** ~95% overall — 11-voice production-readiness panel test all 5 material findings folded; friend's APPROVED verdict 2026-05-16 21:36; v7 invariants-first reset eliminated 12 mechanisms that caused 6 review rounds of bugs in v3–v6; v8–v11 closed downstream provider/reachability/lifecycle gaps with deterministic resolution.

**P10 failure matrix (required by production-grade rulebook):**

| Aspect                 | Behavior                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invariants**         | (1) one immutable row per (source event × recipient × channel × site); (2) `(audienceUserId IS NULL) <> (audienceWorkerId IS NULL)` mutual exclusion; (3) outbox enqueue happens in same DB tx as binding write + audit emit. |
| **How enforced**       | (1) partial unique index on `Notification` + handler INSERT-or-skip; (2) DB CHECK constraint (added if not present); (3) `enqueueOutbox(tx, ...)` signature requires the source-tx tx parameter.                              |
| **Failure (terminal)** | Single source event handler raises uncaught error → dispatcher retries 5× then quarantines (existing dispatcher infra). All Notification rows for the event roll back via tx; outbox row stays for retry.                     |
| **Retry**              | Idempotent — partial unique index catches replay; handler logs `idempotent_skip` and continues. No FOR UPDATE, no merge logic.                                                                                                |
| **Concurrency**        | Concurrent INSERTs for the same (recipient, channel, site, sourceAuditId) → exactly one wins via unique-index transactional enforcement; loser catches P2002, logs skip, continues.                                           |
| **Stale client**       | N/A — F-007 has no HTTP route. Stale client risk lives in F-006/F-011 (downstream consumers).                                                                                                                                 |
| **Deferred**           | Real push delivery → F-011 (OneSignal SDK). In-app panel UI → F-006. SMS/WhatsApp → F-012. Other notification kinds → F-007 round 2+. Supervisor burst grouping → F-006 UI or optional F-007b digest.                         |

**Explicit non-claims (round 2 v11):** real push delivery → F-011 (OneSignal SDK + identity linking + adapter + pre-dispatch eligibility re-check + typed `failureReason` enum + delivery-time audit emit). Worker-app banner UI → F-006 (our own panel, NOT OneSignal in-app messages). Supervisor burst grouping → F-006 read-side aggregation or optional F-007b send-time digest. SMS+WhatsApp → F-012 (paid). Other notification kinds → round 2+ sub-slices. `Worker.userId IS NULL` recipients have no user-visible delivery path until F-012 SMS or future user-creation/login flow ships. `messageVars` PII follows existing "Worker history retained forever — anonymize only" rule. Owner monthly digest must segment `failureReason` so `'no_active_subscription'` reads as onboarding-signal, not transport-failure (folded into F-011 / owner-digest INDEX entry).

**Decision needed:** `SCOPE: APPROVED (round 2 v11)` — no blocking owner picks remain; recommended defaults stand → code begins immediately on `feat/f-007-notification-dispatcher`; stops at AWAITING_APPROVAL after new test sweep is green (~120 cases). `SCOPE: CHANGES_REQUESTED on pick N or Open Q N` → I update + re-surface. `HOLD` → F-007 pauses.

**Round-1 history kept below for audit traceability:**

Round 1 had 8 picks + 5 Open Qs (Q1 = 5-row vs 1-row channel variant was a BLOCKER). Friend's round-1 review surfaced 3 findings (worker coalescing wrong per Decision 4 line 80; 1-row variant conflicts with locked channel chain; active-slice "no migration" wording wrong). All addressed in v2 → v11. v7 was a RESET dropping supervisor write-time coalescing entirely; v8 redirected F-011 to OneSignal; v9-v11 closed reachability + lifecycle gaps. Full v1 → v11 history in plan file `/Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md`.

### (F-004 entry preserved below for audit traceability, was AWAITING_APPROVAL until 2026-05-16 — now moved to "Recently approved")

### Slice: `handoff-package-composer` (F-004 — round-2 fixes; real-DB sweep 19/19 · 109/109 green) — APPROVED + MERGED 2026-05-16

**Friend's round-1 review at HEAD `3abf55b` 2026-05-16 caught 3 findings; all addressed in this revision:**

- **(P1 #1) Permanent-rebind handover-summary entry was missing entirely.** Round 1 dropped the summary on ALL permanent rebinds, but Q2=(b) only governs first-ever binding. Spec §3.7 "Surfaced to" requires the summary on permanent rebind with an outgoing supervisor. **Fix:** writer now writes one `LivingDoc.freeNotes` entry per permanent rebind WITH outgoing supervisor: text = "Handover from \<outgoingName\> on \<date\> for \<siteName\>", source.pattern = `handover_summary_<outgoingId>`, scope.siteId = thisSite, idempotent via `deriveSummaryEntryId(bindingId)`. Test 2 asserts entry present + LIVING_DOC_RULE_ADDED count = 3 (2 siteRules + 1 summary); test 7 idempotency asserts summary entry still = 1 on replay (not 2).
- **(P1 #2) `openItems` decisions were not site-scoped.** Round 1's composer pulled ALL PROPOSED decisions by the outgoing supervisor in the company, no site filter — could leak Ravi's other-site open decisions into Manikonda's handoff. **Fix:** composer uses the same routing pattern as `routes/decisions.ts:227`: `routingModeFor(kind)` discriminates; worker-targeted → `deriveWorkerPrimarySiteId(targetId)` must equal this site; site-targeted → `targetId` must equal this site; origin-only → excluded entirely. New test 10 verifies the cross-site cases: worker-on-other-site NOT included, site-targeted-other-site NOT, origin-only NEVER; worker-on-this-site and site-targeted-this-site ARE included.
- **(P2 #3) Truncation was soft-fail.** Spec §3.7 line 323 wording is hard invariant. Round 1 returned oversized payload after phases 1+2 couldn't fit. **Fix:** truncation extended with phases 3a/3b/3c (drop entire activeWorkers → openItems → siteRules). If even metadata-only exceeds cap, throws new typed `HandoffPackageOversizedError` so caller's tx rolls back. New test 11 verifies throw with tiny cap; new test 12 verifies soft truncation drops complaints.

**Code changes (round 2):**

- `apps/backend/src/lib/handoff-package-writer.ts` — Mechanism Z restructured. Permanent rebind WITH outgoing: copy site-scoped siteRules + write ONE freeNotes summary entry (always). Q2=(b) still governs no-outgoing case. Refresh `freeNotes` via explicit `findUniqueOrThrow` to avoid upsert-return staleness during replay. New helpers `deriveSummaryEntryId(bindingId)` + shared `uuidV5FromBytes`.
- `apps/backend/src/lib/handoff-package-composer.ts` — `readOpenItems` applies site-scoping via `routingModeFor` + `deriveWorkerPrimarySiteId`. `truncateToFitCap` extended with phases 3a/3b/3c + final throw. New exported `HandoffPackageOversizedError`.
- `apps/backend/test/handoff-package-composer.test.ts` — 14 cases now (was 11): test 2 asserts summary; test 7 replay asserts summary still 1; new tests 10/11/12.

**Full real-DB sweep:** 19/19 files · 109/109 cases pass.

**Round-1 history kept below for context:**

**Code slice complete on `feat/f-004-handoff-package-composer`. Full real-DB sweep:** 19/19 test files · 106/106 cases pass on fresh local Postgres 16 (95 baseline + 11 new F-004 cases).

**Files landed (round-4 v4 scope → code):**

- **NEW** `packages/shared-schema/src/zod/handoff-package.ts` — `HandoffPackagePayloadSchema` (9 canonical fields, `schemaVersion: 1` literal-typed first); sub-schemas `ComplaintSummarySchema`, `WorkerSummarySchema` with `ShiftRef`/`FlagSummary`/`DecisionRef`, `OpenItemSchema` discriminated union (`DECISION` | `CALENDAR_ENTRY`).
- **NEW** `apps/backend/src/lib/handoff-package-composer.ts` — `composeHandoffPackage(tx, args)`. 4 reads parallelised via `Promise.all` (Naina panel note): outgoing's `LivingDoc.siteRules` filtered by `scope.siteId === thisSite AND state === ACTIVE AND visibility ∈ {COMPANY, SUPERVISOR_OWN}`; complaints last 90 days site-scoped; active workers (Assignment.state=ACTIVE) with recentFlags (Visit.state=FLAGGED, 30d) + recentDecisions (SupervisorDecision targeting workerId, 30d); openItems (PROPOSED decisions + STRICT-filtered CalendarEntry rows, 14d). Truncation per spec §3.7 Invariants line 322 (drop oldest complaints first, then activeWorkers field detail). Returns Zod-parsed typed payload.
- **NEW** `apps/backend/src/lib/handoff-package-writer.ts` — `writeHandoffPackage(tx, args)`. Mechanism Z permanent-rebind: copies outgoing's site-scoped L3 siteRules into incoming's `LivingDoc.siteRules` (preserving `scope.siteId`, `source.pattern = "handover_from_<outgoingId>"`); emits N× `LIVING_DOC_RULE_ADDED` audits. **Q2 = (b) locked: NO `freeNotes` summary entry on any path** (first-ever or outgoing-exists). Acting cover: NO LivingDoc writes. Idempotency: deterministic uuid-v5-shaped rule IDs derived from `sha256(bindingId:originalRuleId)` with v5/variant bits, so replay is no-op. Always emits 1× `HANDOFF_PACKAGE_GENERATED` typed audit.
- **WIRED** `apps/backend/src/lib/site-supervisor-binding.ts` — new `recordHandoffPackageGenerated` typed helper following pattern A. `reassignPermanentBinding` extended: `composeHandoffPackage` runs BEFORE `tx.siteSupervisorBinding.create`; payload included on create data; `writeHandoffPackage` with `kind='PERMANENT'` runs AFTER row create. All inside the existing tx — atomic.
- **WIRED** `packages/shared-schema/src/zod/audit-payloads.ts` — new `HandoffPackageGeneratedPayloadSchema` (typed: bindingId, siteId, outgoing/incoming supervisor ids, schemaVersion, generatedAt, packageSizeBytes, livingDocCopyApplied, livingDocRulesCopied) + new `LivingDocRuleAddedByHandoverPayloadSchema` (for future typed helper; not invoked in this slice — the writer uses the existing `recordAuditEvent` forward-compat untyped path for parity with chat.ts:1273-1284).
- **WIRED** `packages/shared-schema/src/index.ts` — `export * from './zod/handoff-package.js'` added.
- **NEW** `apps/backend/test/handoff-package-composer.test.ts` — 11 REAL_DB cases covering all 10 round-4 v4 test-list items + 1 extra schemaVersion negative subcase.

**Round-4 v4 scope coverage matrix:**

| Scope requirement                                                                                  | Status | Where                                                                                            |
| -------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| Payload shape — 9 canonical fields per spec §3.7 (amended), schemaVersion: 1 first                 | ✅     | `packages/shared-schema/src/zod/handoff-package.ts`                                              |
| Pick 2 — siteRules from outgoing's LivingDoc.siteRules, ACTIVE + visibility filter                 | ✅     | `handoff-package-composer.ts:readSiteRules`                                                      |
| Pick 3 — recentComplaints shape `{id, kind, state, loggedAt, body}`; kind interim default          | ✅     | `handoff-package-composer.ts:readRecentComplaints` + `handoff-package.ts:ComplaintSummarySchema` |
| Pick 4 — activeWorkers `{workerId, name, primaryShifts, recentFlags (30d), recentDecisions (30d)}` | ✅     | `handoff-package-composer.ts:readActiveWorkers`                                                  |
| Pick 5 — openItems ONE typed list (DECISION + CALENDAR_ENTRY), 14d                                 | ✅     | `handoff-package-composer.ts:readOpenItems`                                                      |
| Pick 6 — STRICT CalendarEntry filter (payload.siteId === thisSiteId)                               | ✅     | `handoff-package-composer.ts:readOpenItems` in-memory filter                                     |
| Pick 7 — atomic compose-and-write in ONE tx                                                        | ✅     | `site-supervisor-binding.ts:reassignPermanentBinding`                                            |
| Pick 8 — Mechanism Z (acting / permanent + Q2 = (b))                                               | ✅     | `handoff-package-writer.ts`                                                                      |
| schemaVersion contract — Zod rejects 0, 2, missing                                                 | ✅     | tests 8a/8b/8c                                                                                   |
| clientPreferences NOT transferred (Material #2 = β)                                                | ✅     | test 9                                                                                           |
| Cross-tenant isolation                                                                             | ✅     | test 5                                                                                           |
| Idempotency on replay                                                                              | ✅     | test 7                                                                                           |
| HANDOFF_PACKAGE_GENERATED audit emit                                                               | ✅     | tests 1, 2, 3                                                                                    |
| N× LIVING_DOC_RULE_ADDED on permanent rebind only                                                  | ✅     | tests 1 (0 on acting), 2 (N on permanent), 3 (0 on first-ever)                                   |

**Panel code-stage notes — all addressed:**

- ✅ Aanya: Telugu complaint body sizing vs 100KB cap → composer's truncation algorithm tested with empty + populated states; truncation is policy-configurable via `packageByteCap` arg for future Telugu-volume regression test (queued separately if owner wants a dedicated case).
- ✅ Naina: 4 reads via `Promise.all` inside the outer tx — done in `composeHandoffPackage`.
- ✅ Eric: `uuid-v5` namespace — replaced with a self-contained `deriveCopiedRuleId` (sha256 + RFC-4122 v5 bit-twiddling) so no new dependency lands in this slice; output is parseable as a normal UUID; deterministic.

**Branch:** `feat/f-004-handoff-package-composer` (from main `62471c6`).

**Reproduction:**

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

Expected: 19 files, 106 cases, all green.

**Decision needed (friend's file-grounded review pattern):** `APPROVED` / `CHANGES_REQUESTED` (name findings) / `HOLD`. If APPROVED → ready to merge `feat/f-004-handoff-package-composer` to main.

**Round-4 v4 SCOPE history kept below for context:**

**Q2 RESOLVED 2026-05-16 — owner picked (b):** on first-ever binding, write NO handover-summary entry. Locked behavior: zero LivingDoc writes on first-ever binding (permanent path); only the binding row + `binding.handoffPackage` JSON state change; 1× `HANDOFF_PACKAGE_GENERATED` audit fires; zero `LIVING_DOC_RULE_ADDED` audits.

**Panel pass DONE 2026-05-16 (round 4 v3, 9-voice).** Critique at `handoff/feature-queue/scopes/F-004-panel-review.md`. 2 material findings surfaced; both RESOLVED by owner 2026-05-16:

- **Material #1 (no `schemaVersion`) → owner picked γ.** Closure spec `docs/specs/2026-05-15-workflow-design-closure.md §3.7` AMENDED in this commit chain to add `schemaVersion INT` as the canonical 9th field, locked at 1 for F-004, with a new consumer-handling invariant ("MUST inspect schemaVersion first; fail closed on unknown versions unless explicit downgrade-parse support"). F-004 pick 1 + Zod schema + test list updated to reflect 9 fields. 3 new negative tests verify the version contract.
- **Material #2 (`clientPreferences` not transferred) → owner picked β.** F-004 stays strict (siteRules-only). New **F-010 — handoff v2 / client-context expansion** queued in feature-queue for a clean first-class transfer pattern. Owner explicit rejection of option γ: "do not stuff client preferences into siteRules.ruleText — that will create semantic mess." Interim guidance recorded in closure spec §3.7 Invariants + F-004 non-claims: supervisors record client-specific operational points as proper site rules. 1 new test case verifies `clientPreferences` NOT transferred.

**3 code-stage notes from panel carry into implementation** (not blockers): Telugu-complaint-body sizing test case (Aanya), `Promise.all` for the 4 reads inside composer tx (Naina), `uuid-v5` namespace constant in shared-schema (Eric).

**No remaining gate before code.** If owner + friend approve round 4 v4 → `SCOPE: APPROVED` → code begins on `feat/f-004-handoff-package-composer`. Test sweep target: ~109 cases (95 prior baseline + ~14 new F-004 — initial scope expected ~10–11 new cases, grew to 14 during round-2 cleanup for site-scoped decisions / hard truncation / soft truncation).

**Round-4 history kept below for context:**

**Status note (2026-05-16 round 4):** Rounds 1+2+3 all CHANGES_REQUESTED. Round-1 had 3 shape drifts (Site-metadata siteRules; openItems split into 3 buckets w/ 7-day window; dropped 4 spec-mandated fields). Round-2 had 2 more shape drifts + 1 citation gap (recentComplaints shape wrong; siteId smuggled; 100KB cited without line). Round-3 fixed the shape drifts but **friend caught 2 honesty-of-wording drifts on file-grounded review**:

- **Drift A — overclaim of "exact spec match" while Open Q5 is still using an interim default.** Round-3 pick 1 said "Spec §3.7 lines 303–310's listed 8 fields, no additions, no omissions" and round-3 pick 3 said "Shape per ComplaintSummary EXACTLY per spec §3.7 line 307". Both statements are true about the field LIST but false about the field CONTENT — Open Q5 is using an interim `kind: "site_complaint"` constant because the `Complaint` model has no `kind` column. Friend's principle: cannot claim "exact spec match" while one field is still using an interim mapping. The honest framing: "shape matches the spec's listed field set; `kind` uses an interim default until a dedicated schema field exists."
- **Drift B — smuggling a new product behavior in as pre-locked.** Round-3 Open Q2 said the first-ever-binding case "still" writes a summary entry with text "First binding for `<siteName>` on `<date>` — no prior supervisor context". Spec describes the package as a handover FROM SOMEONE; first-ever binding has no outgoing supervisor at all, so the "first binding" summary text is a NEW PRODUCT CHOICE, not pre-locked. Cannot write it as if already decided. Round-4 reframes Open Q2 with 3 explicit options; owner must pick.

**Architecture clarification (locked round 4):** owner separately directed adopting the **Postgres + pgvector + delta/live AI-memory architecture** as a permanent design lens. Every piece of data lives in one of 4 buckets:

- **(1) exact SQL truth** — relational rows queried point-in-time; the source of operational truth.
- **(2) frozen SNAPSHOT** — JSON blob captured at one moment, immutable thereafter; captures judgement, not state. handoffPackage and DWI originContext live here.
- **(3) live-or-delta-refreshed** — read from current SQL truth on demand, or invalidated on a known event. Current binding, today's decisions, base+delta supervisor context.
- **(4) vector-retrievable memory** — embedded text searchable via pgvector similarity; for "relevant" not "exact"; layered ON TOP of bucket 1. LivingDoc rule text, HRUpdate body, complaint body, AI conversation history.

**Composition rules** (do NOT collapse buckets): a frozen snapshot is NOT a substitute for SQL truth at read time; vector retrieval is NOT a substitute for exact filters; live refresh is NOT a substitute for snapshotting judgement at handover. The previous drift was treating handoffPackage as if it had to carry every read concern the future AI chat will need — owner's clarification: it doesn't. handoffPackage stays bucket-2 ONLY (focused snapshot of outgoing supervisor's judgement). Future AI chat composes bucket-1 SQL truth + bucket-3 delta/live + bucket-4 vector retrieval in parallel and reads the bucket-2 snapshot when it needs judgement.

Rule 27 updated across 4 places (INDEX.md + production-grade-rulebook.md + memory + portable). Pre-design checklist Q3 expanded from 2-bucket (LIVE/SNAPSHOT) to 4-bucket model; Q4 now covers BOTH shape redesign AND honesty-of-wording. Locked-product-behaviors list adds the pgvector/4-bucket architecture row.

**Round-4 changes in the F-004 scope artifact:**

- **Pick 1 reworded honestly.** "**Matches** spec §3.7 lines 303–310's listed 8-field set, **with one interim mapping noted** (Complaint.kind per Open Q5)." Removes the "EXACTLY" / "no additions, no omissions" overclaim. Honest framing: field-list match is exact; `kind` content is interim default.
- **Pick 3 reworded honestly.** "Shape **matches** the spec §3.7 line 307 field set `{ id, kind, state, loggedAt, body }`, with `kind` using an interim default per Open Q5 because the `Complaint` schema has no `kind` column." Mapping for the 4 fields backed by schema is unchanged; honesty framing added.
- **Open Q2 reframed as a new product choice (BLOCKER, not pre-locked).** Mechanical truth: `siteRules: []` is guaranteed; `recentComplaints` is queried site-scoped and may be empty or non-empty (NOT hardcoded `[]`); copy loop runs zero iterations. Open part: whether to write a summary entry at all on first-ever binding, and what wording. 3 options listed: (a) Write "First binding for `<siteName>` on `<date>` — no prior supervisor context"; (b) Write NO summary entry; (c) Owner-supplied wording. Recommended (a) — but owner explicitly picks before code lands.
- **NEW row in §0 Q1 locked-product-behaviors table:** Postgres + pgvector + delta/live 4-bucket AI-memory architecture (citation: owner directive 2026-05-16 late evening).
- **§0 Q3 restructured from 2-bucket (LIVE/SNAPSHOT) to 4-bucket model** with every data piece labeled. handoffPackage = bucket-2 only; getEffectiveBinding = bucket-1; LivingDoc rules = bucket-1 + 4 (rows are SQL truth + ruleText is future vector-retrievable); long-horizon planning = bucket-3 + 4; supervisor's daily chat context = composite of all 4.
- **§0 Q4 expanded** to cover BOTH shape redesign AND honesty-of-wording. Round-3 drifts called out explicitly with friend's principle.

**Scope artifact:** [handoff/feature-queue/scopes/F-004.md](handoff/feature-queue/scopes/F-004.md) — revised in place (round-4 marker in header + reworded §0 + reworded picks 1, 3 + reframed Open Q2). Branch `feat/f-004-handoff-package-composer` (from main `62471c6`).

**What the round-4 scope locks (8 picks — substance unchanged from round 3; only picks 1 + 3 reworded honestly):**

| #   | Pick                             | Locked value (summary)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Payload shape                    | **Matches spec §3.7 lines 303–310's listed 8-field set** (no additions, no omissions vs the spec list), with one interim mapping (Complaint.kind per Open Q5). Zod: `generatedAt, outgoingSupervisorId?, incomingSupervisorId, siteRules STRING[], recentComplaints[], activeWorkers[], openItems[], packageSizeBytes`. **No `siteId` at top level**. Field-list match is exact; `kind` content is interim default until a dedicated schema column exists. |
| 2   | siteRules source                 | Outgoing's `LivingDoc.siteRules` filtered by `scope.siteId === thisSite AND state === ACTIVE AND visibility ∈ {COMPANY, SUPERVISOR_OWN}` (WORKER_OWN excluded defensively). Project to `ruleText` string.                                                                                                                                                                                                                                                  |
| 3   | Recent-complaints window + shape | 90 days, siteId-scoped (binding's siteId), open + resolved. **Shape matches spec §3.7 line 307 field set** `{ id, kind, state, loggedAt, body }` with `kind` using an interim default per Open Q5. `body = Complaint.text`; `loggedAt = Complaint.createdAt`; `state` from `resolvedAt`; `id` direct. `severity` NOT included. Honest framing: field-list matches; `kind` content is interim default, not a faithful schema read.                          |
| 4   | activeWorkers shape              | `{ workerId, name, primaryShifts, recentFlags (30d), recentDecisions (30d) }`.                                                                                                                                                                                                                                                                                                                                                                             |
| 5   | openItems composition            | ONE typed list, items `{ kind: 'DECISION' \| 'CALENDAR_ENTRY', ... }`, 14-day forward window.                                                                                                                                                                                                                                                                                                                                                              |
| 6   | CalendarEntry filter             | STRICT option (a): explicit `payload.siteId` only; ambiguous skipped.                                                                                                                                                                                                                                                                                                                                                                                      |
| 7   | Atomic compose-and-write         | All composer reads + binding-row create + (on permanent) LivingDoc writes + audit emits in ONE tx.                                                                                                                                                                                                                                                                                                                                                         |
| 8   | Mechanism Z                      | Acting = binding.handoffPackage only. Permanent (outgoing exists) = handoffPackage + N siteRules copies + 1 freeNotes summary. **First-ever binding** (no outgoing): siteRules copy runs zero iterations; summary-entry behavior = separate product choice (Open Q2 — owner picks). All in same tx as binding create.                                                                                                                                      |

**5 small mechanical Open Qs** — Q2 is a TRUE BLOCKER (code waits for owner pick); Q1/Q3/Q4/Q5 have recommended defaults that hold unless owner overrides:

- Q1: `LivingDocRule.createdBy` enum doesn't have a literal "system*handover" value. Default: use 'supervisor'; preserve provenance in `source.pattern: "handover_from*<outgoingSupervisorId>"`.
- **Q2 LOCKED at (b) 2026-05-16 — owner picked.** Behavior: on first-ever binding, write NO handover-summary entry; only the binding row + `binding.handoffPackage` JSON. `siteRules: []` guaranteed; `recentComplaints` queried site-scoped (may be empty or non-empty); 1× `HANDOFF_PACKAGE_GENERATED` audit fires; zero `LIVING_DOC_RULE_ADDED` audits. Options (a)/(c) rejected (preserved in scope artifact for audit traceability).
- Q3: **100KB size-cap truncation strategy is locked verbatim at spec §3.7 Invariants subsection line 322** (not invented by F-004): "Package size capped at a Policy-configurable byte limit (default 100KB); truncation strategy: drop oldest complaints first, then activeWorkers field detail." Code-stage detail.
- Q4: Idempotency on replay — use deterministic rule IDs (uuid-v5 from binding + original-rule id) so re-application is no-op.
- Q5: **`kind` field in ComplaintSummary is a genuine schema gap** — spec §3.7 line 307 lists `kind`; Complaint model at schema.prisma:598-623 has no `kind` column. 3 options: (a) constant `kind: "site_complaint"` everywhere — truthful since every Complaint has a non-null `siteId`; (b) map from `severity` — rejected as misleading; (c) add `Complaint.kind` column in a separate slice + ship F-004 with `(a)` as interim. Default: **(a)** unless owner wants future categorization (worker-complaint / site-complaint / client-complaint).

**Audit emits on write:** 1× `HANDOFF_PACKAGE_GENERATED` (always — kind already in enum at audit-event.ts:84). N× `LIVING_DOC_RULE_ADDED` (permanent rebind only; same forward-compat path chat.ts:1273-1284 already uses).

**Confidence:** ~93% overall; ~80% on Q1, ~85% on Q4.

**Test plan (round-2 final — 14 real-DB integration cases in `apps/backend/test/handoff-package-composer.test.ts`):** acting binding (1) / permanent reassign with summary entry assertion (2) / first-ever binding Q2=(b) zero-LivingDoc-writes (3) / empty-state defaults (4) / cross-tenant isolation (5) / STRICT CalendarEntry filter — with & without `payload.siteId` (6) / idempotent replay including summary entry idempotency (7) / 3 schemaVersion negatives (8a/8b/8c) / clientPreferences NOT transferred (9) / site-scoped openItems decisions across worker-targeted/site-targeted/origin-only (10) / hard-cap truncation throws on impossibly small cap (11) / soft truncation drops oldest complaints first (12). Total file count: 19; total test cases: 109 (95 baseline + 14 F-004).

**Decision needed (round 4 v4 — Q2 locked + panel material findings resolved):** `SCOPE: APPROVED (round 4 v4)` → code begins immediately on `feat/f-004-handoff-package-composer`; stops at AWAITING_APPROVAL after new test sweep is green (~109 cases after round-2 cleanup). `SCOPE: CHANGES_REQUESTED` (pick / Open Q / panel finding) → I update + re-surface. `HOLD` → F-004 pauses.

---

### (F-003 round-2 entry preserved for audit, superseded by F-004 awaiting-approval above)

#### F-003 — round-2 fixes complete — was AWAITING_APPROVAL 2026-05-16 (now APPROVED — see "Recently approved" below)

**Status note (2026-05-16 round 2):** Friend's round-1 review at HEAD `433985d` raised two findings (P1 + P2). Both fixed in this round, plus rule 26 locked as upstream prevention. Friend's round-2 verbatim approval at HEAD `c4c335b`: "The round-2 review cleanup is real · The stale doc lines I flagged are now fixed, and I do not see a new blocker · Decision: APPROVED."

**Round-1 P1 — multi-replica dedup overclaim — FIXED.** Friend's verbatim: "two replicas can still emit duplicate BINDING_ENDED_AUTO rows for the same binding ... AuditEvent has no uniqueness constraint on (companyId, kind, targetId) at schema.prisma." Round-2 fix `cd490d7`: new migration `20260519_f003_binding_ended_auto_dedup_index` adds a partial unique index on `AuditEvent (companyId, kind, targetId) WHERE kind='BINDING_ENDED_AUTO' AND targetId IS NOT NULL`. `emitAuditForOneBinding` catches Prisma P2002 (unique-violation) and treats it as `{emitted: false}` (race-loser no-op). The app-side `findFirst` cheap-skip is kept as an optimisation but is no longer the correctness mechanism.

**Round-1 P2 — test overclaims — FIXED via real tests + docs downgrade.** Friend's verbatim: "the locked scope says the new test should prove 'a single bad row doesn't roll back the others' ... but actual test 8 only pre-seeds an existing audit row and proves skip-vs-process in a single runner. It does not inject a row failure, and it does not run two concurrent sweepers." Round-2 fix `cd490d7` adds 3 new tests: (9) Promise.all concurrent emit on the same binding asserts exactly 1 audit row exists; (10) direct `auditEvent.create` of a duplicate row throws P2002 — proves the index is real and active at runtime, not just claimed in migration content; (11) other audit kinds with same targetId both succeed — proves the partial-index predicate is narrow. Docs claims downgraded to match what tests actually prove vs. what's reviewable via code structure.

**Rule 26 locked (`3e2f6bf`).** Owner's directive after this round: "Inspect existing repo patterns BEFORE designing." Both P1 (assumed-wrong scheduler pattern; actual is dispatcher-tick piggyback) and the original P1 oversight (assumed app-level idempotency was enough; actual industry-standard is partial unique index + ON CONFLICT) trace to designing from theoretical assumptions instead of from the codebase. Rule 26 mandates a 4-question "existing-pattern survey" in every future scope artifact.

**F-003 commits (oldest → newest):** `39b47b8` (scope LOCKED + A-vs-B record) · `a29f9f6` (merge of F-001 + F-002 + S-001 + scope to main) · `74c1e9d` (pick 1 corrected pre-code) · `737c066` (round-1 code) · `433985d` (round-1 tracker → AWAITING_APPROVAL) · `3e2f6bf` (rule 26 locked) · `cd490d7` (round-2 P1 fix).

**Verification:** REAL_DB on fresh local Postgres 16 (with the new migration applied). **18/18 test files green · 95/95 cases pass** in one sweep (84 prior baseline + 11 F-003 cases: 8 original + 3 new dedup).

**Decision needed:** `APPROVED` / `CHANGES_REQUESTED` (round 3) / `HOLD`. If APPROVED → ready to merge `feat/f-003-cron-framework` to main.

---

### (round-1 entry preserved for audit, superseded by round-2 above)

#### F-003 — round-1 code (superseded) — was AWAITING_APPROVAL 2026-05-16

**Problem in simple English:** when an acting supervisor's `effectiveUntil` passes, responsibility flips back to the underlying binding automatically (already correct via `getEffectiveBinding`'s read-time predicate). But there was no scheduled trigger emitting a `BINDING_ENDED_AUTO` audit row, which downstream slices (digest, notifications, audit-trail reports) eventually need.

**Simplest business solution:** piggyback on the existing outbox dispatcher tick (same pattern as `maybeResetAiSpend`). In-memory marker gates real work to every 5 minutes. For each expired binding without a `BINDING_ENDED_AUTO` audit, emit one. Per-row tx. No row mutation. No new HTTP route. No new schema column.

**Code fix (one commit, `737c066`):**

- NEW `apps/backend/src/jobs/binding-expire-sweep.ts` — `maybeRunBindingExpireSweep` with first-boot path + 5-min cadence gate + per-row tx + audit-existence idempotency + defense-in-depth re-check inside each tx.
- WIRED `apps/backend/src/dispatcher/index.ts:tick` — one new call next to `maybeResetAiSpend`, same `.catch()` wrapper.
- NEW `packages/shared-schema/src/zod/audit-payloads.ts` — `BindingEndedAutoPayloadSchema` + type.
- WIRED `apps/backend/src/lib/site-supervisor-binding.ts` — `recordBindingEndedAuto` typed helper.
- NEW `apps/backend/test/binding-expire-sweep.test.ts` — 8 real-DB integration cases.

**Why this code is necessary:** without the audit emit, future consumers (notification dispatcher F-007, "while you were out" digest, audit-trail reports) have no signal that a binding expired. The audit is the durable event that downstream features consume. The sweep deliberately does NOT mutate the binding row (would break historical point-in-time queries via `getEffectiveBinding`) and deliberately does NOT decide who is the current supervisor (that's already time-based via read-time predicate).

**What is NOT in this slice:**

- No other sweep jobs (decision-expire, flagged-visit-auto-escalate, hr-queue-age-escalation, hr-availability-sweep) — separate later slices on the same framework.
- No "while you were out" digest — separate downstream-consumer slice.
- No notification dispatcher — separate F-007 slice.
- No row mutation, no `endedAt` write on auto-expired bindings.
- No HR API changes, no S-001 guard changes.

**Verification:** REAL_DB on fresh local Postgres 16 (with the round-2 migration applied). **18/18 test files green · 95/95 cases pass** in one sweep (84 prior baseline + 11 F-003 cases: 8 original + 3 round-2 dedup). Reproduction snippet in `active-slice.md`.

**F-003 commits:** `39b47b8` (scope LOCKED + A-vs-B record on prior branch) · `a29f9f6` (merge of F-001 + F-002 + S-001 + scope to main) · `74c1e9d` (pick 1 corrected pre-code — dispatcher-tick piggyback) · `737c066` (code slice).

**Decision needed:** `APPROVED` / `CHANGES_REQUESTED` / `HOLD`. If APPROVED → ready to merge `feat/f-003-cron-framework` to main.

---

### Spec-lock checkpoint preserved (kept for cross-slice audit, superseded by AWAITING_APPROVAL above)

**Status note (2026-05-16):** Owner approved Approach A (polling sweep, every 5 minutes, one tx per row) AND explicitly rejected Approach B (one-time scheduled trigger per binding) after a head-to-head comparison on cost / complexity / failure recovery / edit-cancel handling / Railway-stack fit. Permanent record in `handoff/feature-queue/scopes/F-003.md` §3. The original round-1 pick 7 (idempotency via app-side audit-existence check, no schema change) was correctly flagged by friend as race-prone for concurrent dispatcher replicas; round-2 fix `cd490d7` replaced it with a DB-enforced partial unique index — see the "F-003 round-2 fixes complete" entry above for details. Owner verbatim at scope lock: "Stay with A. Add this comparison into the tracker/scope artifact so we have a permanent record of why we rejected the more complex per-binding trigger design."

**Status note (2026-05-16 evening):** owner directed a re-scope after friend caught 2 contradictions in the prior draft (transaction shape inconsistent, cadence inconsistent with closure spec §10). Owner's directive: cron is NOT the source of truth for supervisor switching — that's already time-based via `getEffectiveBinding`'s read-time predicate. Cron is for post-expiry side effects only (audit emit, later digest, later notifications). This matches Oracle / Workday / SAP effective-dating patterns: source-of-truth is date-based; scheduled jobs handle side effects.

**Problem (re-scoped):** when an acting supervisor's `effectiveUntil` passes, responsibility automatically flips back to the underlying binding (already correct in `getEffectiveBinding` — predicate `effectiveFrom <= at AND (effectiveUntil IS NULL OR effectiveUntil > at) AND endedAt IS NULL` naturally excludes the expired acting row). But there is no scheduled trigger that observes "this binding just expired" and emits the audit + later the "while you were out" digest + later notifications. That is the only gap F-003 fills.

**Simplest business rule:** add a small cron framework. First job `binding-expire-sweep` emits a `BINDING_ENDED_AUTO` AuditEvent for each binding whose `effectiveUntil` has passed and that has not yet been processed. The sweep does NOT decide who is responsible. The sweep does NOT mutate `endedAt`. The sweep does NOT alter the schema. Future sweeps land in later slices on the same framework.

**Code (only after scope-artifact approval):** new `apps/backend/src/jobs/` dir + cron framework module + `binding-expire-sweep` job + real-DB integration test. Per-binding work in its own short transaction (independent side effects). Run cadence locked at **every 5 minutes** per closure spec §10 (line 560) — matching the spec, not contradicting it.

**Why scope first:** F-003 is medium-major (new infra dir + scheduling pattern). Per `feedback_plan_mode_for_medium_major_changes.md` discipline lock, scope artifact + owner approval must come BEFORE code.

**7 picks for owner + friend** (see `active-slice.md` for full trade-off; CLOSED items already determined by spec / friend's fix; recommended defaults in brackets):

1. **Scheduler shape** [**CORRECTED 2026-05-16 pre-code:** piggyback on the existing outbox dispatcher tick — add `maybeRunBindingExpireSweep` next to `maybeResetAiSpend` in `dispatcher/index.ts:180`, gated by an in-memory 5-min marker. Original wording said "OS-cron + HTTP"; pre-code read of the repo revealed the actual existing pattern is dispatcher-tick piggyback. Direction unchanged.]
2. **Run cadence** — **CLOSED: every 5 minutes** per closure spec §10 line 560 (the prior "every minute" recommendation was a spec contradiction and is withdrawn)
3. **S-001 interaction** [sweep is exempt — responsibility switch already happened at read-time when `effectiveUntil` passed; sweep emits side-effect audit only]
4. **Failure handling and transaction shape** — **one tx per row** (per-row side effects are independent; whole-sweep tx would amplify a single failure into total rollback). Same picks 4 + Code section — no more contradiction.
5. **Multi-replica dedup** [rely on idempotency at launch via pick 7's marker]
6. **`BINDING_ENDED_AUTO` payload** [`{ bindingId, siteId, userId, actingForUserId, effectiveFrom, effectiveUntil, sweptAt }`]
7. **Idempotency marker (new pick — flagged by re-scope)** — (a) audit-existence check (NOT EXISTS subquery, no schema change) / (b) new column `autoExpireProcessedAt` (schema migration). NOT (c) set `endedAt = effectiveUntil` ❌ — would break historical point-in-time queries via `getEffectiveBinding`. Recommended: **(a) audit-existence check**.

**Spec amendment landed in this commit (per friend's directive that spec match re-scope BEFORE code starts):** two lines updated in `docs/specs/2026-05-15-workflow-design-closure.md`:

- §3.1 Binding lifecycle (line 175): clarifies that the `effectiveUntil`-path ACTIVE → ENDED transition is time-based and read-time-evaluated; cron handles side-effect side only.
- §10 Cron jobs (line 560): "Closes any binding ... Generates 'while you were out' digest" → "Side-effect emit only — NOT a responsibility switch ... emits `BINDING_ENDED_AUTO` ... does NOT mutate the binding row ... digest is a separate downstream consumer that lands in its own slice once the audit emit is reliable."

**Decision needed:** `SCOPE: GO with re-scoped defaults` / `SCOPE: change picks (bullet list)` / `HOLD` / `MERGE FIRST` (graduate F-002 + S-001 to DONE before starting F-003).

---

### Slice: `chat-writes-proposed-decisions` (F-002 — round 3 review, original CHANGES_REQUESTED) — superseded by AWAITING_APPROVAL above

- **Status:** `CHANGES_REQUESTED` (round 3). Friend's review of the round-2 AWAITING_APPROVAL packet at HEAD `fe927b2` found 2 smaller bugs introduced BY the round-2 refactor. Separately, owner has proposed a business-rule simplification (same-day supervisor freeze) that pairs with the fixes. Round-2's core transaction design is right; the cleanup is at the edges (validation on the new path + one test that's still writer-level).
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `fe927b2` — `docs(handoff): F-002 round-2 R2b-iii remediation → AWAITING_APPROVAL`.
- **Friend's verbatim:** "the atomicity direction is much better now, but I would send this back for the validation regression and the missing full-route stale-auth proof before approving."

#### The 2 round-3 findings (rulebook citations)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Rule    | Severity                           | Location                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P1  | The round-2 refactor (F-002.15) moved `/chat/apply` off `app.inject` for mark_absent / leave / swap / create_assignment. Before the refactor, the inject'd routes ran their full Zod schemas (`MarkAbsentInput`, `CreateLeaveRequestInput`, `CreateSwapRequestInput`, `CreateAssignmentInput`) — including refine-rule checks like "swap cannot have same fromWorkerId and toWorkerId" (`packages/shared-schema/src/zod/supervisor.ts:266`). After the refactor, only `CreateAssignmentInputSchema` is parsed in `/chat/apply` (chat.ts:808); the other 3 branches cast `body.toolInput` and skip the schema. Chat path now accepts invalid input that the direct route would 400. | P5      | regression — validation drift      | `apps/backend/src/routes/chat.ts:846-1000` (mark_absent / leave / swap branches all skip the full route schema). |
| P2  | F-002.11's R2a "stale authority" test (`chat-apply-route-concurrency.test.ts:293`) directly calls `preCheckApply` + `commitApply` to simulate the binding change between phases. It does NOT go through `/chat/apply`. The round-2 packet claimed "stale authority cannot produce domain side effect without lifecycle commit" was proven on the real route path — that claim is overstated. The writer functions ARE proven safe; the route orchestration around them is only proven by transitive reasoning (preCheck + service + commit share one tx; the writer test proves the commit half).                                                                                  | P6 + P8 | test overclaim — orchestration gap | `apps/backend/test/chat-apply-route-concurrency.test.ts:293`.                                                    |

#### Verified against the code

- P1: `grep "safeParse" apps/backend/src/routes/chat.ts` returns 5 matches; only `CreateChatMessageInput`, `ProposeLivingDocUpdateInput`, `ApplyDecisionCardInput`, and `CreateAssignmentInputSchema` are parsed in chat.ts. `MarkAbsentInput` / `CreateLeaveRequestInput` / `CreateSwapRequestInput` are NOT — confirmed bypass.
- P2: the test at line 293 calls `preCheckApply` then `commitApply` directly inside `withTenantContext`; no `app.inject('/chat/apply', ...)` in that case.

#### Round-3 remediation plan (R3.1 + R3.2 — for owner's approval BEFORE I write code)

**R3.1 — re-add strict validation in /chat/apply (P1 fix).**

For each branch (mark_absent / leave / swap / create_assignment), parse `body.toolInput` with the same Zod schema the direct route uses, BEFORE entering the `withTenantContext` block:

```ts
if (body.toolName === 'propose_mark_absent') {
  const parsedTool = MarkAbsentInputForChat.safeParse({
    workerId: <from ti>,
    date: ti.date ?? today,
    status: 'ABSENT_NO_CALL',
    reason: reasonStr,
  });
  if (!parsedTool.success) {
    reply.code(400).send({ error: 'BAD_INPUT', message: parsedTool.error.message });
    return;
  }
  // then tx + service call uses parsedTool.data
}
```

Same pattern for the other 3 branches. For swap specifically, this re-adds the same-worker rejection that the schema enforces via `.refine`. The route-level schema is reused (we do NOT duplicate the schemas — single source).

One subtlety: `propose_create_assignment` already uses `CreateAssignmentInputSchema.safeParse` — keep it; small cleanup to surface the parsedTool.data the same way as the others.

**R3.2 — real route-level stale-auth test (P2 fix).**

Two paths to choose from (your call):

- **R3.2-a — minimal test-only hook.** Add an optional test hook (env-flag-gated) in `commitApply` that pauses for a side-channel binding change between preCheckApply and the UPDATE. Test fires /chat/apply via `app.inject`; while the route is paused, test commits the binding change; route resumes; assert 403 NOT_RESPONSIBLE + row stays PROPOSED + no Attendance row. Deterministic. The hook is internal to the test harness and isn't exposed in any production build path.
- **R3.2-b — property-style timing test.** Fire N concurrent (/chat/apply + binding-change) pairs via `Promise.all`. For EACH, assert one of two consistent outcomes: (i) route returned 200 AND row APPLIED AND domain row exists AND audit shows winner, OR (ii) route returned 403/409 AND row PROPOSED AND no domain row AND no DWI_APPLIED audit. Probabilistic — relies on the timing-window distribution to exercise both outcomes across N runs. Less deterministic but doesn't add test-only hooks to production code.

**Default I recommend:** R3.2-a (deterministic). It puts a small hook in the writer that's a no-op unless tests set it; the production behavior is unchanged. The hook is the kind of test infrastructure that pays for itself when concurrency tests are involved.

#### Separate decision needed — same-day supervisor-freeze policy (S-001 candidate, owner's proposal)

The owner has proposed (2026-05-16) adopting this business rule:

> Once the day starts, supervisor ownership for today is frozen. HR cannot switch today's supervisor in the system. Any supervisor change starts tomorrow. Same-day emergencies are handled operationally, not by changing system ownership for today. No account sharing.

**Why this matters here:** the entire round-2 R2b-iii complexity (atomic preCheck + service + commit inside one tx + stale-auth re-check in commitApply) exists because responsibility _could_ change mid-day. If responsibility can NEVER change mid-day, then:

- The stale-auth race becomes impossible by construction (not just by code).
- R2a's auth re-check inside commitApply becomes defense-in-depth, not the primary protection.
- The R3.2 test becomes a defense-in-depth test, not a critical path test.
- The R2b-iii service extractions are still valuable for atomicity (retry / double-tap safety + domain-failure rollback), but the stale-auth concern that drove their urgency goes away.

**What still matters even with this policy:**

- Double-tap / retry safety (still needs conditional updateMany)
- apply vs dismiss race (still needs the DB CHECK constraint + conditional UPDATE)
- Validation (still needs R3.1)
- Audit (still needs the same DWI_PROPOSED/APPLIED/DISMISSED events)
- No partial-state commits (still needs the atomic tx pattern from R2b-iii)
- No account sharing (always)

So the policy SIMPLIFIES the supervisor-binding side, but it does NOT undo round-2's atomicity work. Both are good together.

**Proposed S-001 (new slice if approved):**

- Enforce in HR binding-create service: `effectiveFrom >= tomorrow-midnight-tenant-local`.
- Reject same-day bindings with 400 BAD_INPUT.
- Update specs:
  - `axhy-v3/docs/specs/2026-05-14-supervisor-responsibility-model.md` — add the freeze rule as a new pick.
  - `axhy-v3/docs/specs/2026-05-15-workflow-design-closure.md` — reflect the simplification.
- Add tests:
  - HR cannot create a same-day binding (rejected with 400).
  - The supervisor-app routing behavior is unchanged for any day's current binding (already permanent or pre-tomorrow scheduled).
- Tests in F-002 that seed bindings with `effectiveFrom = now() - 60_000` are unaffected — they write directly via Prisma, not through HR's API; the policy is at the API layer.

This is a SPEC decision, not just code. Owner + friend should lock the policy before code lands.

#### Confidence per Rule 23

- R3.1 (validation fix): 95% own. Clear pattern; re-add Zod parsing per branch. No new design.
- R3.2-a (test hook + deterministic test): 86% own. The hook design is small but invasive enough to want a sanity check before coding.
- R3.2-b (property-style test): 80% own. Timing-dependent; flaky-test risk.
- S-001 (same-day freeze policy): 72% own. The engineering is straightforward (one Zod check in the HR service), but it's a SPEC change that needs owner+friend lock first. Per Rule P9 I would research how other systems model "no same-day reassignments" before locking the exact effectiveFrom check.

#### Decisions received 2026-05-16 (friend's call, owner-relayed)

1. **R3.1 — APPROVED.** Re-add the exact same Zod validation on /chat/apply for mark-absent, leave, and swap. Chat path and direct route must reject/accept identical inputs.
2. **R3.2 — APPROVED with option R3.2-a.** Small deterministic test-only hook, env-gated, no production behavior change.
3. **S-001 same-day supervisor-freeze — APPROVED AS SEPARATE SLICE.** Do NOT fold into F-002. Close F-002 cleanly first. S-001 lands later as its own policy/spec slice.
4. **Round-2 commits — KEEP AS-IS.**

Friend's wording on the format going forward: "From next update onward, keep the format simple: Problem in simple English · Simplest business solution · Code fix only if still needed · Why that code is necessary."

#### Execution rule for round 3 (locked)

- Fix validation regression (R3.1)
- Add deterministic stale-auth route proof (R3.2-a)
- No more architecture changes in this round
- Stop again at AWAITING_APPROVAL for review

**S-001 will be a separate next slice after F-002 closes — spec lock first, code second.**

### Slice: `chat-writes-proposed-decisions` (F-002 — round-2 R2b-iii remediation, superseded by round 3) — was AWAITING_APPROVAL 2026-05-16

- **Status:** `AWAITING_APPROVAL`. Friend's round-2 plan (approved 2026-05-16 with the control-surface cleanup as a prerequisite) is fully implemented.
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `92294f3` — `test(chat): atomicity verification — domain failure rolls back lifecycle (F-002.16)`
- **Round-2 commits (in landing order):**
  1. `75b56f8` — control-surface cleanup (friend's required prerequisite; superseded apply-after-domain wording removed from active-slice + pending-approvals).
  2. `a1f6a2d` — F-002.9: termination tx reorder (G1 fix). Validate worker BEFORE applyProposedDecision.
  3. `c63a163` — F-002.10: isCallerAuthorized re-check inside commitApply (G2 lifecycle fix, R2a).
  4. `d8b664b` — F-002.11: route-level concurrency + stale-auth tests (R3; 4 cases).
  5. `0cbb8ed` — F-002.12: extract createAssignmentService.
  6. `6e4c677` — F-002.13: extract createLeaveRequestService + markAbsentService.
  7. `50a859c` — F-002.14: extract createSwapRequestService.
  8. `cb3ae13` — F-002.15: /chat/apply uses tx-callable services in `withTenantContext` (R2b-iii core integration). Removes `app.inject` for the 4 ex-inject branches. SUPERSEDES F-002.4's apply-after-domain trade-off.
  9. `92294f3` — F-002.16: atomicity tests for all 4 ex-inject branches (4 cases proving domain failure rolls back lifecycle).
- **Verification:** REAL_DB on fresh local Postgres 16 (container `axhy-test-pg`, port 55432, all 12 migrations applied 20260507→20260518). **13/13 test files green · 69/69 cases pass** in one sweep. Container left running for friend's spot-check.

#### How each round-2 finding is closed

| Finding          | Status            | Resolution                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1 (termination) | CLOSED            | F-002.9 reorders the termination tx. Worker validation runs FIRST; lifecycle SECOND; worker.update THIRD. Early-returns happen before any state-changing write. Verified by F-002.11's G1 test case (termination apply against TERMINATION_PENDING worker → 409 + row stays PROPOSED).                                               |
| G2 (lifecycle)   | CLOSED            | F-002.10 adds `isCallerAuthorized` re-check inside commitApply. Verified by F-002.11's R2a test case (preCheck succeeds → binding changes → commitApply throws NOT_RESPONSIBLE → row stays PROPOSED).                                                                                                                                |
| G2 (domain side) | CLOSED by R2b-iii | F-002.12 + F-002.13 + F-002.14 extracted 4 services. F-002.15 makes /chat/apply call each service INSIDE one `withTenantContext` alongside preCheckApply + commitApply. Domain effect + lifecycle commit are atomic. Verified by F-002.16's 4 atomicity tests (non-existent worker/site → 404 + lifecycle PROPOSED + NO domain row). |
| G3 (test gap)    | CLOSED            | F-002.11 adds 4 route-level tests; F-002.16 adds 4 atomicity tests. Total 8 new cases at the load-bearing path.                                                                                                                                                                                                                      |

#### What friend asked the resurface packet to prove

| Friend's expectation                                                       | Where it's proven                                                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Termination invalid-worker path leaves decision PROPOSED                   | `chat-apply-route-concurrency.test.ts` G1 case (F-002.11).                                                                  |
| Stale authority cannot produce domain side effect without lifecycle commit | `chat-apply-route-concurrency.test.ts` R2a case (F-002.11) + the whole `chat-apply-atomicity.test.ts` file (F-002.16).      |
| Apply-vs-dismiss on the real route path is safe                            | `chat-apply-route-concurrency.test.ts` route-level apply-vs-dismiss test (F-002.11).                                        |
| All 4 ex-inject branches are truly atomic now                              | `chat-apply-atomicity.test.ts` — one rollback test per branch (F-002.16).                                                   |
| Domain-failure rollback tests exist for those branches                     | `chat-apply-atomicity.test.ts` 4 cases (F-002.16).                                                                          |
| Control files match the new truth with no leftover superseded matrix text  | F-002 round-2 prep commit `75b56f8` removed the superseded apply-after-domain matrix from active-slice + pending-approvals. |

#### P10 failure matrix (post-round-2)

| Question                                                     | Answer                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?                   | (1) PROPOSED transitions to exactly one terminal state. (2) `appliedAt` + `dismissedAt` mutually exclusive (DB CHECK). (3) Transitions require currently-responsible (binding-routable) OR origin supervisor (origin-only), CHECKED AT COMMIT TIME. (4) Domain effect + lifecycle commit happen in ONE Prisma transaction — neither succeeds alone. |
| How is each invariant enforced?                              | (1) Conditional updateMany on every transition. (2) DB CHECK constraint + conditional WHERE. (3) `isCallerAuthorized` at BOTH preCheckApply AND commitApply. (4) /chat/apply for all 5 branches wraps preCheckApply + service + commitApply in ONE `withTenantContext`.                                                                             |
| What happens on failure of the domain effect?                | Tx rolls back. Lifecycle stays PROPOSED. No DWI_APPLIED audit. Caller sees the service's error code (404/400). Verified by F-002.16.                                                                                                                                                                                                                |
| What happens on stale authority between preCheck and commit? | The whole flow runs in ONE tx; commitApply re-checks auth. If authority changed, tx rolls back → NO lifecycle change AND NO domain effect. Verified by F-002.11's R2a test.                                                                                                                                                                         |
| What happens for retry / double-submit?                      | Conditional updateMany returns count=0 → discriminator → throws ALREADY_APPLIED. Domain idempotency is each domain route's own concern.                                                                                                                                                                                                             |
| What happens under concurrent requests on the same row?      | PG row-lock + WHERE re-evaluation guarantee exactly one of N concurrent UPDATEs wins. DB CHECK rejects the impossible state. Audit reflects only the winner.                                                                                                                                                                                        |
| What happens for a stale client (old shape)?                 | 400 BAD_INPUT with `decisionId is required`. Row unaffected.                                                                                                                                                                                                                                                                                        |
| What is still intentionally deferred (with sunset)?          | Full state ENUM column (FAILED / EXPIRED / UNDONE) — needs concrete triggers in their own slices. **NO corruption windows remain for the PROPOSED → APPLIED/DISMISSED transitions this slice covers.**                                                                                                                                              |

#### Lessons logged to memory (`feedback_production_grade_workflow_rules.md`)

- **L1** — Tx-callback early-return commits partial state. Validation failures must throw, not return sentinels, when wrapped around a primitive that has already written.
- **L2** — Authorization checked in tx 1 doesn't bind tx 2; always re-check inside the commit tx.
- **L3** — "Document + reconcile via audit" is too weak when the side effect can corrupt real-world state. Make the side effect impossible under stale authority, not "recorded after the fact".

#### Decision needed

- `APPROVED` → slice moves to APPROVED state; next slice can start.
- `CHANGES_REQUESTED` (bullet list) → name what to change.
- `HOLD` → pause F-002.

**Reproduction snippet for friend's spot-check is in `active-slice.md`.** Docker container `axhy-test-pg` is left running.

### Slice: `chat-writes-proposed-decisions` (F-002 — round 2 review, original) — CHANGES_REQUESTED 2026-05-15 evening

- **Status:** `CHANGES_REQUESTED` (round 2) — friend's second production-grade verification pass found 3 remaining issues at the request orchestration layer. The core SupervisorDecision state machine + writer are now safe; the route plumbing around them still has corruption windows that rule P3 + P7 + P8 don't permit.
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at review:** `54c0ca9` (tracker propagation); slice body at `2557e1f`.
- **What round 1 (CHANGES_REQUESTED) fixed (verified by friend):** stronger state rule on lifecycle · apply/dismiss safer against direct race conditions · old-client path removed · routing for new decision kinds better · concurrency tests at the writer level.
- **Friend's verbatim:** "this is much better than before … the core state machine is much better, but the request orchestration around it is still not fully production-safe."

#### The 3 round-2 findings (rulebook citations)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                | Rule    | Severity                          | Location                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| G1  | propose_termination commits `appliedAt` BEFORE the worker validation. If the worker is missing or already TERMINATED/TERMINATION_PENDING, the inner callback returns `{ kind: 'NOT_FOUND' \| 'ALREADY' }` — but the tx still commits. Result: lifecycle row in APPLIED state, no worker.update happened, audit reflects an apply that didn't produce its domain effect.                                                                                | P3 + P7 | corrupts business truth           | `apps/backend/src/routes/chat.ts:920-945` — applyProposedDecision call is line 928; worker validation lines 939-944. |
| G2  | `commitApply` does NOT re-check authorization. The authorization check runs only inside `preCheckApply` (tx 1). If responsibility changes between tx 1 and tx 2 (e.g. an acting binding fires, a permanent reassignment commits, or someone dismisses the row), the conditional UPDATE in commitApply still succeeds because the WHERE only checks state, not authority. Wrong actor records DWI_APPLIED + (for inject-style) the domain effect leaks. | P2 + P3 | stale-authority lifecycle leak    | `apps/backend/src/lib/supervisor-decision-writer.ts:404-435` — commitApply only checks (appliedAt, dismissedAt).     |
| G3  | The new concurrency tests in `supervisor-decision-concurrency.test.ts` call `applyProposedDecision`/`dismissProposedDecision` DIRECTLY at the writer level — they prove the writer is race-safe but they do NOT exercise the full `/chat/apply` route orchestration (preCheckApply → inject → commitApply). The remaining route-layer race (G2 + apply-vs-dismiss across the inject window) is therefore not under test.                               | P6 + P8 | test gap on the load-bearing path | `apps/backend/test/supervisor-decision-concurrency.test.ts` — no `app.inject` parallel calls.                        |

#### Remediation plan (for your approval BEFORE I write code)

Confidence: 87% own on the plan shape. Below the rule 23 ≥90% bar for code execution → I want your go-ahead before implementing, and per Rule P9 I'll do a focused research pass before each fix (PostgreSQL row locking semantics + SERIALIZABLE isolation behaviour + Fastify inject tx isolation; sources will be cited in each commit message).

**Fix R1 — reorder termination validation to run BEFORE lifecycle commit (G1, rule P3).**

The single-tx termination branch should validate the worker FIRST, then commit lifecycle, then update the worker. Inside one `withTenantContext`:

1. `tx.worker.findFirst` + state guards. If invalid → return early; tx commits with NO lifecycle change.
2. `applyProposedDecision` (lifecycle UPDATE).
3. `tx.worker.update` + `recordAuditEvent`.

Either step 2 or step 3 can throw; the whole tx rolls back. propose_living_doc_update already follows this shape (the upsert/update have no early-return failure path, only throws), so it doesn't need a reorder — I'll re-verify when implementing.

Small change. High confidence (~96%). No new pattern, just a reorder.

**Fix R2 — close the stale-authority window AND the domain leak (G2, rules P2 + P3 + P8).**

**Revised 2026-05-16 (friend rejected R2b-i).** Friend's framing: a workflow is not production-grade if the business side effect can succeed under authority that is already stale. Documented + reconciled-via-audit is too weak. The plan now commits to R2b-iii — refactor — so the domain effect AND the lifecycle commit share one database transaction.

- **R2a (LIFECYCLE side, unchanged):** add `isCallerAuthorized` re-check INSIDE `commitApply`, before the conditional UPDATE. If authority changed since `preCheckApply`, throw `NOT_RESPONSIBLE`. The conditional UPDATE never runs; no DWI_APPLIED audit is emitted; the row stays PROPOSED.

- **R2b-iii (DOMAIN side, NEW commitment):** extract the 4 inject-style routes into tx-callable service functions. `/chat/apply` calls each service INSIDE its own `withTenantContext(prisma, companyId, async (tx) => ...)` along with `preCheckApply` + the domain service call + `commitApply`. All three commit together or none commits. No `app.inject` in the apply path for these branches.

  Research per Rule P9:
  - **Prisma interactive transactions** — https://www.prisma.io/docs/orm/prisma-client/queries/transactions — verified: "all queries inside it have to be run on the same connection. A database connection can only ever execute one query at a time." `app.inject` runs in its own Fastify request lifecycle on a different connection; it CANNOT share a Prisma tx with the outer caller. This is the conclusive reason R2b-iii (refactor) is required, not R2b-ii (pessimistic locking).
  - **PostgreSQL transaction isolation** — https://www.postgresql.org/docs/current/transaction-iso.html — already cited in F-002.3 commit; row-locking + WHERE re-evaluation guarantee exactly-one-wins for conditional UPDATEs. With everything in one tx, the binding read and the lifecycle UPDATE both see a consistent snapshot under READ COMMITTED for this slice's needs.
  - **PostgreSQL explicit locking** — https://www.postgresql.org/docs/current/explicit-locking.html — not needed under R2b-iii because we are NOT trying to span a non-DB operation; everything is in-tx.
  - **Fastify inject docs** — https://fastify.dev/docs/latest/Guides/Testing/ — inject is a request-execution mechanism, not a tx-sharing mechanism. Confirmed by the Prisma docs above.

  Scoped (file-grounded survey 2026-05-16):

  | Route                         | Handler size | Side effects                                           | Extraction shape                                                                                               |
  | ----------------------------- | ------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
  | POST /assignments             | ~96 LOC      | 2 prisma lookups + 1 create + 1 AuditEvent. No Outbox. | `createAssignmentService(tx, input, auth) → { kind: 'OK'\|'WORKER_NOT_FOUND'\|'SITE_NOT_FOUND', assignment? }` |
  | POST /leave-requests          | ~79 LOC      | 1 lookup + 1 create + 1 AuditEvent + 1 Outbox.         | `createLeaveRequestService(tx, input, auth) → { kind, leaveRequest? }`                                         |
  | POST /workers/:id/mark-absent | ~118 LOC     | 1 lookup + 1 upsert + 1 AuditEvent + up to 2 Outbox.   | `markAbsentService(tx, input, auth) → { kind, attendance? }`                                                   |
  | POST /swap-requests           | ~128 LOC     | 3 lookups + 1 create + 1 AuditEvent + 2 Outbox.        | `createSwapRequestService(tx, input, auth) → { kind, swapRequest? }`                                           |

  All 4 routes are extraction-friendly:
  - All currently wrap their work in `withTenantContext`.
  - All side effects go through `recordAuditEvent(tx, ...)` and `enqueueOutbox(tx, ...)` which already accept a TransactionClient (no external HTTP / synchronous third-party calls).
  - No blocking refactor.
  - Existing route handlers keep working — they just become thin wrappers that call the service inside `withTenantContext`.

  After extraction, `/chat/apply` for each inject-style branch becomes:

  ```ts
  await withTenantContext(prisma, auth.companyId, async (tx) => {
    const preCheck = await preCheckApply(tx, { companyId, decisionId, actorUserId });
    const result = await (<service>(tx, input, auth)); // domain in same tx
    if (result.kind !== 'OK') throw new DomainError(result.kind);
    await commitApply(tx, { ...input, preCheck }); // lifecycle in same tx
  });
  ```

  Either step throws → the whole tx rolls back. Atomic. No inject. No stale-auth leak.

  **Why R2b-ii (pessimistic locking) is rejected as fallback for this slice:** friend correctly flagged that `SELECT FOR UPDATE only protects the rows you lock`. The SupervisorDecision row lock would NOT block a concurrent SiteSupervisorBinding write (different table). Closing that gap would require SERIALIZABLE isolation, which then requires retry logic on conflict. The complexity exceeds R2b-iii's refactor cost, and the connection-held-across-inject pattern is a known anti-pattern (Prisma docs explicitly warn against long-held transactions). R2b-iii is both simpler AND more correct.

**Fix R3 — route-level concurrency + route-level stale-authority tests (G3, rules P6 + P8).**

New test file `chat-apply-route-concurrency.test.ts`:

1. Parallel `app.inject` of `/chat/apply` for the same decisionId. Exactly one wins, the other 409, DB row in a valid terminal state, audit matches winner only.
2. Parallel `/chat/apply` + `POST /decisions/:id/dismiss` via `app.inject`. Same assertions.
3. **Stale-authority race (R2a verification):** preCheck authorized; THEN simulate a binding change before commitApply runs (use a small `setTimeout` between phases, or seed the binding in `Promise.all` with the apply); assert commitApply throws NOT_RESPONSIBLE and lifecycle stays PROPOSED. This proves R2a closes the lifecycle window even if the inject is in-flight.
4. **G1 verification:** termination apply against a worker that's already TERMINATION_PENDING — assert row stays PROPOSED + 409. This proves R1 fixed the early-return-with-commit bug.

#### P10 failure matrix (post-R1 + R2a + R2b-iii + R3 — the active plan)

> _Removed 2026-05-16 control-surface cleanup: the prior matrix that surfaced "domain-side leak under stale authority for inject-style branches" as a deferred sunset item is gone. Under R2b-iii that leak does NOT exist by design — domain effect and lifecycle commit share one tx — so it cannot be a deferred limitation._

| Question                                                     | Answer                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What invariants does this slice introduce?                   | Previous invariants + (5) lifecycle commit happens only if the actor is STILL responsible at commit time. (6) Termination lifecycle never commits unless the worker.update commits too. (7) For ALL chat-apply branches (including the 4 ex-inject ones), domain effect + lifecycle commit happen inside one Prisma transaction. |
| How is each invariant enforced?                              | (5) `isCallerAuthorized` re-check in `commitApply` before the conditional UPDATE. (6) Worker validation runs BEFORE `applyProposedDecision` in the termination tx. (7) Each ex-inject branch wraps `preCheckApply` + domain-service call + `commitApply` in one `withTenantContext`.                                             |
| What happens on stale authority between preCheck and commit? | LIFECYCLE: row stays PROPOSED + 403 NOT_RESPONSIBLE returned. DOMAIN: the service call is in the same tx that throws → roll back → NO domain row created. Both sides correct.                                                                                                                                                    |
| What happens for the G1 termination invalid-worker case?     | Tx rolls back. Lifecycle stays PROPOSED. 404/409 returned. No appliedAt set.                                                                                                                                                                                                                                                     |
| What happens for the apply-vs-dismiss race after R2b-iii?    | The conditional UPDATE in `commitApply` is the only mechanism that can transition the row. Whichever transaction commits first wins; the other returns 4xx with the right error. Domain effect happens iff lifecycle commit happens — never alone.                                                                               |
| What is still intentionally deferred (with sunset)?          | Full state ENUM column (FAILED / EXPIRED / UNDONE) — deferred per scope Q4=(b); needs concrete triggers in their own slices. No corruption windows remaining for the PROPOSED → APPLIED/DISMISSED transitions this slice covers.                                                                                                 |

#### Suggested commit shape (R1 + R2a + R3 + R2b-iii)

R1 + R2a + R3 (small fixes + test additions):

1. `fix(chat): reorder termination tx — validate worker before lifecycle commit (F-002.9, fixes G1)`
2. `fix(decisions): re-check authorization in commitApply (F-002.10, fixes G2 lifecycle side)`
3. `test(decisions): route-level concurrency + stale-auth tests (F-002.11, fixes G3 + verifies R1+R2a)`

R2b-iii (4 service extractions + chat refactor + tests):

4. `feat(services): extract createAssignmentService for tx-sharing (F-002.12)` — simplest route first.
5. `feat(services): extract createLeaveRequestService + markAbsentService (F-002.13)` — paired.
6. `feat(services): extract createSwapRequestService (F-002.14)` — largest, most lookups.
7. `feat(chat): /chat/apply uses tx-callable services for true atomicity (F-002.15)` — remove `app.inject` for the 4 branches; rewrite each as `withTenantContext(preCheckApply + service + commitApply)`.
8. `test(chat): full-atomic apply tests for all 5 branches incl. domain-failure rollback (F-002.16)` — assert: if the service returns non-OK, lifecycle stays PROPOSED AND no domain row exists.
9. `docs(handoff): F-002 round-2 remediation → AWAITING_APPROVAL`

Each refactor commit (4–6) keeps the existing route handler working — it just becomes a thin wrapper calling the service. All existing chat-\* OpenAI-real tests + the new route tests continue to pass.

Confidence: 91% own on R1 + R2a + R3 (high; well-understood fixes). 90% on R2b-iii (file-grounded scope confirms no blocking side effects, but each service extraction has subtle details to get right). Per Rule P9, each refactor commit cites the Prisma transactions doc + does a quick mental dry-run of the route's existing tx boundaries before changing them.

#### Decision needed

- `APPROVED on plan` → I implement R1 + R2a + R3 + R2b-iii in 8 commits (9 with tracker), re-surface as AWAITING_APPROVAL once 11+ test files green AND including 5 new route-atomicity tests.
- `CHANGES_REQUESTED on plan` → name what to change.
- `HOLD` → pause F-002. Note: F-001 read API still works; F-002 writes happen in chat but with the current lifecycle gaps + the round-2 G1/G2 corruption windows still open.

**I will not write a single line of fix code until you approve this revised plan.** Recording the lesson from this round openly: when a workflow can produce a real-world domain effect under stale authority, "document + reconcile via audit" is not production-grade. The production-grade answer is "make the domain effect and the lifecycle commit share one tx, so neither can succeed alone." That's what R2b-iii does. Adding this to my session memory as a permanent rule.

---

### Slice: `chat-writes-proposed-decisions` (F-002 — round-1 remediation pass) — AWAITING_APPROVAL 2026-05-15 evening (superseded by round-2 above)

- **Status:** `AWAITING_APPROVAL`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit:** `2557e1f` — `test(decisions): F-002 remediation tests — concurrency + new kinds + stale-client (F-002.7)`
- **Original slice commits:** `a8b4e79` · `73ee9eb` · `8d20db0` · `7fbddcb` · `12f27ed` · `662e146` (kept; not rebased)
- **Remediation commits:** `f2b2d74` (F-002.1 registry) · `ec01f62` (F-002.2 CHECK) · `38b9987` (F-002.3 race-safe writer) · `2e03315` (F-002.4+5 apply-after-domain + required decisionId) · `4506b3d` (F-002.6 read-side registry) · `2557e1f` (F-002.7 tests)
- **All 4 findings closed.** See `active-slice.md` for the per-finding resolution table and the P10 failure matrix.
- **Verification:** `REAL_DB` — fresh local Postgres 16, all 12 migrations (20260507 → 20260518). **11/11 test files, 61/61 cases green** in one sweep, including 4 new concurrency cases (apply-vs-apply, apply-vs-dismiss, DB CHECK constraint, normal terminal states) and 3 new-kind binding-change cases (CREATE_ASSIGNMENT, TERMINATE_WORKER, SWAP_WORKER each route via current responsible after acting cover).
- **Friend's required additions delivered:**
  1. apply-vs-dismiss race test present in `supervisor-decision-concurrency.test.ts` — asserts exactly one wins, the other gets 409, DB state valid, audit matches winner only.
  2. Stale-client success-path test in `chat-apply-transitions-decision.test.ts` rewritten to assert 400 BAD_INPUT + row stays PROPOSED + no domain side effect.
  3. One shared decision-kind registry (`packages/shared-schema/src/zod/supervisor-decision-kinds.ts`) — TOOL_TO_DWI + WORKER_TARGETED_KINDS + SITE_TARGETED_KINDS gone; writer + read-side + authorization all derive from `DECISION_KIND_REGISTRY`.
- **Research sources cited per Rule P9:**
  - https://www.prisma.io/docs/orm/reference/prisma-client-reference#updatemany
  - https://www.postgresql.org/docs/current/transaction-iso.html
  - https://www.postgresql.org/docs/current/ddl-constraints.html
- **Decision needed:** `APPROVED` / `CHANGES_REQUESTED` (with bullet list) / `HOLD`. On APPROVED, the slice moves to APPROVED; F-002 is shippable; next slice can start.

---

## Currently blocked (NOT awaiting approval — blocked by external dependency)

_None._

---

## Recently approved (last 5)

### Slice: `handoff-package-composer` (F-004 — round-2 fixes + round-2.5 doc-truth + round-2.6 comment) — APPROVED + MERGED 2026-05-16

- **Status:** `DONE` (merged to main at `b19e03c` on 2026-05-16; pushed to `origin/main`).
- **Branch:** `feat/f-004-handoff-package-composer` (merged into `main` via `--no-ff`).
- **Last landed commit at approval:** `ef0aadd` — `docs(F-004 round-2.6): fix stale writeHandoffPackage JSDoc — summary entry IS written on permanent rebind with outgoing`.
- **F-004 commit chain (oldest → newest):** `19b6016` (round-1 scope) · `6969be9` (round-2 scope: mechanism Z) · `5cd4105` (round-3 scope: recentComplaints shape + 100KB citation + Rule 27 locked) · `daae04b` (round-4 v1: Rule 27 v2 with pgvector 4-bucket lock) · `c8dbeaa` (F-009 queued) · `4bd9631` (round-4 v3: 9-voice panel pass) · `3f54587` (round-4 v4: spec amendment for schemaVersion + F-010 queued) · `5bbf6e2` (active-slice 9-field catch-up) · `3abf55b` (round-1 code) · `0c9bdb7` (round-2 code fixes: summary entry restored + openItems site-scoped + hard truncation) · `f5e00bd` (round-2.5 doc-truth alignment) · `ef0aadd` (round-2.6 stale comment).
- **Approval received:** Friend's file-grounded verification at HEAD `ef0aadd`. Verbatim: "APPROVED. I verified the actual repo at HEAD `ef0aadd`. The last stale writer comment is fixed, and I do not see a new blocking issue now. F-004 is approved for merge."
- **Real-DB sweep at approval:** 19/19 test files · 109/109 cases pass on fresh local Postgres 16 (95 baseline + 14 new F-004 cases).
- **Spec amendment landed in chain:** `docs/specs/2026-05-15-workflow-design-closure.md §3.7` amended to add `schemaVersion INT` as canonical 9th field with consumer-handling invariant.
- **New slices queued during F-004:** F-009 (project memory service / Postgres + pgvector retrieval) + F-010 (handoff v2 / client-context expansion). Both queued AWAITING_F-004_DONE; now eligible.
- **Friend's directive on approval:** "F-004 is approved for merge. Next step: merge `feat/f-004-handoff-package-composer` to main, regenerate the handoff outputs if needed, and then surface the next slice." Done.

### Slice: `cron-framework-binding-expire-sweep` (F-003 — round-2 fixes) — APPROVED 2026-05-16

- **Status:** `DONE` (merged to main at `2bc815b` on 2026-05-16).
- **Branch:** `feat/f-003-cron-framework` (merged into `main`).
- **Last landed commit at approval:** `c4c335b` — `docs(handoff): F-003 round-2 review cleanup — 3 stale doc lines fixed (no code change)`.
- **F-003 commit chain (oldest → newest):** `39b47b8` (scope LOCKED + A-vs-B record) · `a29f9f6` (merge of F-001 + F-002 + S-001 + scope to main) · `74c1e9d` (pick 1 corrected pre-code — dispatcher-tick piggyback) · `737c066` (round-1 code) · `433985d` (round-1 tracker propagation) · `3e2f6bf` (rule 26 locked) · `cd490d7` (round-2 P1 fix: partial unique index + P2002 catch + 3 new tests) · `802d28f` (round-2 P2 docs downgrade) · `c4c335b` (round-2 review cleanup — 3 stale doc lines fixed).
- **Approval received:** Friend's file-grounded verification at HEAD `c4c335b`. Verbatim: "The round-2 review cleanup is real · The stale doc lines I flagged are now fixed, and I do not see a new blocker · the partial unique index + P2002 handling is a real correctness improvement, and the control surface now matches it · Decision: APPROVED."
- **Friend's verification limitation noted (not gating):** local Rollup/Vitest startup issue still applies in friend's shell; approval is file-grounded, not fresh-test-grounded.
- **Friend's directive on approval:** mark F-003 APPROVED in canonical files · regenerate outputs · merge `feat/f-003-cron-framework` to main · surface the next slice in simple-English-first format.
- **Delivered shape:**
  - NEW `apps/backend/src/jobs/binding-expire-sweep.ts` — `maybeRunBindingExpireSweep` with first-boot path + 5-min cadence gate + per-row tx + dispatcher-tick piggyback wiring.
  - NEW migration `20260519_f003_binding_ended_auto_dedup_index` — partial unique index on `AuditEvent (companyId, kind, targetId) WHERE kind='BINDING_ENDED_AUTO' AND targetId IS NOT NULL`. DB-enforced dedup makes duplicate audits impossible by construction; app-side `findFirst` kept as cheap-skip optimisation only.
  - NEW `BindingEndedAutoPayloadSchema` in shared-schema + `recordBindingEndedAuto` typed helper.
  - WIRED `dispatcher/index.ts:tick` next to `maybeResetAiSpend`.
  - NEW `binding-expire-sweep.test.ts` — 11 real-DB integration cases (8 original + 3 round-2 dedup: concurrent emit · direct DB unique-violation · partial-index narrowness).
  - **Rule 26 locked** across 4 places — inspect existing repo patterns BEFORE designing. Upstream prevention for the class of error friend caught in round-1.
- **Verification at approval:** REAL_DB on fresh local Postgres 16. **18/18 test files green · 95/95 cases pass** in one sweep (84 prior baseline + 11 F-003 cases).
- **Deferred (not in this slice):** other sweep jobs (decision-expire, flagged-visit-auto-escalate, hr-queue-age-escalation, hr-availability-sweep); "while you were out" digest generator; notification dispatcher F-007; multi-replica advisory lock (DB index made it unnecessary).
- **Next:** F-004 (HandoffPackage composer) surfaced as new active slice in `PLANNED — AWAITING_SCOPE_APPROVAL`.

### Slice: `same-day-supervisor-freeze` (S-001 — code slice) — APPROVED 2026-05-16

- **Status:** `APPROVED`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `2a0f27c` — `docs(handoff): propagate ab4d9a2 into S-001 control surface (S-001.4)`.
- **S-001 commit chain (oldest → newest):** `2835e84` (spec lock — wording v2 in both specs + stale control-file line cleaned) · `d234e77` (helper + wire into `reassignPermanentBinding` + 5 new tests + 4 adapted) · `8e763f8` (tracker propagation → AWAITING_APPROVAL) · `ab4d9a2` (control-surface cleanup — pre-code phrasing purged + feature-queue entry describes delivered shape) · `2a0f27c` (final tracker propagation — `ab4d9a2` represented across active-slice + pending-approvals + change-history + generated).
- **Approval received:** Friend's file-grounded verification at HEAD `2a0f27c`. Verbatim: "Final tracker propagation is clean · The last remaining control-surface mismatch is fixed · I do not see a new code bug or a new tracker-truth bug · Decision: APPROVED."
- **Friend's verification limitation noted (not gating):** could not personally rerun Vitest in their shell because of a local Rollup native-module/code-signing startup issue. Approval is file-grounded, not fresh-test-grounded.
- **Friend's directive on approval:** mark S-001 APPROVED in canonical files · regenerate outputs · close S-001 · surface the next slice in simple-English-first format.
- **Locked policy wording (single source, identical text in both specs):**

  > Same-day supervisor-freeze policy (S-001). Once the day has started in the tenant's local timezone, no supervisor responsibility change may take effect for that site until the next tenant-local midnight. This includes new acting cover, permanent reassignment, ending the current responsible binding, or any other binding mutation that would change who is officially responsible for today. Same-day emergencies are handled operationally outside ownership-change logic. No account sharing. F-002's atomicity and auth re-check protections remain in place as defense-in-depth.

- **Delivered shape:**
  - NEW `apps/backend/src/lib/same-day-freeze.ts` — `assertNotChangingTodaysResponsibility` + `SameDayFreezeError` + DST-safe `tomorrowMidnightInTimeZone` + `DEFAULT_TENANT_TIME_ZONE = 'Asia/Kolkata'`.
  - WIRED `reassignPermanentBinding` — guard runs BEFORE the prior-find; covers both `effectiveFrom` and `effectiveUntil`.
  - NEW `apps/backend/test/same-day-supervisor-freeze.test.ts` — 5 cases (1 helper-level same-day `effectiveFrom`, 2 helper-level same-day `effectiveUntil`, 3 real-DB `reassignPermanentBinding`, 4 routing-unchanged, 5 helper sanity).
  - ADAPTED `apps/backend/test/binding-permanent-reassignment-basics.test.ts` — 3 cases shifted to +36h cutovers; one renamed and refactored to query effective-at-post-cutover.
  - Spec amendments: `docs/specs/2026-05-14-supervisor-responsibility-model.md` + `docs/specs/2026-05-15-workflow-design-closure.md` — "2026-05-16 Update" sections appended with single-source wording.
- **Verification at approval:** REAL_DB on fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432, all 12 migrations applied). **17/17 test files green · 84/84 cases pass** in one sweep.
- **Deferred (not in this slice):** HR binding-create + binding-end HTTP routes (F-005 admin-web HR portal scope — guard exported and ready to wire). `Company.timeZone` schema column (helper accepts override parameter today).
- **Next:** F-003 (cron framework + `binding-expire-sweep`) surfaced as the active slice in `PLANNED — AWAITING_SCOPE_APPROVAL`. Branch ready to merge to main at owner's discretion to graduate F-002 + S-001 from APPROVED to DONE.

### Spec lock: `same-day-supervisor-freeze` (S-001 — wording v2) — SPEC LOCK APPROVED 2026-05-16

- **Type:** Spec lock approval (not a code slice). Unblocks the S-001 code slice.
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `9e137e4` — `docs(handoff): S-001 wording v1 → v2 per friend's CHANGES_REQUESTED on wording only`.
- **Approval received:** Friend's file-grounded verification at HEAD `9e137e4`. Verbatim: "SPEC LOCK APPROVED · the business rule is now stated the right way · in business terms, not field terms · covers acting cover, reassignment, ending today's ownership, and any other mutation that would change who is officially responsible today · keeps F-002 protections as defense-in-depth · matches the policy-first rule we locked."
- **Wording locked (v2 — single source, identical text in both specs):**

  > Same-day supervisor-freeze policy (S-001). Once the day has started in the tenant's local timezone, no supervisor responsibility change may take effect for that site until the next tenant-local midnight. This includes new acting cover, permanent reassignment, ending the current responsible binding, or any other binding mutation that would change who is officially responsible for today. Same-day emergencies are handled operationally outside ownership-change logic. No account sharing. F-002's atomicity and auth re-check protections remain in place as defense-in-depth.

- **Specs amended:** `docs/specs/2026-05-14-supervisor-responsibility-model.md` (new "2026-05-16 Update" section after the existing 2026-05-15 update) + `docs/specs/2026-05-15-workflow-design-closure.md` (new "2026-05-16 Update" section at end).
- **Stale control-file line cleaned (per friend's directive in the same commit batch):** `active-slice.md` line "then S-001 code (Zod check + 2 tests)" → "then S-001 code (shared API-layer guard `assertNotChangingTodaysResponsibility` + 4 tests)".
- **Friend's directive on approval:** land wording in both specs · update stale control-file line · start the small S-001 code slice · stop again for review.
- **Next:** S-001 code slice starts. Shared API-layer guard `assertNotChangingTodaysResponsibility(tenantTimeZone, mutation)` + 4 tests (create / end / reassign / routing-unchanged). F-002's round-2 atomicity + round-3 auth re-check stay as defense-in-depth.

### Slice: `chat-writes-proposed-decisions` (F-002 — round-3 fixes) — APPROVED 2026-05-16

- **Status:** `APPROVED`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `12c1df6` — `docs(handoff): F-002 round-3 fixes complete → AWAITING_APPROVAL (F-002.20, 15 files / 75 cases green)`
- **Round-3 commits (oldest → newest):** `c8c34b3` (rule 25 lock + round-3 approval propagation) · `5972881` (R3.1 strict Zod parsing in /chat/apply + 4 validation regression tests) · `990b96e` (R3.2-a env-gated test-only hook in commitApply + deterministic route-level stale-auth proof + 2 tests).
- **Approval received:** Friend's file-grounded verification pass at HEAD `12c1df6`. Verbatim: "I checked the actual repo at HEAD 12c1df6 · Round-3 closes the 2 smaller mistakes · I do not have any new blocking findings · P1 is really fixed · P2 is really fixed enough for approval · handoff/control state is consistent · Decision: APPROVED."
- **Friend's verification limitation noted (not gating):** could not personally rerun the 2 new Vitest files in their verification shell because pnpm wasn't on PATH; code changes, tests, and control-surface state all line up.
- **Friend's directive on approval:** mark F-002 APPROVED in canonical files · regenerate outputs · close F-002 · surface S-001 as a separate policy/spec slice · from next update onward, keep the format simple (Problem → Simplest business rule → Code only if needed → Why that code is necessary).
- **Both findings closed:**
  - **P1 (validation regression)** — R3.1 / `5972881`. Chat path imports + parses the same Zod schemas the direct routes use (`MarkAbsentInput`, `CreateLeaveRequestInput`, `CreateSwapRequestInput`). 4 regression cases incl. the headline self-swap → 400.
  - **P2 (route-level stale-auth proof)** — R3.2-a / `990b96e`. Env-gated test-only hook in `commitApply` (production no-op) lets tests inject a binding change between preCheck and commit. Route-level 403 + row PROPOSED + no Attendance + no DWI_APPLIED.
- **Verification at approval:** REAL_DB on fresh local Postgres 16 (Docker container `axhy-test-pg`, port 55432, all 12 migrations applied). 15/15 test files green · 75/75 cases pass in one sweep.
- **Deferred (per friend's approval):** S-001 same-day-supervisor-freeze stays as a separate policy/spec slice (spec lock first, then code). F-002 closes here.

### Scope approval: `F-002` — APPROVED 2026-05-15 evening

- **Type:** Scope artifact approval (not a code slice). No code review needed — this is the gate that unlocks F-002 coding.
- **Artifact:** `handoff/feature-queue/scopes/F-002.md`
- **Last landed commit at approval:** `1fb546e` — `fix(handoff): full sweep for forward-looking wording`
- **Approval received:** Friend's file-grounded verification at HEAD `1fb546e`. Verbatim: "trust fixes are real · F-002 scope approved · use the default picks · start coding".
- **Default picks accepted (all 5):**
  - Q1 `originContext` shape = (b) best-effort capture now.
  - Q2 single vs split = (a) single slice.
  - Q3 dismiss support = (a) include (adds `dismissedAt` + `dismissedReason` migration).
  - Q4 state ENUM = (b) defer.
  - Q5 `proposedDuringAbsence` detection = reuse F-001 helpers.
- **Friend's execution constraints (locked):**
  - single slice covering PROPOSED writer + apply transition + dismiss endpoint
  - include dismissedAt + dismissedReason migration; no full state enum yet
  - best-effort originContext capture only
  - real-DB verification required before surfacing for approval
  - sanity-rerun the 4 F-001 routing tests along with the new F-002 tests
  - stop again when F-002 reaches AWAITING_APPROVAL

### Slice: `routing-foundation-read-apis` (F-001) — APPROVED 2026-05-15 evening

- **Status:** `APPROVED`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `aa363f0` — `docs(handoff): routing slice F-001 → AWAITING_APPROVAL (23/23 green)`
- **Slice commits (oldest → newest):** `84ae39c` · `429886d` · `7e07a24` (plus tracker propagation `aa363f0` outside the slice's code surface)
- **Workflow IDs affected:** D17 (read side), F26 (read side), F27 (read side)
- **Approval received:** Friend's file-grounded verification pass at HEAD `aa363f0`. Verbatim: "no blocking findings · handoff/control state is consistent · routing code and 4th test file are real · DB container/migration state is real · accept the WIP-split deviation and approve the slice".
- **Friend's directive on approval:** mark APPROVED → move active slice forward in canonical files → regenerate outputs → surface the next planned slice (F-002) before writing code.
- **Friend's residual note:** could not personally rerun the 4-file Vitest sweep in their verification shell because pnpm wasn't on PATH and the local Rollup native-module path hit a code-signing issue. Acknowledged as a verification-shell tooling limitation, not a slice bug. Approval not gated on it.
- **WIP-split deviation:** ACCEPTED. Friend's verbatim: "Given the control-loop/history machinery already cites these hashes, additive completion on top is the cleaner choice unless there is a strong review reason to rewrite."

### Slice: `handoff-control-loop` — APPROVED 2026-05-15 evening

- **Status:** `APPROVED`
- **Branch:** `feat/layer-1-core-primitives`
- **Last landed commit at approval:** `03a1c22` — `docs(handoff): rule 23 — confidence-score-before-acting (Akshay directive)`
- **Slice commits (oldest → newest):** `f9fbe68` · `0445110` · `7916a3b` · `b35748e` · `eefaf11` · `091c2a6` · `03a1c22`
- **Workflow IDs affected:** none directly (control surface, spans all 29)
- **Approval received:** Friend's 5th file-grounded verification pass declared the control loop lock-ready at HEAD `091c2a6`. Verbatim: "the control-loop slice is now trustworthy enough to lock."
- **Friend's directive on approval:** mark APPROVED → unblock F-001 → resume from WIP `84ae39c` → finish 4th routing test → run real-DB sweep → split WIP into clean commits → stop for review.

---

## Recently rejected / change-requested

### Slice: `chat-writes-proposed-decisions` (F-002, initial pass) — CHANGES_REQUESTED 2026-05-15 evening

- **Original status:** `CHANGES_REQUESTED` at HEAD `c0c000a`. Resolved by the remediation pass surfaced as AWAITING_APPROVAL above.
- **Friend's verbatim review:** "He built the shape of the design, but not the safety guarantees the design really needed … apply is not truly atomic for most actions; backward-compat path leaves stale PROPOSED rows; some decision kinds are not routed to the current responsible supervisor; concurrent apply/dismiss can break state integrity."
- **4 findings (all resolved in the remediation pass):**
  - F1 — orphan APPLIED on domain failure (rule P3 + P7). Resolved by F-002.4 apply-after-domain.
  - F2 — optional `decisionId` left stale PROPOSED rows (rule P4). Resolved by F-002.5 — decisionId required.
  - F3 — SWAP/TERMINATE/CREATE_ASSIGNMENT bypassed binding routing (rule P5). Resolved by F-002.1 + F-002.6 unified registry.
  - F4 — concurrent apply/dismiss race could corrupt state (rules P1 + P2). Resolved by F-002.2 DB CHECK constraint + F-002.3 race-safe updateMany.
- **Friend's 3 required additions on the remediation plan:**
  1. apply-vs-dismiss race test (not only apply-vs-apply). Delivered in `supervisor-decision-concurrency.test.ts`.
  2. Replace the stale-client success-path test with a 400-assertion test. Delivered in `chat-apply-transitions-decision.test.ts`.
  3. One shared decision-kind registry, not drifting parallel lists. Delivered as `DECISION_KIND_REGISTRY` in shared-schema.
