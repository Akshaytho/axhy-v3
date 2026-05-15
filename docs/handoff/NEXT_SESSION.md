# Next Session — Quick Resume

> **Target read time: 2 minutes.** This file is the fastest way to resume work without losing context. Read this first, then `STATUS.md`, then dive into the specific files this points you to.
>
> **Resume command:** "Open `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/handoff/README.md` and follow the handoff files before doing anything else."

## Current state

- **Active phase:** Layer 1 implementation kickoff — closure spec PROMOTED 2026-05-15; branch `feat/layer-1-core-primitives` ready to open; first PR is schema-only migrations.
- **Last updated:** 2026-05-15 (promotion complete)

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

**Closure spec is Active.** Layer 1 build is unblocked.

1. Open the branch: `git checkout -b feat/layer-1-core-primitives`.
2. First PR per kickoff memo §7: **schema-only migrations.** All 8 migrations (A–H) + Prisma model changes in `packages/shared-schema` + Zod schema updates + AuditEvent kind enum extension. No business logic in PR 1. Aim: green CI + Railway dev apply.
3. Update STATUS.md and NEXT_SESSION.md the same day the branch opens (per Mandatory Update Order §7 in README).

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
