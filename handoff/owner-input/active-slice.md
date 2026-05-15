# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner (friend's 2026-05-15 evening reconciliation).
>
> **Between-slices state (2026-05-15 evening):** Routing slice approved; F-002 surfaced as next per friend's directive — no code yet. Friend's verbatim: "surface the next planned slice before writing code". Active WIP is intentionally empty until the F-002 scope is approved.

## Current

| Field                              | Value                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                     | `routing-foundation-read-apis` (F-001) — most-recent activity; no new WIP slice yet (rule 18 honoured)                                                                                                                                                                                                                       |
| **Status**                         | `APPROVED` — friend's verification 2026-05-15 evening; no WIP slice in flight; `F-002` queued as next, scope under review                                                                                                                                                                                                    |
| **Branch**                         | `feat/layer-1-core-primitives`                                                                                                                                                                                                                                                                                               |
| **Last landed commit**             | `9709b5d` — `docs(handoff): routing F-001 APPROVED → surface F-002 scope (no code yet)`                                                                                                                                                                                                                                      |
| **Just-approved slice**            | `routing-foundation-read-apis` (F-001) — 3 commits (`84ae39c` · `429886d` · `7e07a24`) + tracker propagation `aa363f0`; 23/23 cases green on fresh local Postgres 16; friend's verification at HEAD `aa363f0` cleared with no blocking findings; WIP-split deviation accepted                                                |
| **Next slice candidate**           | `F-002` — `Chat extractor writes PROPOSED SupervisorDecision rows`. Dependency on F-001 met. Scope artifact landing in this commit (`feature-queue/scopes/F-002.md`) for friend's approve / change-request / hold before any code lands.                                                                                     |
| **Workflow IDs touched by F-002**  | `D17` (writer side), `D20` (writer side — EMPLOYMENT-tier ack gate), `C11`, `E21`, `E22`, `E24`                                                                                                                                                                                                                              |
| **Personas affected by F-002**     | Ravi (originator), Lakshmi/Anjali (current responsible — consumes via F-001's `GET /decisions/proposed-for-me`), Kavitha (EMPLOYMENT ack), Suresh (subject)                                                                                                                                                                  |
| **Why F-002 is next**              | Friend's roadmap order; closure spec §3.2 SupervisorDecision lifecycle is the largest live gap; F-001's read API is now ready to consume F-002's writes round-trip; closure Decision 7 (`originContext` + `proposedDuringAbsence`) already landed in schema (commit `095c766`, migration `20260515_layer_1_core_primitives`) |
| **What is NOT being done yet**     | Writing F-002 code. The scope doc must be approved first per rule 23 (confidence-score-before-acting) and friend's directive.                                                                                                                                                                                                |
| **Expected next state transition** | After friend approves the scope: F-002 PLANNED → WIP, this file flips to active F-002 tracking.                                                                                                                                                                                                                              |

## What just shipped (F-001)

Per `handoff/workflow-maps/supervisor-ravi.md` (D17 / F26 / F27 read side):

- **`getEffectiveBinding(tx, { companyId, siteId, at? })`** — central, anti-drift read of who is the effective responsible supervisor at a moment, applying §5.8 precedence (ACTING > PERMANENT).
- **`deriveWorkerPrimarySiteId(tx, { companyId, workerId, at? })`** — point-in-time aware fallback chain (effective Assignment → most-recent ACTIVE → most-recent any) per responsibility-model §5.9.
- **`GET /sites/:siteId/effective-supervisor`** — per-site point-in-time lookup with `?at=ISO8601`.
- **`GET /decisions/proposed-for-me`** — narrow kinds routed by current responsibility; all other kinds fall back to origin-supervisor.

These reads are now ready to consume F-002's writes round-trip.

## Pointer to F-002 scope

The scope artifact lives at `handoff/feature-queue/scopes/F-002.md` (new in this commit). Friend reviews + approves / change-requests / holds via the standard approval-word convention before any F-002 code lands.

## Hash-truth convention (inherited from control-loop slice)

The "Just-approved slice" / "Last landed commit" rows above name ONLY landed commit hashes — never speculation about commits that haven't finished. Under the auto-regen pre-commit hook the new commit's hash is created AFTER the file is written and staged, so at write-time we cannot know the hash that will contain this file. Convention:

- List only commits already in `git log`.
- After a commit lands, the NEXT edit to this file names that commit explicitly.
- No "landing now", no "may land", no "next commit will be" wording.

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- Header active-slice banner + Current Slice focus callout both read from here (single source).
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
