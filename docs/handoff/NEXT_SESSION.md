# Next Session — Quick Resume

> **Target read time: 2 minutes.** This file is the fastest way to resume work without losing context. Read this first, then `STATUS.md`, then dive into the specific files this points you to.
>
> **Resume command:** "Open `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/handoff/README.md` and follow the handoff files before doing anything else."

## Current state

- **Active phase:** **Layer 1 implementation — routing slice paused for execution-state tracker.** PR 1 + PR 2 + P1.5 accepted + locally real-DB verified. Routing slice (foundation read APIs for routing — `getEffectiveBinding`, `deriveWorkerPrimarySiteId`, `GET /sites/:id/effective-supervisor`, `GET /decisions/proposed-for-me`) is **paused at WIP commit `84ae39c`** — 4th test file unwritten + real-DB not yet run. Pause cause: friend-approved durable execution-state tracker (`docs/handoff/execution-state/`) built to prevent session-drift on workflow truth. **Affected workflow rows:** D17, F26, F27 — see `execution-state/supervisor-ravi.md`.
- **Current branch:** `feat/layer-1-core-primitives` (13 commits ahead of parent post-WIP, +tracker commit pending)
- **Last updated:** 2026-05-15 (execution-state tracker built; routing slice resumes after friend approves tracker)

## Approved vs Draft

**Approved + Active (binding today):**

- 7 active workflow specs at `docs/specs/2026-05-1{2,3,4,5}-*.md` — includes the workflow design closure spec (promoted 2026-05-15). See `docs/index/canonical-truth.md` for the binding list.

**Draft (treat as authoritative for its scope only):**

- `docs/plans/2026-05-15-implementation-kickoff-layer-1.md` — Draft kickoff memo. Now authoritative for Layer 1 sequencing because the closure spec is Active.

**Reviewable artifacts (not governing):**

- 5 audit drafts at `docs/audits/2026-05-1{4,5}-1yr-sim-*.md` — Round 1–5 locked complete; reviewable, not governing.

## Read these files now (in this order)

1. `axhy-v3/docs/handoff/README.md` — handoff rules + anti-drift rules + mandatory update order.
2. `axhy-v3/docs/handoff/STATUS.md` — full state + Authority Snapshot.
3. `axhy-v3/docs/handoff/execution-state/INDEX.md` — workflow-truth legend + strict enums + failure-mode rules. **Mandatory.**
4. The persona file(s) in `axhy-v3/docs/handoff/execution-state/` that the active slice touches (currently `supervisor-ravi.md` for D17/F26/F27), plus `combined.md`.
5. `axhy-v3/docs/handoff/ROADMAP.md` — what's next.
6. Whatever STATUS / ROADMAP point you to (closure spec / kickoff memo / specific audit).

**Reconciliation rule:** if `execution-state/` rows disagree with `STATUS.md` / `NEXT_SESSION.md` about any workflow's state, STOP and reconcile before coding (per `execution-state/INDEX.md` failure-mode rule 5).

## Do NOT do these things

- **Do not** start from older Active specs alone for cross-cutting questions — the closure spec is now Active and supersedes deferred items in the 6 prior specs (each spec carries a 2026-05-15 cross-ref section).
- **Do not** reopen the 5 finished audit rounds unless STATUS says a contradiction was found.
- **Do not** create a new long planning packet when a kickoff memo already exists for the current layer.
- **Do not** rely on memory alone — verify against the files listed in STATUS.
- **Do not** make further design promotions without running `PROMOTION_CHECKLIST.md` end-to-end.

## Next concrete action

**PR 1 + PR 2 are accepted and locally real-DB verified. Start the P1.5 SiteSupervisorBinding slice next, narrow scope.**

1. **Stay on `feat/layer-1-core-primitives`.** No new branch.
2. **P1.5 scope (narrow — do not exceed):**
   - SiteSupervisorBinding table + Prisma model + migration (single table for both ACTING and PERMANENT bindings per closure §4 / responsibility model).
   - Matching Zod / type exports in `@axhy/shared-schema`.
   - Only the `BINDING_*` audit-emit helpers actually needed by this slice (not the full §9 catalogue).
   - Real-DB lifecycle tests: binding creation, no-overlap invariant per site, acting window basics, permanent reassignment basics.
   - Verification status per slice: real-DB verified before claiming done.
3. **Do NOT** start any Layer 2 surface work (no worker app, no admin-web shells, no termination flow).
4. **Do NOT** apply the migration to Railway prod — same supervised-window gate as PR 1.
5. **Do NOT** mix in cleanup of the cosmetic drift items (ChatMessage.costInr annotation + LivingDoc constraint rename) — still deferred.
6. **Do NOT** reopen workflow design — closure spec is Active; the binding shape lives there + in the responsibility-model spec.
7. **Do NOT** add helpers for §9 kinds outside the BINDING\_\* set this slice actually needs.

---

**UPDATE 2026-05-15 (post execution-state tracker build):** P1.5 is complete and accepted (commits `9c0b3d8`, `a8eed8b`, `fe0f6f4`, `44a453d`). The next slice — **routing slice / foundation read APIs** — was started, then paused mid-way at WIP commit `84ae39c` so the execution-state tracker (`docs/handoff/execution-state/`) could be built first. On resume:

1. **Stay on `feat/layer-1-core-primitives`.** WIP commit `84ae39c` is the pause anchor.
2. **Mandatory pre-resume reading:** `execution-state/INDEX.md` (legend + failure-mode rules) → `execution-state/supervisor-ravi.md` rows D17 / F26 / F27 → `execution-state/combined.md` D17 section.
3. **Resume actions** (in order):
   - Write 4th test file `apps/backend/test/effective-responsibility-point-in-time.test.ts` (3 cases — acting+permanent overlap timeline, sequential reassignments, acting-then-permanent-reassigned mid-acting).
   - Run real-DB sweep against fresh local Postgres + all 10 migrations.
   - Split WIP commit `84ae39c` into 3 clean commits (helpers / routes / tests).
   - Update `execution-state/supervisor-ravi.md` D17/F26/F27 rows to reflect verification movement.
4. **Update cadence rule (INDEX.md):** before first code edit, at pause/block, after verify+commit. Three updates per slice, no more, no less.
5. **Reconciliation rule:** if STATUS/NEXT_SESSION and `execution-state/` disagree on any row, STOP and reconcile.

## Open founder picks (8)

F-P-1 pod-size · F-P-2 SLA durations · F-P-3 termination appeal window · F-P-4 reverse window · F-P-5 AI overage marketing · F-P-6 site-level HR Updates routing · F-P-7 worker preferred-language default · F-P-8 secondary owner emergency contact.

Full options + tradeoffs in closure spec §12. **None block Layer 1.**

## Branch to use

`feat/layer-1-core-primitives` — closure spec is Active; build is approved to start.

## Authority for current phase

- **Cross-cutting design authority:** `docs/specs/2026-05-15-workflow-design-closure.md` (**Active but contract-incomplete** — promoted 2026-05-15; binding for the 10 picks + 6 primitives + 4 persona surfaces).
- **Layer 1 sequencing authority:** `docs/plans/2026-05-15-implementation-kickoff-layer-1.md` (Draft kickoff memo; authoritative for Layer 1 sequencing).
- **Canonical binding docs today:** see `docs/index/canonical-truth.md` (closure-spec row added 2026-05-15).

When you've read this and STATUS, you have enough context to act.
