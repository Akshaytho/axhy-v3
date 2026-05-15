# Next Session — Quick Resume

> **Target read time: 2 minutes.** This file is the fastest way to resume work without losing context. Read this first, then `STATUS.md`, then dive into the specific files this points you to.
>
> **Resume command:** "Open `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/handoff/README.md` and follow the handoff files before doing anything else."

## Current state

- **Active phase:** **Layer 1 implementation — PR 1 + PR 2 accepted + locally real-DB verified.** PR 2 added 3 typed audit-emit helpers + 8 real-DB integration test files (29/29 green against fresh Postgres 16). No schema churn beyond what was already in PR 1. Migration still **NOT** applied to Railway prod (later supervised step). Next slice: **P1.5 SiteSupervisorBinding** — single table for both ACTING + PERMANENT bindings, only the BINDING\_\* audit helpers needed by this slice, real-DB lifecycle tests.
- **Current branch:** `feat/layer-1-core-primitives` (7 commits ahead of parent)
- **Last updated:** 2026-05-15 (PR 2 accepted + locally real-DB verified; P1.5 next)

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
3. `axhy-v3/docs/handoff/ROADMAP.md` — what's next.
4. Whatever STATUS / ROADMAP point you to (closure spec / kickoff memo / specific audit).

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
