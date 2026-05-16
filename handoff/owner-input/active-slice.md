# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** when HR creates a binding (acting cover or permanent reassignment), the incoming supervisor walks in cold. They need to know the site rules, what just went wrong (recent complaints), who the workers are, what decisions are still open, what's on the calendar. Today the `handoffPackage` JSON column on `SiteSupervisorBinding` is nullable and nothing populates it. The composer doesn't exist.

**Simplest business rule:** at every binding creation (acting OR permanent OR reassignment), auto-compose a small JSON snapshot capturing the load-bearing context: site rules, recent complaints (last 90 days), active worker list, open `PROPOSED` decisions on the site, calendar entries for the next 7 days. Write it into the binding's `handoffPackage` column inside the same Prisma transaction that creates the binding row. Downstream surfaces (R6 "while you were out" digest, F-005 HR portal handoff card, F-007 notification payload) read from that column directly.

**Code (only after scope-artifact approval):** new `apps/backend/src/lib/handoff-package-composer.ts` exporting `composeHandoffPackage(tx, args)` — a tx-callable that returns the JSON. Wires into the existing binding-create flow + `reassignPermanentBinding`. No schema change — the column already exists. Real-DB integration tests verify composition correctness across acting / permanent / reassign paths.

**Why this code is necessary:** without the composer, the binding column is a permanently-empty promise. Every downstream feature that needs "what was happening on this site when responsibility changed?" would have to compose it themselves at read time — slower, harder to keep consistent, and would force the composer's content to be rebuilt in every consumer. Compose-once-at-write-time is the right shape; rule 26 (inspect existing patterns) says match the existing `recordAuditEvent` / `recordBindingCreated` tx-callable pattern that already lives in `site-supervisor-binding.ts`.

## Current

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**         | `handoff-package-composer` (F-004)                                                                                                                                                                                                                                                                                                                                                                             |
| **Status**             | `SCOPE_DRAFT_PENDING_REVIEW (round 2)` — round-1 was CHANGES_REQUESTED for 3 drifts; revised 2026-05-16 to align EXACTLY to closure spec §3.7 + lock owner's mechanism Z (acting cover = binding.handoffPackage only; permanent rebind = binding.handoffPackage + copy outgoing siteRules into incoming LivingDoc + 1 handover summary entry). 8 picks now locked; 4 small mechanical open questions surfaced. |
| **Branch**             | `feat/f-004-handoff-package-composer` — forked from main `62471c6` 2026-05-16 to host the scope artifact draft + the eventual code slice (no code yet)                                                                                                                                                                                                                                                         |
| **Last landed commit** | `62471c6` — `docs(handoff): F-004 branch-base wording → current main HEAD edf6172 (was stale at 2bc815b)` (last commit on main before this branch forked)                                                                                                                                                                                                                                                      |
| **Dependencies**       | F-001 + F-002 + S-001 + F-003 — all DONE on main (F-001/F-002/S-001 merged at `a29f9f6`; F-003 merged at `2bc815b`). All met.                                                                                                                                                                                                                                                                                  |
| **Tests status**       | n/a — code not started; scope phase                                                                                                                                                                                                                                                                                                                                                                            |
| **Verification gate**  | will be `REAL_DB` once code lands                                                                                                                                                                                                                                                                                                                                                                              |

## What the F-004 scope artifact needs to lock (rule-26 "existing-pattern survey" + open picks)

Per rule 26 (inspect existing repo patterns BEFORE designing), the scope artifact must answer these four questions with grep/read evidence BEFORE picks are locked:

1. **What similar code already exists?** Candidates to read: `recordBindingCreated` + `recordBindingEndedAuto` + `recordAuditEvent` in `apps/backend/src/lib/site-supervisor-binding.ts` (tx-callable pattern), `getEffectiveBinding` in `effective-responsibility.ts` (read pattern), the existing `originContext` JSON capture in chat.ts (similar compose-into-JSON-column shape).
2. **What real runtime pattern does it use?** Read each candidate; identify the actual signature shape, error shape, audit-emit conventions.
3. **Can I extend that pattern instead of introducing a new one?** Default: yes — `composeHandoffPackage(tx, args)` should match the tx-callable shape of `recordBindingCreated`.
4. **If I'm changing the pattern, why is the old one not enough?** No anticipated divergence.

Open picks to surface in the scope artifact (recommended defaults in brackets):

1. **What goes into the JSON?** Closure spec §3.7 + Decision 8 name 4–5 components: site rules / recent complaints (90 days) / active worker list / open decisions / 7-day calendar. Lock the exact field shape via a Zod schema [yes — `HandoffPackagePayloadSchema` in shared-schema/zod].
2. **Acting vs permanent vs reassign — same composer?** Single composer with arg variants, vs three composers? [single composer; the difference is just which binding row gets the JSON].
3. **Recent-complaints window** [90 days per Decision 8].
4. **Open-decisions filter** [PROPOSED on this site, regardless of `targetId` worker — the incoming supervisor needs site-scoped not worker-scoped].
5. **Calendar window** [+7 days from binding `effectiveFrom`].
6. **Failure handling** — if any sub-query fails, fail the whole binding-create tx (atomic compose-and-write) [yes — handoff context is part of the binding's truth; partial state is worse than no binding].
7. **Test coverage** — at minimum: acting create / permanent create / `reassignPermanentBinding` with all 4 components populated · empty-state defaults (no complaints / no calendar) · cross-tenant isolation (composer doesn't leak across companyId).

## What this slice does NOT do

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

## Decision needed (owner + friend, before any F-004 code)

- `SCOPE: GO with default picks` → I draft `handoff/feature-queue/scopes/F-004.md` with the rule-26 existing-pattern survey + the 7 picks above + open-questions; on owner sign-off, code begins on a fresh `feat/f-004-handoff-package-composer` branch.
- `SCOPE: change picks` → name what to change.
- `HOLD` → F-004 pauses; surface a different next slice instead (F-005 admin-web HR portal scaffold, F-006 worker mobile scaffold, or F-007 notification dispatcher).
- `MERGE FIRST` → I merge `feat/f-003-cron-framework` to main right now (graduate F-003 from APPROVED to DONE) before any F-004 work begins.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
