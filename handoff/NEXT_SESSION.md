# Next Session — Quick Resume

> **Target read time: 2 minutes.** This file is the fastest way to resume work without losing context. Read this first, then `STATUS.md`, then dive into the specific files this points you to.
>
> **Resume command:** "Open `/Users/thotaakshay/eclean_workspace/axhy-v3/handoff/README.md` and follow the handoff files before doing anything else."

## Current state

- **Active phase:** **handoff control-loop slice — built on top of the 3-layer tracker.** Adds layer 4: `handoff/owner-input/` (notes, approvals, active-slice, decisions log, change history) + `handoff/feature-queue/INDEX.md` + generator extension that renders all of it in the dashboard. Pre-commit auto-regen wired. Routing slice (foundation read APIs) remains paused at WIP `84ae39c` — resumes after this control-loop slice is APPROVED. **Affected workflow rows:** none directly — control surface around all 29 workflows.
- **Current branch:** `feat/layer-1-core-primitives`
- **Last updated:** 2026-05-15 evening (control-loop slice landing)
- **Current slice + status:** see [`handoff/owner-input/active-slice.md`](./owner-input/active-slice.md) — single source of truth.

## Approved vs Draft

**Approved + Active (binding today):**

- 7 active workflow specs at `docs/specs/2026-05-1{2,3,4,5}-*.md` — includes the workflow design closure spec (promoted 2026-05-15). See `docs/index/canonical-truth.md` for the binding list.

**Draft (treat as authoritative for its scope only):**

- `docs/plans/2026-05-15-implementation-kickoff-layer-1.md` — Draft kickoff memo. Now authoritative for Layer 1 sequencing because the closure spec is Active.

**Reviewable artifacts (not governing):**

- 5 audit drafts at `docs/audits/2026-05-1{4,5}-1yr-sim-*.md` — Round 1–5 locked complete; reviewable, not governing.

## Read these files now (in this order — mandatory)

1. `axhy-v3/handoff/README.md` — handoff rules + anti-drift rules.
2. `axhy-v3/handoff/STATUS.md` — phase-level state.
3. `axhy-v3/handoff/execution-state/INDEX.md` — workflow-truth legend + 22 rules.
4. `axhy-v3/handoff/workflow-maps/INDEX.md` — diagram conventions.
5. **`axhy-v3/handoff/owner-input/INDEX.md`** — control loop rules.
6. **`axhy-v3/handoff/owner-input/pending-notes.md`** — scan for NEW notes; if any, acknowledge before any code.
7. **`axhy-v3/handoff/owner-input/pending-approvals.md`** — confirm no AWAITING_APPROVAL slice blocks the intended next slice.
8. **`axhy-v3/handoff/owner-input/active-slice.md`** — what is in flight.
9. **`axhy-v3/handoff/feature-queue/INDEX.md`** — what's queued next.
10. The persona file(s) in `execution-state/` and `workflow-maps/` for the active workflows.
11. `combined.md` + `combined-system.md` if cross-persona.
12. `ROADMAP.md` — phase forward-look.
13. (Optional) Open `handoff/generated/app-workflow-dashboard.html` for the single-page view. If JSON disagrees with markdown, markdown wins → regenerate.

**Reconciliation rules:**

- `execution-state/` ⟷ `STATUS.md` / `NEXT_SESSION.md` disagree → STOP, reconcile (rule 5).
- `generated/` ⟷ canonical markdown disagree → STOP, regenerate (rule 12).
- NEW owner note affecting intended slice → STOP, acknowledge (rule 16).
- AWAITING_APPROVAL slice exists → STOP, no new slice starts until approved (rule 17).

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

**UPDATE 2026-05-15 (post execution-state tracker build):** P1.5 is complete and accepted (commits `9c0b3d8`, `a8eed8b`, `fe0f6f4`, `44a453d`). The next slice — **routing slice / foundation read APIs** — was started, then paused mid-way at WIP commit `84ae39c` so the execution-state tracker (`handoff/execution-state/`) could be built first. On resume:

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
