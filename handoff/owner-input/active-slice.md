# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English (between slices — owner picks next)

**Problem:** F-004 (HandoffPackage composer + writer + permanent-rebind LivingDoc merge) is DONE and merged to main. No active slice right now. Several queued slices are eligible to start. Owner needs to pick which is next.

**Simplest business rule:** pick the slice that unblocks the most downstream work for the least new build. F-007 (notification dispatcher) is the natural successor — it consumes F-004's `HANDOFF_PACKAGE_GENERATED` audit + `BINDING_ENDED_AUTO` from F-003 + the existing outbox to wire worker-side supervisor-change notifications (W-1 / W-2 / W-7 from the Suresh audit) + the "while you were out" digest. But owner may prefer a UI-side slice (F-005 admin-web HR portal, F-006 worker mobile scaffold) to make the foundation visible to the personas.

**Code:** none until owner picks a slice and the scope artifact is approved per the standard discipline (rule 27 §0 pre-decided product behavior → rule 26 existing-pattern survey → 8-pick lock → friend file-grounded scope review → code).

**Why this matters:** F-001 + F-002 + S-001 + F-003 + F-004 are the layer-1 + p1.5 backend primitives. Every downstream consumer (R6 supervisor mobile rendering, admin-web HR portal, worker mobile, notification dispatcher, monthly digest, F-010 handoff v2, F-009 project memory) now has a stable substrate to read from. The next slice picks the consumer surface to build out first.

## Current

