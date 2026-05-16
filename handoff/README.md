# Axhy v3 — Handoff Folder

> **If you're a new Claude session or a new engineer joining this project, read this file first, then `NEXT_SESSION.md`, then `STATUS.md`, then `ROADMAP.md`.**
>
> **Resume command** (paste this to a new session): _"Open `/Users/thotaakshay/eclean_workspace/axhy-v3/handoff/README.md` and follow the handoff files before doing anything else."_

## What this folder is

The project's **session entry contract** — mandatory front door for any future work in v3. Not just a convenience; the workflow depends on it.

This folder is the **navigation + state** layer. The actual content (specs, plans, audits, code) lives in its proper locations elsewhere — this folder points to those locations and tracks how they evolve over time.

## Files in this folder

| File                       | Purpose                                                                                                                                             | Update cadence                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `README.md` (this file)    | Entry point. Structure, rules, anti-drift, update order, failure modes.                                                                             | Rare — only when the structure or rules change.                |
| `NEXT_SESSION.md`          | 2-minute resume file for AI sessions. Approved-vs-Draft summary + next concrete action + what NOT to do.                                            | Every phase shift; keep it short.                              |
| `STATUS.md`                | Living description of the project's current state + Authority Snapshot.                                                                             | Every major phase shift.                                       |
| `execution-state/INDEX.md` | **Per-workflow build state.** Persona-by-persona + combined. The workflow-truth surface — must be updated before/at-pause/after every coding slice. | Every slice (3 triggers per slice).                            |
| `workflow-maps/INDEX.md`   | **Workflow architecture maps.** Journey flowcharts + cross-persona sequences + ER diagram.                                                          | Whenever flow truth changes (new step, new branch).            |
| `owner-input/INDEX.md`     | **Control loop layer.** Owner notes + approvals + active-slice + decisions log + change history. NEW 2026-05-15 evening.                            | Every slice transition + every owner action.                   |
| `feature-queue/INDEX.md`   | **Upcoming-slice queue.** Ordered list of next slices with scope per item.                                                                          | When a slice queues, dequeues, blocks, or finishes.            |
| `generated/`               | **Read-only outputs** — `app-workflow-dashboard.html` + `app-workflow-state.json`. Regenerated automatically when canonical sources are staged.     | Auto via pre-commit hook; manual via `pnpm run handoff:build`. |
| `scripts/`                 | The generator. Read-only at runtime; edited only when output schema changes.                                                                        | Rare.                                                          |
| `ROADMAP.md`               | What's planned next.                                                                                                                                | When the next phase is named.                                  |
| `PROMOTION_CHECKLIST.md`   | Mandatory checklist for Draft → Active promotions. Run end-to-end or do not promote.                                                                | Rare — only when the promotion process itself changes.         |
| `done/`                    | Archive subfolder. Each completed phase gets one Markdown file using the standardised template.                                                     | Append a new file when a phase closes.                         |

## Where actual content lives

The handoff folder does **not** duplicate content. It points to:

