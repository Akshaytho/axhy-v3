# Next Session — Quick Resume

> **Target read time: 2 minutes.** This file is the fastest way to resume work without losing context. Read this first, then `STATUS.md`, then dive into the specific files this points you to.
>
> **Resume command:** "Open `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/handoff/README.md` and follow the handoff files before doing anything else."

## Current state

- **Active phase:** **Migration-baseline recovery planning.** PR 1 (Layer 1 schema-only) is code-complete but **cannot be locally verified** because the repo's migration history is structurally incomplete — foundational baseline tables (Company, User, Membership, Site, Worker, Visit, LeaveRequest, OtpAttempt) are not captured in any migration. Surfaced 2026-05-15 during local Docker-Postgres verification: `20260508_phase_b_domain` fails with `relation "axhy.Company" does not exist` on a fresh DB. Investigation note + ranked recovery options at `docs/plans/2026-05-15-migration-baseline-recovery.md`. Recommendation: Option 1 (reconstruct baseline migration in a separate PR). PR 1 holds unchanged; PR 2 NOT started.
- **Current branch:** `feat/layer-1-core-primitives` (3 commits: 215c208 schema + be954a2 PolicyValue doc reconciliation + 853672c handoff state)
- **Last updated:** 2026-05-15 (baseline-migration gap surfaced; PR 1 holds pending recovery)

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

**PR 1 is blocked by a repo-level baseline-migration-history gap, NOT by Layer 1 schema correctness.** Decisions needed before any further Layer 1 progress:

1. **Read `docs/plans/2026-05-15-migration-baseline-recovery.md`** — investigation note + ranked recovery options.
2. **Founder picks a recovery path:**
   - **Option 1 (recommended):** reconstruct baseline migration in a separate PR ahead of PR 1's merge. Requires read-only access to Railway prod schema via `prisma migrate diff` or `pg_dump --schema-only`. PR 1 holds; rebases naturally once baseline lands.
   - **Option 2:** clone Railway prod DB → verify Layer 1 against the clone. Doesn't fix the underlying repo issue.
   - **Option 3 (last resort):** defer all local replay; apply Layer 1 directly during a supervised production window. Repo baseline gap stays open.
3. **Do not start PR 2** until baseline recovery is decided and (if Option 1) the baseline PR lands.
4. **Do not touch Railway prod** without explicit founder window approval (still applies).

PR 1 disposition: **HOLD unchanged.** Don't stack, don't rebase. Once a baseline migration timestamped before `20260508_*` lands, PR 1 naturally works on top.

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