| Field                    | Value                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**           | `n/a` — between slices, awaiting owner pick                                                                                                                                                                   |
| **Status**               | `BETWEEN_SLICES — AWAITING_OWNER_PICK` 2026-05-16. F-004 DONE; merged to main at `b19e03c` (pushed to origin). Friend's final approval at HEAD `ef0aadd` 2026-05-16: "APPROVED. F-004 is approved for merge." |
| **Branch**               | `main` (clean, up-to-date with `origin/main`)                                                                                                                                                                 |
| **Last landed commit**   | `b19e03c` — `Merge F-004 — HandoffPackage composer + writer + reassignPermanentBinding wiring (round 2 APPROVED)` on main                                                                                     |
| **Dependencies cleared** | F-001 + F-002 + S-001 + F-003 + F-004 — all DONE on main. Spec §3.7 amended for `schemaVersion`. F-009 + F-010 unblocked. F-007 unblocked (its main upstream was F-004's audit emit, now live).               |
| **Tests status**         | 19 test files / 109 cases on main; baseline for any next slice                                                                                                                                                |
| **Verification gate**    | n/a until a slice is picked                                                                                                                                                                                   |

## Next-slice candidates (from `handoff/feature-queue/INDEX.md`)

| #     | Slice                                        | Persona / surface      | Dependencies             | Why it's a good next pick                                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------- | ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-007 | Notification dispatcher                      | All personas (backend) | F-004 (DONE) + outbox    | **Backend-only, natural F-004 successor.** Consumes `HANDOFF_PACKAGE_GENERATED` + `BINDING_ENDED_AUTO` + DWI events. Implements W-1/W-2/W-7 (worker-side supervisor-change notifications) + "while you were out" digest. No UI build. Unblocks every notification surface downstream. |
| F-005 | Admin-web HR portal scaffold                 | Kavitha (admin-web)    | F-001/F-002/F-003 (DONE) | **First admin-web surface.** Big UI build (`apps/admin-web/app/hr/` doesn't exist yet). 9 HR workflows are BACKEND_READY but invisible. Highest visibility-to-Kavitha but largest scope.                                                                                              |
| F-006 | Worker mobile app scaffold                   | Suresh (worker-mobile) | F-001/F-002              | First worker-mobile surface. Whole app folder doesn't exist yet. Largest cold-start of the three UI slices.                                                                                                                                                                           |
| F-008 | Bootstrap-seed migration + HR review UI      | Kavitha                | F-005                    | Onboarding new tenants. Blocked on F-005 (needs the HR portal to render the review surface).                                                                                                                                                                                          |
| F-009 | Project memory service (Postgres + pgvector) | Operator-side infra    | F-004 (DONE)             | Now eligible. Owner explicit: not a blocker for ongoing slices; enables Claude-side retrieval. Owner-locked deferral until later in the queue.                                                                                                                                        |
| F-010 | Handoff v2 / client-context expansion        | Anjali (incoming sv)   | F-004 (DONE)             | Now eligible. Adds `LivingDoc.clientPreferences` transfer alongside siteRules. Owner-locked β: queued post-F-004.                                                                                                                                                                     |

**Suggested order** (owner picks; not locked):

1. **F-007** first — backend-only, consumes the F-004 / F-003 emits directly; unblocks every downstream consumer surface (digest, push, SMS). Worker-side push is also the highest-pain audit finding (Suresh W-1/W-2/W-7 — supervisors changing without worker awareness).
2. Then **F-005** to give Kavitha a usable HR portal (currently every HR workflow is backend-only).
3. Then **F-006** worker mobile scaffold for Suresh.
4. F-008 / F-009 / F-010 once the above are stable.

## Decision needed (owner)

- `START F-007` (notification dispatcher) → I write the scope artifact for F-007 following rule 27 §0 + rule 26 survey + 8-pick lock; fresh `feat/f-007-notification-dispatcher` branch from current main; stop for owner + friend scope review.
- `START F-005` (admin-web HR portal scaffold) → same pattern; fresh `feat/f-005-admin-hr-portal` branch.
- `START F-006` / `START F-008` / `START F-009` / `START F-010` → same pattern, different branch.
- `HOLD` → no slice starts; queue stays as-is.

After owner picks, the rest follows the standard discipline: scope → friend file-grounded review → SCOPE APPROVED → code → AWAITING_APPROVAL → friend review → APPROVED → MERGE.

## F-004 closure summary (for cross-slice context)

| Slice                                         | Status                                 | Friend's verbatim                                                                                                              |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| F-001 (binding-effective-routing)             | DONE                                   | —                                                                                                                              |
| F-002 (chat-writes-proposed-decisions)        | DONE (merged `a29f9f6`)                | "P1 is really fixed · P2 is really fixed enough for approval · APPROVED."                                                      |
| S-001 (same-day-supervisor-freeze)            | DONE (merged `a29f9f6`)                | "I do not see a new code bug or a new tracker-truth bug · Decision: APPROVED."                                                 |
| F-003 (cron-framework + binding-expire-sweep) | DONE (merged `2bc815b`)                | "The round-2 review cleanup is real · Decision: APPROVED."                                                                     |
| **F-004 (HandoffPackage composer)**           | **DONE (merged `b19e03c` 2026-05-16)** | "APPROVED. I verified the actual repo at HEAD `ef0aadd`. The last stale writer comment is fixed. F-004 is approved for merge." |

F-004 commit chain on the feat branch: `19b6016` (round-1 scope) → `6969be9` (round-2 scope) → `5cd4105` (round-3 scope) → `daae04b` (round-4 v1 + rule 27 v1) → `c8dbeaa` (F-009 queued) → `4bd9631` (round-4 v3 panel pass) → `3f54587` (round-4 v4 spec amendment + F-010 queued) → `5bbf6e2` (active-slice catch-up to 9 fields) → `3abf55b` (round-1 code) → `0c9bdb7` (round-2 code fixes: summary entry + site-scoped openItems + hard truncation) → `f5e00bd` (round-2.5 doc-truth alignment) → `ef0aadd` (round-2.6 stale comment fix) → **merge `b19e03c` to main**. 14 commits on the feature branch; full real-DB sweep 19/19 · 109/109 green at merge.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly. No "landing now", no "may land", no "next commit will be", no "in this commit" wording.
