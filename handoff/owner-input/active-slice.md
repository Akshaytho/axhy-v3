# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner (friend's 2026-05-15 evening reconciliation).

## Current

| Field                         | Value                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**                | `chat-writes-proposed-decisions` (F-002)                                                                                                                                                                                                                                                                                                |
| **Status**                    | `WIP`                                                                                                                                                                                                                                                                                                                                   |
| **Branch**                    | `feat/layer-1-core-primitives`                                                                                                                                                                                                                                                                                                          |
| **Last landed commit**        | `1fb546e` — `fix(handoff): full sweep for forward-looking wording`                                                                                                                                                                                                                                                                      |
| **Scope artifact (approved)** | `handoff/feature-queue/scopes/F-002.md` (approved 2026-05-15 evening with all 5 default picks)                                                                                                                                                                                                                                          |
| **Workflow IDs affected**     | `D17` (writer side), `D20` (writer side — EMPLOYMENT-tier ack gate), `C11`, `E21`, `E22`, `E24`                                                                                                                                                                                                                                         |
| **Personas affected**         | Ravi (originator), Lakshmi/Anjali (current responsible — consumes via F-001's `GET /decisions/proposed-for-me`), Kavitha (EMPLOYMENT ack), Suresh (subject)                                                                                                                                                                             |
| **Locked picks (Q1–Q5)**      | Q1=(b) best-effort originContext capture · Q2=(a) single slice · Q3=(a) include dismiss + migration · Q4=(b) defer state ENUM · Q5=reuse F-001 helpers for `proposedDuringAbsence`                                                                                                                                                      |
| **Files in slice**            | `packages/shared-schema/prisma/schema.prisma` (+2 cols) · new migration · `apps/backend/src/lib/audit-event.ts` (+3 helpers) · new `apps/backend/src/lib/supervisor-decision-writer.ts` · `apps/backend/src/routes/chat.ts` (propose + apply modified) · `apps/backend/src/routes/decisions.ts` (+ dismiss endpoint) · 5 new test files |
| **Tests status**              | none yet                                                                                                                                                                                                                                                                                                                                |
| **Verification status**       | `UNVERIFIED` until real-DB sweep runs (fresh local Postgres 16 + all 11 migrations including new dismiss-cols migration). Sweep must include 4 F-001 routing tests as regression sanity + 5 new F-002 tests.                                                                                                                            |
| **Started at**                | 2026-05-15 evening — immediately after F-002 scope approval at HEAD `1fb546e`.                                                                                                                                                                                                                                                          |
| **Expected next state**       | `AWAITING_APPROVAL` after all 9 test files green (4 F-001 + 5 F-002) + tracker propagated.                                                                                                                                                                                                                                              |

## What this slice does

Inserts a PROPOSED → APPLIED lifecycle between the chat extractor's "decision proposal" and the domain write. Today's chat-MVP applies decisions directly (e.g. `propose_mark_absent` → `POST /workers/:id/mark-absent`) without ever creating a `SupervisorDecision` row. F-002 fixes that by:

1. **PROPOSED writer** — every `propose_*` tool call writes a `SupervisorDecision` row (`appliedAt: null`) inside the same transaction that persists the assistant message. Row carries `kind`, `tier`, `targetId`, `payload`, `originContext` (best-effort), `proposedDuringAbsence` (detected via F-001's helpers).
2. **APPLY transition** — `/chat/apply` looks up the row by id, verifies tenant + caller-is-responsible (via F-001's `getEffectiveResponsibleUserId`) + `appliedAt IS NULL`, then in one transaction sets `appliedAt = now()` and performs the existing domain write.
3. **DISMISS endpoint** — new `POST /decisions/:id/dismiss` with same tenant + responsibility verification; sets new `dismissedAt` + `dismissedReason` columns; emits `SUPERVISOR_DECISION_DISMISSED`.
4. **AuditEvent kinds** — 3 new kinds (`SUPERVISOR_DECISION_PROPOSED`, `SUPERVISOR_DECISION_APPLIED`, `SUPERVISOR_DECISION_DISMISSED`) with typed helpers.

F-001's read API (`GET /decisions/proposed-for-me`) is the consumer — round-trip test included.

## What is NOT being done in this slice (deferred per scope)

- State ENUM column for DISMISSED / FAILED / EXPIRED / UNDONE — defer per Q4=(b). Today's discriminator is `appliedAt` + new `dismissedAt`.
- Undo window UI (30-min reverse) — chat-MVP / UI concern, not substrate.
- Worker-side notification of the decision — that's F-007.
- EMPLOYMENT-tier HR ack surface — that's F-005 (HR portal).
- HandoffPackage composition on binding change — that's F-004.
- Backfilling existing chat history — pre-F-002 chat turns don't get retroactive DWI rows.

## Hash-truth convention

The "Last landed commit" / "Scope artifact (approved)" rows above name ONLY landed commit hashes. Under the auto-regen pre-commit hook the new commit's hash is created AFTER the file is written and staged, so at write-time we cannot know the hash that will contain this file. Convention:

- List only commits already in `git log`.
- After a commit lands, the NEXT edit to this file names that commit explicitly.
- No "landing now", no "may land", no "next commit will be", no "in this commit" wording.

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- Header active-slice banner + Current Slice focus callout both read from here (single source).
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
