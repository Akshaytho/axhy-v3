# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** when HR creates a binding (acting cover or permanent reassignment), the incoming supervisor walks in cold. They need to know the site rules, what just went wrong (recent complaints), who the workers are, what decisions are still open, what's on the calendar. Today the `handoffPackage` JSON column on `SiteSupervisorBinding` is nullable and nothing populates it. The composer doesn't exist.

**Simplest business rule:** at every binding creation (acting OR permanent OR reassignment), auto-compose a small JSON snapshot capturing the load-bearing context: site rules (from outgoing supervisor's `LivingDoc.siteRules`, NOT from Site metadata), recent complaints (last 90 days), active worker list, **one `openItems` list** of pending decisions + explicitly site-linked calendar entries for the **next 14 days**. Write it into the binding's `handoffPackage` column inside the same Prisma transaction that creates the binding row. **For permanent rebind ONLY** (mechanism Z, owner-locked): also copy outgoing's site-scoped siteRules into incoming's `LivingDoc.siteRules` + append 1 handover-summary entry to incoming's `LivingDoc.freeNotes`. Downstream surfaces (R6 "while you were out" digest, F-005 HR portal handoff card, F-007 notification payload, the future R6 §5.2.8 "Read the handoff →" panel) read from that column directly.

**Code (only after scope-artifact approval):** new `apps/backend/src/lib/handoff-package-composer.ts` exporting `composeHandoffPackage(tx, args)` — a tx-callable that returns the JSON. Wires into the existing binding-create flow + `reassignPermanentBinding`. No schema change — the column already exists. Real-DB integration tests verify composition correctness across acting / permanent / reassign paths.

**Why this code is necessary:** without the composer, the binding column is a permanently-empty promise. Every downstream feature that needs "what was happening on this site when responsibility changed?" would have to compose it themselves at read time — slower, harder to keep consistent, and would force the composer's content to be rebuilt in every consumer. Compose-once-at-write-time is the right shape; rule 26 (inspect existing patterns) says match the existing `recordAuditEvent` / `recordBindingCreated` tx-callable pattern that already lives in `site-supervisor-binding.ts`.

## Current

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**         | `handoff-package-composer` (F-004)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Status**             | `SCOPE_DRAFT_PENDING_REVIEW (round 3)` — round-1 was CHANGES_REQUESTED for 3 drifts (Site-metadata siteRules; openItems split into 3 buckets w/ 7-day window; dropped 4 spec-mandated fields). Round-2 was CHANGES_REQUESTED again for 2 more drifts caught by friend: (a) `recentComplaints` shape used `{id, text, severity, state, loggedAt}` instead of spec §3.7 line 307's `{id, kind, state, loggedAt, body}`; (b) `siteId` smuggled into top-level payload despite not being in spec §3.7's listed 8 fields; (c) 100KB truncation cited as spec-mandated without explicit line citation. Round-3 revision 2026-05-16 evening: payload shape aligned line-by-line to spec §3.7 (dropped `siteId`); `recentComplaints` shape EXACTLY `{id, kind, state, loggedAt, body}` (with `kind` field surfaced as honest open question Q5 — Complaint model has no `kind` column); 100KB truncation cited explicitly to spec §3.7 Invariants line 322; new "Pre-decided product behavior" §0 section added at top per locked **rule 27** (base+delta+live context model + 5-question pre-design checklist). 8 picks now locked; 5 small mechanical open questions surfaced. |
| **Branch**             | `feat/f-004-handoff-package-composer` — forked from main `62471c6` 2026-05-16 to host the scope artifact draft + the eventual code slice (no code yet)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Last landed commit** | `62471c6` — `docs(handoff): F-004 branch-base wording → current main HEAD edf6172 (was stale at 2bc815b)` (last commit on main before this branch forked)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Dependencies**       | F-001 + F-002 + S-001 + F-003 — all DONE on main (F-001/F-002/S-001 merged at `a29f9f6`; F-003 merged at `2bc815b`). All met.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Tests status**       | n/a — code not started; scope phase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Verification gate**  | will be `REAL_DB` once code lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## §0 Pre-decided product behavior (new rule-27 section at top of F-004.md)

Per locked **rule 27** (handoff/owner-input/INDEX.md rule 27), F-004's scope artifact now pins the already-decided product behavior at the top BEFORE any backend design. Answers the 5 mandatory questions: (1) what behavior is decided + citation, (2) what UI surface proves it, (3) LIVE vs SNAPSHOT bucketing of every data piece the slice touches, (4) audit of whether the design redesigned any human/product concept into backend shape (round 1 + round 2 + round 3 drifts called out explicitly), (5) cost model — composed ONCE per binding-create event, NOT per chat message; verified against base+delta+live context model.

**Owner-locked product behaviors that F-004 must conform to** (pinned, not re-debated):

- **Base + Delta + Live context model** — supervisor chat context = base loaded ONCE at first chat of the day + delta event-invalidated during the day + live fetch for far-horizon queries. handoffPackage is the SNAPSHOT delivered into incoming supervisor's base+delta; composed ONCE at binding-create, NOT re-queried per message.
- **HandoffPackage = focused snapshot of outgoing supervisor's JUDGEMENT** — not "everything we know about this site"; long-horizon planning stays LIVE via chat tools.
- **4 rule layers** — L1 company-permanent + L2 HR/pod stay LIVE-fetched (not in handoff). L3 site-specific supervisor rules TRANSFER on permanent rebind. L4 personal supervisor notes STAY with original supervisor. F-004 handles ONLY L3.
- **Mechanism Z** — acting cover = binding.handoffPackage JSON only; permanent rebind = JSON + L3 LivingDoc copy + handover-summary in freeNotes.
- **STRICT CalendarEntry site-linkage** — missing context safer than wrong context.

## 8 picks locked in the round-3 scope artifact

Full text + rule-26 existing-pattern survey citations + rule-27 pre-decided product behavior §0 live in [handoff/feature-queue/scopes/F-004.md](handoff/feature-queue/scopes/F-004.md). Summary:

1. **Payload shape** — spec §3.7 lines 303–310's listed **8 fields, no additions, no omissions**. Zod `HandoffPackagePayloadSchema`: `generatedAt`, `outgoingSupervisorId?` (NULL on first-ever binding), `incomingSupervisorId`, `siteRules: string[]`, `recentComplaints[]`, `activeWorkers[]`, `openItems[]`, `packageSizeBytes`. **No `siteId` on top-level** — binding row carries it; adding to payload is unauthorized denormalization. (Round-2 drift caught: round-2 listed `siteId` as a 9th field; round-3 drops it.)
2. **siteRules source** — outgoing's `LivingDoc.siteRules` filtered by `scope.siteId === thisSite AND state === ACTIVE AND visibility ∈ {COMPANY, SUPERVISOR_OWN}`. Project to `ruleText`.
3. **Recent-complaints window + shape** — 90 days, siteId-scoped (binding's siteId), includes open + resolved. Shape **EXACTLY per spec §3.7 line 307**: `{ id, kind, state, loggedAt, body }`. Mapping: `body = Complaint.text`, `loggedAt = Complaint.createdAt`, `state = resolvedAt === null ? 'open' : 'resolved'`. **`kind` is Open Q5 — schema gap** (Complaint model has no `kind` column). `severity` NOT included (not in spec's listed shape). (Round-2 drift caught: round-2 listed `{id, text, severity, state, loggedAt}`; round-3 fixes.)
4. **activeWorkers shape** — `{ workerId, name, primaryShifts, recentFlags (30d), recentDecisions (30d) }` per spec.
5. **openItems composition** — ONE typed list. Items: `{ kind: 'DECISION' | 'CALENDAR_ENTRY', ... }`. Window: **14 days** forward.
6. **CalendarEntry filter (STRICT)** — include only entries with explicit `payload.siteId === thisSiteId` AND `entry.supervisorId === outgoingSupervisorId`. Ambiguous → skip.
7. **Atomic compose-and-write** — all reads + binding row create + (on permanent) LivingDoc writes + audit emits in ONE tx.
8. **Mechanism Z (owner-locked) — two write paths by binding kind:**
   - **Acting cover:** write `binding.handoffPackage` only.
   - **Permanent rebind:** write `binding.handoffPackage` + copy outgoing's site-scoped `LivingDoc.siteRules` into incoming's `LivingDoc.siteRules` (preserving scope.siteId, source.pattern = "handover*from*<outgoingId>") + append 1 handover-summary entry to incoming's `LivingDoc.freeNotes`.

## 5 small open mechanical questions (recommended defaults given; not blockers)

Q1 — `LivingDocRule.createdBy` enum doesn't have "system_handover". Default: use `'supervisor'`; provenance preserved in `source.pattern`. Q2 — first-ever binding for a site → `outgoingSupervisorId: null`, empty siteRules, summary entry still written. Q3 — 100KB size-cap truncation strategy is **NOT invented by F-004 — it is spec §3.7 Invariants subsection, line 322, locked verbatim** ("Package size capped at a Policy-configurable byte limit (default 100KB); truncation strategy: drop oldest complaints first, then activeWorkers field detail"). Code-stage detail. Q4 — idempotency on replay via deterministic rule IDs (uuid-v5). Q5 — **`kind` field in ComplaintSummary is a genuine schema gap** (spec §3.7 line 307 lists `kind`; Complaint model has no `kind` column at schema.prisma:598-623). 3 options: (a) constant `kind: "site_complaint"` everywhere; (b) map from `severity` (rejected — misleading); (c) add `Complaint.kind` column in a separate slice and use `(a)` as interim. Default: **(a)** unless owner wants future complaint categorization.

## Audit emits on write

- 1× `HANDOFF_PACKAGE_GENERATED` (always — kind already in `audit-event.ts:84`).
- N× `LIVING_DOC_RULE_ADDED` (permanent rebind only; same forward-compat path `chat.ts:1273-1284` already uses).

## What this slice does NOT do (3 explicit non-claims caught by friend's audit)

- **Binding ownership-truth switching does NOT mean all consumer surfaces are wired.** `getEffectiveBinding` from F-001 gives the truth (Anjali is now responsible for Manikonda). Every consumer surface that wants to render that — Today site cards, Decisions tab, complaints feed, notifications, the future "Read the handoff →" panel (closure §5.2.8), the portfolio-delta banner (§5.2.7), "while you were out" digest (§5.2.6), F-005 HR portal handoff card, F-007 notification dispatcher — **still has to be implemented to use that truth correctly.** F-004 only produces the snapshot + does the permanent-rebind LivingDoc transfer; rendering surfaces are later slices.
- **F-004's `binding.handoffPackage` write is NOT the same thing as "incoming LivingDoc updated".** Mechanism Z's explicit LivingDoc-merge step on permanent rebind is what bridges the two. Acting cover deliberately does NOT merge into incoming's LivingDoc (cover is temporary; merging would muddle their personal context for sites they normally manage).
- **Long-horizon planning (next month / 6 months) is a LIVE chat-tool query concern, NOT a handoffPackage concern.** handoffPackage's `openItems` stays bounded at 14 days by design (the cover-letter horizon). Supervisor asks "any plans next month?" → chat tool queries Assignment / CalendarEntry tables live. handoffPackage is not the place to store long-horizon data.
- **Layer-1 (company-permanent rules) and Layer-2 (HR/pod rules) stay LIVE-fetched.** Both stay OUT of F-004. Company rules live in `HRUpdate` + `HRUpdateRule` entities; HR/pod rules are a future entity. F-004 only handles **layer 3** (site-specific supervisor rules from outgoing's LivingDoc).
- Does not introduce the "while you were out" digest UI or notification fan-out — those are downstream consumers (later slices).
- Does not introduce the HR portal handoff card surface — that's F-005 (admin-web HR portal).
- Does not touch supervisor-mobile rendering of the package — that's later.
- Does not modify F-003's cron framework.
- Does not write code until the F-004 scope artifact is approved by owner + friend.

## F-002 + S-001 + F-003 closure summary (for cross-slice context)

| Slice                                       | Status                                | Approval at    | Friend's verbatim                                                                                                                        |
| ------------------------------------------- | ------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F-002 (chat-writes-proposed-decisions)      | DONE (merged 2026-05-16)              | HEAD `12c1df6` | "P1 is really fixed · P2 is really fixed enough for approval · APPROVED."                                                                |
| S-001 (same-day-supervisor-freeze)          | DONE (merged 2026-05-16)              | HEAD `2a0f27c` | "Final tracker propagation is clean · I do not see a new code bug or a new tracker-truth bug · Decision: APPROVED."                      |
| F-003 (cron-framework-binding-expire-sweep) | DONE (merged 2026-05-16 at `2bc815b`) | HEAD `c4c335b` | "The round-2 review cleanup is real · The stale doc lines I flagged are now fixed, and I do not see a new blocker · Decision: APPROVED." |

F-003 final commit chain: `39b47b8` (scope LOCKED) · `a29f9f6` (F-002 + S-001 merge to main) · `74c1e9d` (pick 1 corrected pre-code) · `737c066` (round-1 code) · `433985d` (round-1 tracker) · `3e2f6bf` (rule 26 locked) · `cd490d7` (round-2 P1 fix: partial unique index + P2002 + 3 tests) · `802d28f` (round-2 P2 docs downgrade) · `c4c335b` (round-2 review cleanup — 3 stale doc lines). Full real-DB sweep: 18/18 files · 95/95 cases.

Friend's standing verification-shell limitation noted across all approvals: pnpm / Vitest startup hits a local Rollup native-module/code-signing issue, so friend's approvals are file-grounded, not fresh-test-grounded. The Docker container `axhy-test-pg` remains running for any future replay.

## Reproduction (F-002 + S-001 + F-003 baseline; applies until F-004 code lands new tests)

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

Expected: 18 files, 95 cases, all green.

## Decision needed (owner + friend, on the round-3 revision)

- `SCOPE: APPROVED (round 3)` (8 picks + 5 open Q recommended defaults + rule-27 pre-decided product behavior §0 + rule-26 existing-pattern survey) → I begin code on `feat/f-004-handoff-package-composer` immediately. Stop at `AWAITING_APPROVAL` after the new test sweep is green.
- `SCOPE: CHANGES_REQUESTED` → name the pick / Open Q / Pre-decided-product-behavior question to change. I revise + re-surface.
- `HOLD` → F-004 pauses; surface a different next slice (F-005 admin-web HR portal scaffold, F-006 worker mobile scaffold, or F-007 notification dispatcher).

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