- **`axhy-v3/docs/specs/`** — active specs (governing source of truth; promoted via `canonical-truth.md`).
- **`axhy-v3/docs/plans/`** — implementation plans, kickoff memos, build sequences.
- **`axhy-v3/docs/audits/`** — audit drafts (reviewable artifacts, not governing).
- **`axhy-v3/docs/index/canonical-truth.md`** — the canonical truth index (what's binding).
- **`axhy-v3/docs/protocols/doc-discipline.md`** — doc-discipline protocol + other meta-rules.

## How to use this folder

### Starting a new session (or onboarding) — MANDATORY READ ORDER

1. Read `NEXT_SESSION.md` — 2-min resume.
2. Read `STATUS.md` — full state.
3. Read `execution-state/INDEX.md` — workflow-truth legend + 22 rules.
4. Read `workflow-maps/INDEX.md` — diagram conventions.
5. **Read `owner-input/INDEX.md` — control-loop rules (NEW 2026-05-15 evening).**
6. **Read `owner-input/pending-notes.md` — scan for NEW notes. Acknowledge in your first surface message ("0 NEW notes" or "N NEW notes — first one says…").**
7. **Read `owner-input/pending-approvals.md` — confirm no AWAITING_APPROVAL slice is blocking the intended next slice (rule 17).**
8. **Read `owner-input/active-slice.md` — what is in flight right now.**
9. **Read `feature-queue/INDEX.md` — what's next + dependencies.**
10. Read the persona file(s) in both `execution-state/` and `workflow-maps/` that the slice touches.
11. Read `combined.md` + `combined-system.md` if the slice spans personas.
12. Read `ROADMAP.md` — phase-level forward look.
13. Read whichever specs/plans/audits `STATUS.md` points you to. Nothing else.

**Reconciliation rules:**

- If `execution-state/` and `STATUS.md` / `NEXT_SESSION.md` disagree → STOP. Reconcile before any code (execution-state INDEX rule 5).
- If `owner-input/` and the dashboard disagree → markdown wins; regenerate (rule 12).
- If there is a NEW owner note that affects the intended slice → STOP. Acknowledge it first (rule 16).
- If there is an AWAITING_APPROVAL slice → STOP. No new slice starts until the prior one is approved (rule 17).

### Finishing a phase

Follow the **Mandatory Update Order** below. Do not skip steps.

### Starting a new phase

1. Update `STATUS.md` — note the new active phase + which artifacts are live.
2. Update `NEXT_SESSION.md` — point to the new authorities.
3. Update `ROADMAP.md` — shift the forward look.
4. Begin work in the proper folders (`specs/`, `plans/`, `audits/`).

### Promoting a Draft to Active

Run `PROMOTION_CHECKLIST.md` end-to-end. Half-done promotions are the biggest drift source in v3 — they're forbidden.

## AI Anti-Drift Rules

A future AI session must follow these. They exist because long sessions, memory drift, and Draft-vs-Active confusion are the predictable failure modes of this project.

1. **Do not start from older Active specs alone.** Always read `handoff/STATUS.md` first; closure work may already supersede their deferred items.
2. **Do not assume a Draft closure spec is binding** unless STATUS says founder approved / Active promoted. Draft = candidate authority, not actual authority.
3. **Do not reopen finished audit rounds** (5 audits locked) unless STATUS explicitly says a contradiction was found.
4. **Do not create a new long planning packet** when a kickoff memo already exists for the current layer. Build from the existing memo or update it; don't restart.
5. **Do not treat memory as sufficient** — verify against the files listed in STATUS. Memory drifts; files don't.
6. **When resuming implementation, use the current kickoff memo as sequencing authority**, not old plan files.
7. **If STATUS and an older spec conflict, stop.** Resolve the precedence explicitly — either update STATUS or update the older spec. Do not silently assume one wins.
8. **If a long session loses context, re-read README → NEXT_SESSION → STATUS** before continuing. Cheaper than rebuilding wrong assumptions.

## Mandatory Update Order

When a phase starts or ends, the handoff files MUST be updated in this exact order. Out-of-order updates leave inconsistent state for future sessions.

1. **`STATUS.md` first** — single source of state truth. Mark the phase complete / shifting; update Authority Snapshot.
2. **`NEXT_SESSION.md` next** — reflect the new 2-min resume.
3. **`ROADMAP.md` next** — shift the forward look.
4. **Then add or update the relevant artifact** in `specs/` / `plans/` / `audits/`.
5. **When a phase fully closes** — add one file under `done/` using the standardised template (see below).
6. **If a Draft is promoted to Active** — run `PROMOTION_CHECKLIST.md` end-to-end as part of the same change (canonical-truth + cross-refs + STATUS + NEXT_SESSION all updated together).
7. **When coding actually begins** — update `STATUS.md` and `NEXT_SESSION.md` the same day with: branch name, current layer, and whether build is from an Active spec or an explicit Draft-based founder approval. Prevents "which branch are we on and was this approved?" drift.

This order is non-negotiable.

## Verification discipline

**Local verification is mandatory for each implementation slice before moving to the next.** Doc-level checks (`prisma format`, `prisma validate`, `prisma generate`, `pnpm typecheck`) are necessary but **not sufficient** — they pass on syntactically correct schemas that would fail against a real database. The migration-baseline gap surfaced 2026-05-15 (foundational tables missing CREATE statements in any migration) was a class of bug that only a real-DB apply would have caught.

### The rule

For every code-touching slice (PR, migration, schema change, generator change):

1. **Doc-level checks pass** — `prisma format`, `prisma validate`, `prisma generate`, `pnpm typecheck`, `pnpm lint`.
2. **Real-DB / real-service verification pass** — `prisma migrate deploy` (or `migrate dev`) against a local Postgres, plus a smoke query against the affected table(s) / RPC. If the slice touches outbox / cron / a downstream service, exercise it.
3. **Verification status declared explicitly** in the commit message or PR description: `verified locally`, `verified against real DB/service`, or `not yet verified — <reason>`. Never silent.

A slice that passes (1) but not (2) is **not done**. It compiles; it does not necessarily work.

### Why

- `prisma migrate diff` on production-tagged DBs is harness-blocked. Local Postgres is the path.
- Production migrations have failed silently because the local CI matrix did not include a fresh-DB apply step (the baseline-recovery investigation is the canonical example).
- "Compiles + types check" is the bar for code quality, not the bar for shippability. Shippability requires the underlying system actually accepting the change.

### How to apply

- **First slice of any new layer**: stand up a local Postgres (Docker or native), run `prisma migrate deploy` from fresh, confirm green.
- **Every subsequent slice in the same layer**: apply just the new migration to the existing local DB and run a smoke query.
- **If you cannot run real-DB verification** (no docker available, can't bring up a local Postgres, etc.): mark the slice `not yet verified — <reason>` and **do not** present it as ready for merge. Surface to founder and pause.
- **Failure during real-DB verification is a finding, not a noise event.** Investigate root cause; do not paper over with a quick patch.

This discipline is per-slice, not per-PR — a PR that contains 3 slices needs 3 verification statements.

## `done/` archive template

Every file under `done/` MUST use this template so old phases are scannable:

```markdown
# Phase Archive — <Phase Name>

**Phase name:**
**Started:**
**Completed:**
**Phase outcome:** (one sentence)

## What this phase delivered

- Artifact list with file paths + statuses.

## What became authoritative

- Specs / plans / audits that became Active in this phase.

## What stayed Draft

- Items still Draft at phase exit.

## What was deferred

- Open items + reasons.

## What the next phase was expected to do

- Forward pointer.
```

Do not let `done/` become a pile of freeform notes.

## Failure Modes This Folder Prevents

This ritual exists because v3 has predictable continuity failure modes:

- **Implementing from stale Active specs** without reading newer closure work.
- **Treating Draft docs as binding too early** because their language sounds authoritative.
- **Reopening finished audit loops** because no one updated STATUS to say they were locked.
- **Building from old plan packets** instead of the current kickoff memo.
- **Memory-only continuity** without repo verification (memory drifts in days; files don't).
- **Long-session amnesia** where earlier context is forgotten mid-session.
- **Phase changes not reflected in status docs** — work proceeds on the wrong assumption.
- **Half-done Draft → Active promotions** that leave canonical-truth and cross-refs inconsistent.

Each handoff file addresses one or more of these. Skip the ritual and the failure modes return.

## Source-of-truth precedence

```
Active specs (binding for their own contracts; listed in canonical-truth.md)
        +
Draft closure spec (candidate cross-cutting design authority; binding only after Active promotion)
        +
Current layer kickoff memo (Draft — candidate sequencing authority for the active build phase)
        ↓
Implementation PRs (code source of truth)
```

When in doubt, consult `STATUS.md` "Authority Snapshot" + `canonical-truth.md`.

## Cross-references

- Auto-loaded memory: `~/.claude/projects/-Users-thotaakshay-eclean-workspace/memory/v3/MEMORY_V3.md`
- Workspace rules: `~/eclean_workspace/CLAUDE.md`
- v3 master plan: `~/.claude/plans/now-i-think-it-functional-kernighan.md`
- Doc-discipline protocol: `docs/protocols/doc-discipline.md`

This folder is git-tracked. Update files in the normal git workflow — they live alongside the code.
