# Next Session — Quick Resume

> **Target read time: 2 minutes.** This file is the fastest way to resume work without losing context. Read this first, then `STATUS.md`, then dive into the specific files this points you to.
>
> **Resume command:** "Open `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/handoff/README.md` and follow the handoff files before doing anything else."

## Current state

- **Active phase:** **Layer 1 implementation — PR 1 code-complete + locally real-DB verified.** Migration baseline recovery merged into parent `feat/phase-c-wave-4b-chat-completion` at `1dbf951`. `feat/layer-1-core-primitives` rebased onto the updated parent; full chain of 9 migrations applies cleanly to a fresh Postgres; all 9 expected Layer 1 schema objects (4 tables, 4 columns, 1 view) verified present. Migration **NOT** yet applied to Railway prod — prod apply is a later supervised step. Next slice: **PR 2 — audit-emit helpers + real-DB integration tests**.
- **Current branch:** `feat/layer-1-core-primitives` (4 commits ahead of parent post-rebase)
- **Last updated:** 2026-05-15 (baseline merged into parent; PR 1 locally real-DB verified; PR 2 next)

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

**PR 1 is approved and locally real-DB verified. Start PR 2 next, narrow scope.**

1. **Stay on `feat/layer-1-core-primitives`.** No new branch.
2. **PR 2 scope (narrow — do not exceed):**
   - Audit-emit helpers for the new AuditEvent kinds introduced by Layer 1 (per closure spec §3.6 + the kind catalogue extension committed in 095c766).
   - Real-DB integration tests around the new schema objects where applicable (HRPod creation + Membership.podId binding, Policy round-trip, Notification + Digest insert/query, SupervisorDecision.originContext + proposedDuringAbsence flow, QueueItem view query).
   - Verification status per slice: real-DB verified before claiming done.
3. **Do NOT** introduce new schema changes unless a real blocker appears.
4. **Do NOT** start Layer 2 surface work.
5. **Do NOT** apply the migration to Railway prod — that's a later supervised step gated on `prisma migrate resolve --applied 20260507_phase_a_baseline_day3` + a supervised window.
6. **Do NOT** mix in cleanup of the two cosmetic drift items (ChatMessage.costInr precision annotation + LivingDoc constraint rename) — they're deferred to a separate small migration after PR 2.

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
