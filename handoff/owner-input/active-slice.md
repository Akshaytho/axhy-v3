# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner (friend's 2026-05-15 evening reconciliation).

## Current

| Field                                               | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Slice name**                                      | `chat-writes-proposed-decisions` (F-002)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Status**                                          | `CHANGES_REQUESTED` — friend's production-grade review found 4 safety findings (rule P3 / P4 / P5 / P1+P2). Remediation plan surfaced in `pending-approvals.md` for owner's approval before any fix code is written.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Branch**                                          | `feat/layer-1-core-primitives`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Last landed commit**                              | `662e146` — `test(decisions): 5 integration test files for F-002 (54/54 green)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Scope artifact (approved)**                       | `handoff/feature-queue/scopes/F-002.md` (approved 2026-05-15 evening with all 5 default picks)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Slice commits (oldest → newest)**                 | `a8b4e79` (schema + migration) · `73ee9eb` (audit kinds + helpers + payloads) · `8d20db0` (supervisor-decision-writer.ts) · `7fbddcb` (chat.ts propose + apply) · `12f27ed` (dismiss route + tighten proposed predicate) · `662e146` (5 integration test files)                                                                                                                                                                                                                                                                                                                                                                |
| **Workflow IDs affected**                           | `D17` (writer side), `D20` (writer side — EMPLOYMENT-tier ack gate), `C11`, `E21`, `E22`, `E24`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Personas affected**                               | Ravi (originator), Lakshmi/Anjali (current responsible — consumes via F-001's `GET /decisions/proposed-for-me`), Kavitha (EMPLOYMENT ack), Suresh (subject)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Locked picks (Q1–Q5)**                            | Q1=(b) best-effort originContext capture · Q2=(a) single slice · Q3=(a) include dismiss + migration · Q4=(b) defer state ENUM · Q5=reuse F-001 helpers for `proposedDuringAbsence`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Tests status**                                    | 9/9 test files green (4 F-001 regression + 5 F-002 new); 54/54 cases pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Verification status**                             | `REAL_DB` — fresh local Postgres 16 (Docker container `axhy-test-pg` on port 55432), all 11 migrations applied (20260507 → 20260517), full sweep in one run. Container left running for friend's spot-check.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Known limitation (surfaced for friend's review)** | Inject-style `/chat/apply` branches (mark_absent / leave / swap / create_assignment / living_doc_update): lifecycle commits in tx 1, domain inject runs in tx 2. If the domain inject fails after lifecycle commits, the row is in APPLIED state with no downstream effect (orphan APPLIED row). Audit trail tells the truth (DWI_APPLIED present, domain audit absent). Acceptable for F-002 MVP per scope §3b ("inside one transaction" — interpreted pragmatically given the inject() architecture). `propose_termination` is fully atomic (shared tx). A future-cleanup slice can extract domain logic to be tx-shareable. |
| **Started at**                                      | 2026-05-15 evening — immediately after F-002 scope approval at HEAD `1fb546e`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Completed at**                                    | 2026-05-15 evening — slice complete; awaiting friend's approval word.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## What this slice does

Inserted a PROPOSED → APPLIED lifecycle between the chat extractor's "decision proposal" and the domain write. Today's chat-MVP applied decisions directly (e.g. `propose_mark_absent` → `POST /workers/:id/mark-absent`) without ever creating a `SupervisorDecision` row. F-002 now:

1. **PROPOSED writer** — every `propose_*` tool call writes a `SupervisorDecision` row (`appliedAt: null`, `dismissedAt: null`) inside the same transaction that persists the assistant message. Row carries `kind`, `tier`, `targetId`, `payload`, `originContext` (best-effort), `proposedDuringAbsence` (detected via F-001's helpers), `ackRequired` (true for EMPLOYMENT-tier).
2. **APPLY transition** — `/chat/apply` looks up the row by `decisionId` (new optional field in `ApplyDecisionCardInput`), verifies tenant + caller-is-responsible (via F-001's `getEffectiveResponsibleUserId`) + `appliedAt IS NULL AND dismissedAt IS NULL`, then performs the domain write. `propose_termination` does this in one shared transaction; the other inject-style tools do lifecycle update first, then domain inject (see Known limitation above).
3. **DISMISS endpoint** — new `POST /decisions/:id/dismiss` with same tenant + responsibility verification; sets `dismissedAt` + `dismissedReason` columns; emits `SUPERVISOR_DECISION_DISMISSED`. Dismissed rows are excluded from `GET /decisions/proposed-for-me` (predicate tightened).
4. **AuditEvent kinds** — `DWI_PROPOSED`, `DWI_APPLIED`, `DWI_DISMISSED` with typed payload schemas + helpers.

F-001's read API (`GET /decisions/proposed-for-me`) is the consumer — round-trip integration covered in the dismiss-route test.

## What is NOT in this slice (deferred per scope)

- State ENUM column for DISMISSED / FAILED / EXPIRED / UNDONE — deferred per Q4=(b). Today's discriminator is the pair (`appliedAt`, `dismissedAt`).
- Undo window UI (30-min reverse) — chat-MVP / UI concern, not substrate.
- Worker-side notification of the decision — that's F-007.
- EMPLOYMENT-tier HR ack surface — that's F-005 (HR portal).
- HandoffPackage composition on binding change — that's F-004.
- Backfilling existing chat history — pre-F-002 chat turns don't get retroactive DWI rows.
- Atomic lifecycle + domain write for inject-style tools — see Known limitation above; cleanup slice TBD.

## Reproduction (for friend's spot-check)

```
docker exec axhy-test-pg pg_isready -U postgres
cd apps/backend
DATABASE_URL="postgres://postgres:test@localhost:55432/axhy_test?schema=axhy" \
AXHY_DB_URL="postgres://postgres:test@localhost:55432/axhy_test?schema=axhy" \
pnpm exec vitest run \
  test/effective-responsibility-helper.test.ts \
  test/sites-effective-supervisor-route.test.ts \
  test/decisions-proposed-for-me-route.test.ts \
  test/effective-responsibility-point-in-time.test.ts \
  test/supervisor-decision-writer-create.test.ts \
  test/supervisor-decision-apply.test.ts \
  test/decisions-dismiss-route.test.ts \
  test/supervisor-decision-proposed-during-absence.test.ts \
  test/chat-apply-transitions-decision.test.ts
```

Expected: 9 files, 54 cases, all green.

## Hash-truth convention

The "Last landed commit" / "Slice commits" / "Scope artifact (approved)" rows above name ONLY landed commit hashes. Under the auto-regen pre-commit hook the new commit's hash is created AFTER the file is written and staged, so at write-time we cannot know the hash that will contain this file. Convention:

- List only commits already in `git log`.
- After a commit lands, the NEXT edit to this file names that commit explicitly.
- No "landing now", no "may land", no "next commit will be", no "in this commit" wording.

## How to read this file

- HTML dashboard auto-renders this content at the top of every page.
- Header active-slice banner + Current Slice focus callout both read from here (single source).
- Source of truth = this markdown. Generated HTML is derivative.
- Update this file at every state transition (rule 19).
