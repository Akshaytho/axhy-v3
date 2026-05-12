---
Status: Draft
Last validated against code: 2026-05-12
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: 63c1dbe
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
Replaced by: nothing — current draft
---

> **DRAFT.** This spec is pending pressure-test review by the external advisor and panel critique. Do not implement yet. Status flips to **Active** once review is complete and founder approves.

# Phase D Lock #1 — Decision Entity Model

**Lock decision:** Path 2 (DecisionWorkspaceItem as durable lifecycle row) for launch, with explicit Path 1 trigger conditions for post-launch migration.

**Why this lock comes first:** every other Phase D contract lock (Visit alive-or-dormant, Attendance writer set, undo contract, LeaveRequest machine, Membership.delegated) becomes easier or harder depending on this answer. Locking Decision first unblocks ~75% of the downstream work.

---

## 1. Context (evidence-first per doc-discipline §8)

**Repo state at draft time (`63c1dbe` on `feat/phase-c-wave-4b-chat-completion`):**

| Surface                                                                                                       | Current shape                                                                                                                                                                                                            | Problem for ops-first launch                                                                                            |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `SupervisorDecision` table                                                                                    | Schema placeholder at [`schema.prisma:657-686`](packages/shared-schema/prisma/schema.prisma#L657-L686). Zero callers. Schema comment: _"This table exists so the connectedness map can see the planned Phase C entity."_ | Cannot back Decisions Workspace; not wired to anything.                                                                 |
| `DecisionCard`                                                                                                | JSON field on `ChatMessage.decisionCard`. `POST /chat/apply` consumes `chatMessageId + toolName + toolInput`.                                                                                                            | Decisions scoped per chat message; cannot surface "all open decisions across threads," cannot include non-chat sources. |
| r3 design (2026-05-11 active spec)                                                                            | Decisions Workspace is a top-level tab; "Review N decisions →" link pushes from chat.                                                                                                                                    | Schema does not yet support standalone decisions independent of chat messages.                                          |
| Cross-source decisions (HR updates, system auto-emissions from Visit transitions, manual Today-tab bulk-mark) | No common surface; each writes to its own domain table directly.                                                                                                                                                         | Activity tab cannot render a unified timeline; undo handlers have no single row to revert from.                         |

## 2. The Decision

### 2.1 What's locked

A new `DecisionWorkspaceItem` table becomes **the launch decision entity** for every supervisor-facing decision, regardless of source. It is the canonical decision record for v3.0: it owns lifecycle state transitions, is the join point for Activity, has its own XState machine, and is written to by all four sources (chat / hr / system / manual).

**Honest naming note (per advisor pressure-test, 2026-05-12):** the name `DecisionWorkspaceItem` and the "Path 2" framing both signal that an eventual migration to a `SupervisorDecision`-named spine remains possible (per §4 trigger conditions). At launch, however, this table is NOT a thin projection — it is the load-bearing decision record. Treat it as such in implementation, tests, and operational reasoning. The "Path 2" label preserves migration optionality; it does not soften the architectural commitment.

### 2.2 Why Path 2 (not Path 1 or Path 3)

| Option                                                                                                     | Why rejected                                                                                                                                 | Why this path                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Path 1** — Promote `SupervisorDecision` to full spine; rewrite chat-apply to write Decision then domain. | Architecturally cleaner but ~3 weeks of plumbing for the same end-user UX as Path 2 at launch. Solo-founder timeline doesn't carry the cost. | —                                                                                                                                                                  |
| **Path 2** — `DecisionWorkspaceItem` as real lifecycle row alongside existing chat-apply path.             | —                                                                                                                                            | Smaller migration (~7-8 days). Reads and writes behave identically to Path 1 from day 1. Migration to Path 1 post-launch is mechanical (writer-side rewrite only). |
| **Path 3** — Drop Decisions Workspace from launch entirely; keep inline DecisionCards.                     | Weakens the ops-first pivot too much. Suresh-persona with 30 compound decisions/day has nowhere clean to manage them.                        | —                                                                                                                                                                  |

External advisor verdict (2026-05-12): Path 2 _"is the right launch bridge if it is treated as a durable launch model, not a sloppy temporary cache."_

### 2.3 Table shape

`DecisionWorkspaceItem` — minimum from external advisor (17 fields) plus 3 extensions justified by existing locks:

| Field                                       | Type                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                        | UUID PK                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `companyId`                                 | UUID FK Company        | RLS-guarded; multi-tenant boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `sourceKind`                                | Enum                   | `CHAT \| HR \| SYSTEM \| MANUAL`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `sourceId`                                  | UUID nullable          | Points at originating entity when one exists (`ChatMessage.id`, `HRUpdate.id`, etc.). Nullable for `MANUAL` writers without a pre-existing source row. For `SYSTEM` writers, may point at an `AuditEvent.id` or the domain row that triggered the proposal. Nullability is intentional — source-truth varies by writer kind.                                                                                                                                                                                                                                                |
| `kind`                                      | Enum                   | `MARK_ABSENT \| APPROVE_LEAVE \| INITIATE_SWAP \| TERMINATE \| CREATE_ASSIGNMENT \| UPDATE_LIVING_DOC` (start; widen per launch tools)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tier`                                      | Enum                   | `NOTE \| OPERATIONAL \| PERSONNEL \| EMPLOYMENT` (existing `SupervisorDecision.tier` enum, reused)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `status`                                    | Enum                   | `PROPOSED \| APPLIED \| DISMISSED \| FAILED \| EXPIRED \| UNDONE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `targetType`                                | Enum                   | `ATTENDANCE \| LEAVE_REQUEST \| SWAP_REQUEST \| ASSIGNMENT \| LIVING_DOC \| WORKER`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `targetId`                                  | UUID nullable          | Points at the domain row this decision created or will create                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `payload`                                   | JSONB                  | The propose-tool input or non-chat source payload                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `batchId`                                   | UUID nullable          | Groups decisions from one compound utterance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `createdAt`                                 | TIMESTAMPTZ            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `updatedAt`                                 | TIMESTAMPTZ            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `appliedAt`                                 | TIMESTAMPTZ nullable   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `dismissedAt`                               | TIMESTAMPTZ nullable   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `failedAt`                                  | TIMESTAMPTZ nullable   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Extensions justified by existing locks:** |                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `supervisorId`                              | UUID FK User           | Per `feedback_supervisor_id_is_user_id` (2026-05-10): stores `User.id`, composite-keyed with `companyId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `failureReason`                             | Enum nullable          | Per Wave 4b advisory review (2026-05-11): `OVERLAP_CONFLICT \| WORKER_ON_LEAVE \| WORKER_NOT_FOUND \| SITE_NOT_FOUND \| STATE_ALREADY_CHANGED \| BACKEND_VALIDATION_FAILED \| PERMISSION_DENIED \| TENANT_CONTEXT_MISMATCH \| IDEMPOTENCY_REPLAY_CONFLICT \| UNKNOWN`. Only populated when `status = FAILED`.                                                                                                                                                                                                                                                               |
| `dismissalReason`                           | TEXT nullable          | Free-text reason when supervisor taps "Not now." Only populated when `status = DISMISSED`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ackRequired`                               | BOOLEAN, default false | True for EMPLOYMENT-tier decisions (termination, permanent personnel actions). Forces typed-phrase confirmation before `APPLIED` is accepted. Default false for OPERATIONAL/PERSONNEL/NOTE tiers.                                                                                                                                                                                                                                                                                                                                                                           |
| `ackedAt`                                   | TIMESTAMPTZ nullable   | Set when supervisor completes the ack step (typed phrase or equivalent). Required to transition to `APPLIED` when `ackRequired = true`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ackPayload`                                | JSONB nullable         | The typed phrase, signature, or other ack evidence. Audit trail for EMPLOYMENT-tier confirmations. Only populated when `ackRequired = true` and `ackedAt IS NOT NULL`.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `noteKind`                                  | Enum nullable          | Added by Phase B revision 2026-05-12 (contradiction #9 path A). Values: `SITE_RULE` (company-shared; client may see it if asked) or `WORKING_NOTE` (supervisor-private; never client-exported). Populated ONLY when `tier = 'note'`. **Immutable after `status = APPLIED`.** Default from chat AI extraction is `WORKING_NOTE` (privacy-safe). See §2.10 for full visibility semantics.                                                                                                                                                                                     |
| `needsReview`                               | BOOLEAN default false  | Added by Phase B revision 2026-05-12 (contradiction #2 path A). When `true`, the decision needs supervisor disambiguation (option-picker UX); `payload.options[]` MUST be populated (≥2 options, each `{id, label, subPayload?}`). **Mutually exclusive with `ackRequired`** — a row may have AT MOST ONE of `{needsReview=true, ackRequired=true}` at launch. **Immutable after extraction** — never flipped on an existing row. AI MUST always emit `tier` alongside (tier = policy severity; `needsReview` = resolution mode; orthogonal). See §2.11 for full semantics. |

**Indexes:**

- `(companyId, supervisorId, status, createdAt DESC)` — Decisions Workspace query
- `(companyId, sourceKind, sourceId)` — lookup by originating entity. `sourceId` is nullable (Postgres allows multiple NULLs in non-unique indexes); MANUAL-source rows have NULL here and are looked up via the `batchId` index below or via `(companyId, supervisorId, createdAt DESC)`.
- `(companyId, targetType, targetId)` — Activity tab join
- `(companyId, batchId)` where `batchId IS NOT NULL` — batch-context lookup for compound utterances and bulk-mark actions
- `(companyId, tier, noteKind, createdAt DESC) WHERE tier = 'note'` — note-tier visibility filter (added per §2.10)

**No undo-window index needed** — the 30-minute undo window is computed at read/write time as `now() - appliedAt <= INTERVAL '30 minutes'`, not stored in an `undoableUntil` field and not swept by cron.

### 2.4 Lifecycle transitions (state machine)

```
                                  ┌──────────────────────────────┐
                                  │                              ▼
   ┌────────────┐            ┌─────────┐    ┌─────────┐    ┌──────────┐
   │            │───────────▶│ APPLIED │───▶│ UNDONE  │    │ EXPIRED  │
   │            │            └─────────┘    └─────────┘    └──────────┘
   │  PROPOSED  │──▶ FAILED                                     ▲
   │            │                                               │
   │            │──▶ DISMISSED                                  │
   │            │                                               │
   └────────────┘───────────────────────────────────────────────┘
                          (cron sweeps PROPOSED > TTL)
```

Transition guards:

- `PROPOSED → APPLIED`: apply handler succeeds; set `appliedAt`, `targetId`. If `ackRequired = true`, requires `ackedAt IS NOT NULL` to transition.
- `PROPOSED → DISMISSED`: supervisor taps "Not now"; set `dismissedAt`, `dismissalReason`
- `PROPOSED → FAILED`: apply handler rejects; set `failedAt`, `failureReason` (typed enum per May-11 advisory)
- `PROPOSED → EXPIRED`: cron sweep (rows older than configured TTL, default 24h)
- `APPLIED → UNDONE`: supervisor taps Undo within the 30-minute window. Window is **computed at the route level** as `now() - appliedAt <= INTERVAL '30 minutes'` — NOT stored. The undo route rejects with a typed error if the window has elapsed. Reversal handler runs in same tx as the row update. **Audit (per Phase B cleanup sweep, contradiction #4):** reversal writes a typed `AuditEvent` with `kind = <APPLY_KIND>_REVERSED`. Known kinds at launch: `ATTENDANCE_REVERSED` (mark-absent undos — per [`activity.jsx:27`](../prototypes/supervisor-mobile-r6/project/src/activity.jsx)), `LEAVE_REVERSED`, `SWAP_REVERSED`, `TERMINATION_REVERSED`, `ASSIGNMENT_REVERSED`. **Surface (per Phase B cleanup sweep, contradiction #3):** UNDONE rows surface in the Activity tab (via AuditEvent timeline), NOT in the Decisions Workspace list. Workspace queries `WHERE status = 'PROPOSED'`; terminal states (APPLIED-then-UNDONE, DISMISSED, FAILED, EXPIRED) live in the Activity timeline.

**Cron scope (simplified per panel critique, 2026-05-12):** the ONLY cron sweep is `PROPOSED → EXPIRED`. There is no undo-specific cron. The 30-minute undo window is enforced per-request by comparing `now()` against `appliedAt`. This drops the `undoableUntil` field and its index entirely; lifecycle complexity stays in the route layer, not the storage layer.

**Re-execution after `UNDONE` (per Maya panel critique):** undone decisions are terminal at the row level. To re-execute after undo, the supervisor creates a new decision (fresh chat utterance or manual action). UI may offer a "redo" affordance that triggers fresh chat extraction, but no `UNDONE → PROPOSED` transition exists at the row level.

All terminal states (APPLIED-then-UNDONE, FAILED, DISMISSED, EXPIRED) are end states; no further transitions. All transitions enforced by an XState machine in `packages/state-machines/src/decision-workspace-item.ts` (consistent with Visit + Worker machines per ADR-0006).

### 2.5 Writers — lifecycle-stage centric (corrected per advisor pressure-test)

**Critical:** chat-source decisions are TWO-stage. Extraction creates `PROPOSED` rows when AI emits a propose tool call; apply/dismiss transitions those rows to terminal states. The Decisions Workspace queries `PROPOSED` rows — those rows MUST exist before the supervisor taps Apply.

| `sourceKind` | Lifecycle stage                                   | Writer / route                                                                                                                                        | Trigger                                                                                                     | Tx scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHAT`       | **Create `PROPOSED`**                             | `openaiToolLoop` post-processing inside `POST /chat/messages` (or a dedicated extraction handler)                                                     | AI emits a `propose_*` tool result during the tool-use loop                                                 | One tx writes N `DecisionWorkspaceItem` rows (one per propose tool call, status=`PROPOSED`, same `batchId` for compound utterances). Existing `ChatMessage` is created in the same tx; `sourceId` points at it. **Amend-flow input (intent tokens, resolved 2026-05-12 contradiction #5 path A):** when `POST /chat/messages` is called with an optional `intentToken` parameter (e.g., `worker:<uuid>`, `site:<uuid>`, `site-flagged:<uuid>`), the route parses the token, validates the subject UUID is `companyId`-scoped, and threads the validated subject + read-only recent-decisions context into the AI prompt. Past decisions are never mutated — amend flows ALWAYS create fresh `PROPOSED` rows. See §2.7. For option-picker variant (`needsReview = true`), see §2.11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `CHAT`       | **`PROPOSED → APPLIED`**                          | `POST /decisions/:id/apply` (replaces existing `POST /chat/apply` semantically; route may keep the chat name for migration)                           | Supervisor taps Apply on a Workspace row (or on a chat-surface backlink that resolves to the Workspace row) | One tx: row status → `APPLIED` + `appliedAt` + `targetId` + writes domain row (Attendance, LeaveRequest, etc.) + AuditEvent. If `ackRequired = true`, route rejects without prior `ackedAt`. If `needsReview = true`, route requires a `chosenOptionId` body parameter — see §2.11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `CHAT`       | **`PROPOSED → DISMISSED`**                        | `POST /decisions/:id/dismiss`                                                                                                                         | Supervisor taps "Not now"                                                                                   | One tx: row status → `DISMISSED` + `dismissedAt` + `dismissalReason` (optional). No domain write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `HR`         | **Direct `APPLIED`** + **parallel ack lifecycle** | `POST /hr-updates` (existing route, extended)                                                                                                         | HR-side admin posts an update (leave approval ack, salary, compliance rule etc.)                            | One tx writes `HRUpdate` + `DecisionWorkspaceItem` (status=`APPLIED`). HR actions land already-confirmed; no `PROPOSED` step in the `DecisionWorkspaceItem` lifecycle. **Parallel ack flow (resolved per Phase B revision 2026-05-12, contradiction #6 path B):** HR Updates may require post-apply typed-words ack per `updates.jsx` (5+ words in the supervisor's own voice). The ack creates `AuditEvent(kind = 'HR_UPDATE_ACKED')` and updates `HRUpdate.ackedAt + ackText` — **NOT** a `DecisionWorkspaceItem` state transition. The two lifecycles run in parallel: the rule applies instantly company-wide via `DecisionWorkspaceItem(status=APPLIED)`; the supervisor's individual ack creates a compliance-evidence record separately. `HRUpdate` schema therefore requires `ackedAt: TIMESTAMPTZ nullable` + `ackText: TEXT nullable` — both are HR-side fields and live OUTSIDE this spec's `DecisionWorkspaceItem` scope (see `docs/specs/2026-05-12-hr-updates-spec.md` (Draft) for full route + fan-out + audience design). **Launch simplification, not a permanent architectural commitment (per Eric panel critique):** if HR-driven actions later become contested (e.g., supervisors disputing >5% of HR actions, or legal/policy actions requiring supervisor pre-approval not just post-acknowledgement), HR may transition to the `PROPOSED` workflow using the same `/decisions/:id/{apply,dismiss}` routes as chat. Treat direct-APPLIED + parallel-ack as the v3.0 launch shape, not the forever pattern. |
| `SYSTEM`     | **Create `PROPOSED`**                             | Dispatcher handler (e.g. `visit.flagged` topic — only fires if Visit is alive at launch per lock #2; otherwise cost-cap firing + worker no-show only) | System auto-emits when a state transition or rule triggers supervisor review                                | One tx writes domain row + `DecisionWorkspaceItem` (status=`PROPOSED`, awaits supervisor). Apply/dismiss transitions use the same `/decisions/:id/{apply,dismiss}` routes as chat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `MANUAL`     | **Direct `APPLIED`**                              | `POST /supervisor/bulk-mark-absent` (new route, called from Today tab)                                                                                | Supervisor bulk-marks N workers absent from Today tab                                                       | One tx writes N `Attendance` rows + N `DecisionWorkspaceItem` rows (status=`APPLIED`, same `batchId`). `sourceId` is NULL (no pre-existing source row). Manual actions are supervisor-confirmed at the moment of the click — no `PROPOSED` step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**FAILED transitions** can originate from any apply attempt (`CHAT`, `HR`, `SYSTEM`, `MANUAL`) — when domain validation rejects, the writer route catches the rejection and updates the row to `FAILED` with the typed `failureReason`.

### 2.6 Reads

| Surface                 | Query                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Decisions Workspace tab | `GET /decisions?status=PROPOSED&supervisor=me&since=cursor&limit=50` returns `DecisionWorkspaceItem` rows joined with target preview. This is the primary review/apply surface.                                                                                                                                                                                                                                    |
| Activity tab            | `GET /activity?since=cursor&limit=50` joins `DecisionWorkspaceItem` + `AuditEvent` ordered by `createdAt DESC`                                                                                                                                                                                                                                                                                                     |
| Today tab               | Aggregates `DecisionWorkspaceItem` counts per site for supplemental analytics (e.g. "3 absent today, 2 sites short"). **Today's operational truth remains `Attendance` — `DecisionWorkspaceItem` is not a truth substitute.** Counts shown on Today derive from `Attendance` rows; decision-row counts may be displayed for context but must never be the source of who-is-where.                                  |
| Chat thread (existing)  | During Path 2, `ChatMessage` carries a lightweight backlink to its associated `DecisionWorkspaceItem` rows via `sourceId`. Inline `DecisionCard` JSON rendering is **demoted per r3 design** — chat surface shows a "Review N decisions →" affordance that pushes to the Decisions Workspace, NOT a stack of inline cards. The Workspace is where decisions are reviewed and applied; chat is the capture surface. |

### 2.7 UI intent tokens (amend flow input)

**Resolved per Phase B revision 2026-05-12, contradiction #5 path A.**

Supervisor mobile surfaces (Today tab worker rows, Today tab flagged-site badges, Decisions Workspace amend links) emit synthetic identifiers when the supervisor taps to "amend" something. These identifiers are passed to chat via an optional `intentToken` parameter on `POST /chat/messages`.

**Critical principle:** intent tokens are **UI affordances, NOT persisted decision identifiers**. They scope the AI prompt's context for the supervisor's next utterance. They never mutate past decisions, never become row IDs, and are never stored.

**Token format and launch vocabulary (R6 set only — do not extend yet):**

| Token kind     | Format                | UI source                        |
| -------------- | --------------------- | -------------------------------- |
| `worker`       | `worker:<uuid>`       | Today tab worker-row tap         |
| `site`         | `site:<uuid>`         | Today tab site-card menu actions |
| `site-flagged` | `site-flagged:<uuid>` | Today tab flagged-site badge tap |

Extensions (e.g., `visit:<uuid>`, `assignment:<uuid>`, `leave-request:<uuid>`) are deferred until a real product scenario demands them.

**Backend handling on `POST /chat/messages`:**

1. **Parse:** split token on `:` into `kind` + `uuid`. Reject with `BAD_INPUT` if format is invalid or `kind` is unknown.
2. **Validate tenant scope:** look up the subject UUID against the caller's `companyId`. For `worker:<uuid>` the lookup is `SELECT id FROM Worker WHERE id = $uuid AND companyId = $auth.companyId`; equivalent against `Site` for `site:*` and `site-flagged:*`. Reject with `TENANT_CONTEXT_MISMATCH` if not found.
3. **Build prompt context:** thread the validated subject into the AI's system prompt as structured context. Include the subject's name/identifier AND, as **read-only context**, the supervisor's 1–3 most recent decisions targeting that subject (status `PROPOSED` or `APPLIED`, ordered by `createdAt DESC`). These appear in the prompt as: "Recent decisions for [subject] — for context only, do not amend or mutate."
4. **Standard chat flow:** AI emits `propose_*` tool calls based on the supervisor's utterance. The chat-extraction Writer (§2.5 CHAT-Create-`PROPOSED`) writes fresh `DecisionWorkspaceItem(status=PROPOSED)` rows. **Past decisions are never modified.**

**Tenant safety guarantees:**

- **Single validation point** — token-parse function in the route handler. One cross-tenant integration test covers all token kinds.
- **No lookup-to-existing-id path** — the synthetic token never resolves to a `DecisionWorkspaceItem.id`. There is no backend code path where an intent token enters the decision-mutation surface.
- **Cross-tenant tokens reject before AI is invoked** — no token leakage into prompt context if validation fails.

**Failure UX (generic at launch per Phase B revision):**

Both `BAD_INPUT` (malformed token, unknown kind) and `TENANT_CONTEXT_MISMATCH` (cross-company subject) surface to mobile as: "Couldn't open amend mode — try chat without the shortcut." Specific error wording deferred.

**What this section does NOT cover:**

- The AI tool-use loop may, in a separate code path, resolve specific past decisions when the supervisor's utterance EXPLICITLY references one (e.g., "undo yesterday's leave for Bipul"). That is an AI-level reference resolution distinct from the intent-token path. To be specified when the corresponding `propose_undo_*` tool surface is designed — out of scope for this lock.

### 2.8 ReplacementInvite (separate entity)

**Resolved per Phase B revision 2026-05-12, contradiction #13 path A.**

When a supervisor invokes the Replacement Picker (R6 `replacement-picker.jsx`) and sends an invite to a candidate worker, the system creates a `ReplacementInvite` row. This is a **separate top-level entity, NOT a `DecisionWorkspaceItem`**. Three reasons it stays separate:

1. **Actor model differs** — candidate is the responder; for `DecisionWorkspaceItem`, the supervisor is.
2. **TTL differs** — 2 minutes vs 24 hours.
3. **Status semantics differ** — `REJECTED` (candidate-rejected) is meaningfully distinct from `DISMISSED` (supervisor-dismissed).

**Critical principle (per advisor caution 2026-05-12):** `ReplacementInvite` is intentionally separate. If acceptance, rejection, or expiry later emits a `DecisionWorkspaceItem` row, an AuditEvent referenced elsewhere, or any other side-effect, those are **follow-on effects** of the invite's terminal state — never part of the core entity itself. The entity's own lifecycle is just: `SENT → ACCEPTED | REJECTED | EXPIRED | CANCELLED`. Keep the coupling minimal.

**Minimum shape (full schema deferred to implementation phase):**

| Field                                 | Notes                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                                  | UUID PK                                                                                              |
| `companyId`                           | UUID FK Company — tenant boundary                                                                    |
| `supervisorId`                        | UUID FK User — who initiated the invite (User.id per May-10 lock)                                    |
| `parentDecisionId`                    | UUID nullable — optional `DecisionWorkspaceItem.id` that triggered the search (the absence decision) |
| `candidateWorkerId`                   | UUID FK Worker — who got invited                                                                     |
| `replacingWorkerId`                   | UUID FK Worker nullable — the absent worker being replaced, if known                                 |
| `forSiteId`, `shiftStart`, `shiftEnd` | what the candidate is being invited to                                                               |
| `status`                              | Enum: `SENT \| ACCEPTED \| REJECTED \| EXPIRED \| CANCELLED`                                         |
| `sentAt`                              | TIMESTAMPTZ — when invite was sent                                                                   |
| `expiresAt`                           | TIMESTAMPTZ — computed at send as `sentAt + INTERVAL '2 minutes'`                                    |
| `respondedAt`                         | TIMESTAMPTZ nullable — when candidate accepted or rejected (NULL if expired or still SENT)           |
| `cancelledAt`                         | TIMESTAMPTZ nullable — when supervisor cancelled (if applicable)                                     |
| `notificationChannel`                 | enum/string nullable — WhatsApp / SMS / push (specific channel choice deferred to product)           |

**Indexes:**

- `(companyId, supervisorId, status, createdAt DESC)` — supervisor's invite history
- `(companyId, status, expiresAt) WHERE status = 'SENT'` — cron expiry sweep
- `(candidateWorkerId, status) WHERE status = 'SENT'` — candidate-side lookup

**Lifecycle state machine:**

```
   ┌────────┐    ┌──────────┐
   │        │───▶│ ACCEPTED │
   │        │    └──────────┘
   │        │    ┌──────────┐
   │        │───▶│ REJECTED │
   │  SENT  │    └──────────┘
   │        │    ┌──────────┐
   │        │───▶│ EXPIRED  │   (cron sweep)
   │        │    └──────────┘
   │        │    ┌──────────┐
   │        │───▶│CANCELLED │   (supervisor cancels mid-2-min)
   └────────┘    └──────────┘
```

All terminal states are end states; no further transitions. Enforced by an XState machine in `packages/state-machines/src/replacement-invite.ts` (consistent with Visit + Worker + DecisionWorkspaceItem machines per ADR-0006).

**TTL enforcement — two layers (BOTH required):**

1. **Route-level check on candidate accept:** `POST /replacement-invites/:id/accept` validates `now() - sentAt <= INTERVAL '2 minutes'`. If past, rejects with typed failure `INVITE_EXPIRED`. Prevents stale accepts that slip past the cron window. **Hard reject — no grace window** (per Phase B revision pick).
2. **Cron sweep for unaccepted invites:** every 30 seconds, query `SELECT id FROM ReplacementInvite WHERE companyId = X AND status = 'SENT' AND expiresAt <= now()`. For each row: transition to `EXPIRED`, write `AuditEvent(kind = 'REPLACEMENT_INVITE_EXPIRED')`, fire outbox topic `replacement_invite.expired`. Supervisor receives notification via dispatcher.

**Why cron is required here (different from D.1 undo, where cron was dropped):** with undo, the supervisor is the actor and knows whether they undid. With invites, the candidate is the actor; the supervisor needs prompt feedback when the candidate doesn't respond so they can pick another. Route-check-only would leave the supervisor uninformed.

**Routes (shape specified; implementation deferred):**

- `POST /replacement-invites` — supervisor sends; creates `SENT` row + fires notification outbox
- `POST /replacement-invites/:id/accept` — candidate accepts; transitions `SENT → ACCEPTED`; idempotent (re-accept returns cached success)
- `POST /replacement-invites/:id/reject` — candidate rejects; transitions `SENT → REJECTED`
- `POST /replacement-invites/:id/cancel` — supervisor cancels mid-2-min; transitions `SENT → CANCELLED`
- `GET /replacement-invites?status=SENT&supervisor=me` — supervisor's pending invites
- Cron (internal): expiry sweep

**Audit-event kinds emitted (new — separate from `DecisionWorkspaceItem` audit kinds):**

- `REPLACEMENT_INVITE_SENT`
- `REPLACEMENT_INVITE_ACCEPTED`
- `REPLACEMENT_INVITE_REJECTED`
- `REPLACEMENT_INVITE_EXPIRED` (cron-emitted, `actorId = NULL`)
- `REPLACEMENT_INVITE_CANCELLED`

**ReplacementInvite-specific failure reasons (separate enum, distinct from `DecisionWorkspaceItem.failureReason`):**

- `INVITE_EXPIRED` — accept attempted past 2-min window
- `INVITE_ALREADY_RESPONDED` — accept/reject attempted on a row already in terminal state
- `INVITE_CANCELLED_BY_SUPERVISOR` — accept attempted on a cancelled invite

**Path 1 trigger risk: none.** `ReplacementInvite` is a separate entity with its own actor model, lifecycle, and TTL. `DecisionWorkspaceItem` is untouched. Path 2 stays clean (see §4 trigger analysis).

**What this section does NOT cover (out of scope for #13):**

- Notification channel choice (WhatsApp / SMS / push) — product decision, deferred.
- **Multiple parallel invites for the same slot** — deferred per Phase B revision. Spec assumes serial invites at launch (one active `SENT` per supervisor per absence). Locking parallel-invite semantics is deferred until product explicitly asks.
- Real-time supervisor UI during 2-min wait — design decision, not contract.
- ON SHIFT candidate accepting + auto-emitting a swap/handoff decision — forward-coupling, separate spec when `propose_swap` / `propose_shift_handoff` are designed.
- When `parentDecisionId` is set and the invite expires, does the parent `DecisionWorkspaceItem` get a `SYSTEM`-source follow-on decision row? **This is a follow-on effect, NOT part of `ReplacementInvite`'s core entity** (per advisor caution). Resolution deferred to whichever spec owns SYSTEM-source decision triggers.

### 2.9 HR Updates: digest pattern (parent + child rule entries)

**Resolved per Phase B revision 2026-05-12, contradiction #12 path A.**

R6's HR Updates surface (`updates.jsx`) supports a **compliance digest** pattern: HR can post a bundle of N related rules (R6 demo: "5 RULES IN THIS SWEEP") that the supervisor acknowledges with a single 5+ word ack. This section specifies the schema shape that supports digest grouping while preserving per-rule auditability.

**Critical principle (per advisor caution 2026-05-12):** child rule entries are individually addressable, queryable, and audit-traceable. They are NOT collapsed into an opaque JSON blob. One ack on the parent covers all children, but each child remains a first-class row.

**Minimum shape (full HR Updates spec deferred — this section locks only the digest shape that unblocks the spec):**

```
HRUpdate                                      HRUpdateRule
  id              UUID PK                       id              UUID PK
  companyId       UUID FK Company               companyId       UUID FK Company
  postedAt        TIMESTAMPTZ                   hrUpdateId      UUID FK HRUpdate
  title           TEXT                          order           INT (1, 2, 3, ...)
  body            TEXT nullable                 title           TEXT
  ackRequired     BOOLEAN default true          body            TEXT
  ackedAt         TIMESTAMPTZ nullable          createdAt       TIMESTAMPTZ
  ackText         TEXT nullable
  createdAt       TIMESTAMPTZ
```

(Other HR-specific fields — supervisor/audience scoping, channel, severity, etc. — are owed to the future HR Updates spec.)

**Illustrative indexes:**

- `HRUpdate(companyId, postedAt DESC)` — supervisor inbox
- `HRUpdate(companyId, ackedAt) WHERE ackedAt IS NULL` — pending ack list
- `HRUpdateRule(hrUpdateId, order)` — fetch a digest's rules in order
- `HRUpdateRule(companyId, hrUpdateId)` — tenant-scoped per-rule lookups

**Semantics (three shapes for HRUpdate):**

| HRUpdate shape                                                          | Meaning                                                                                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `body` populated, **no** child `HRUpdateRule` rows                      | **Standalone update** — the single rule lives entirely in `body`. R6 renders without the digest list. Per Phase B pick: `body`-only.                  |
| `body` may be NULL (or hold a summary), **N** child `HRUpdateRule` rows | **Digest** — N rules grouped. R6 renders the "N RULES IN THIS SWEEP" header + expandable per-rule list. Single parent ack covers all children.        |
| `body` populated **AND** N children                                     | **Digest with summary** — `body` is the digest-level summary; children carry the rule detail. Supported. Single parent ack still covers all children. |

**Ack flow (consistent with #6 parallel ack resolution):**

- Supervisor submits ack via `POST /hr-updates/:id/ack` with an `ackText` body (5+ word validation, per `updates.jsx`).
- Single tx: set `HRUpdate.ackedAt = now()`, `HRUpdate.ackText = $ackText`. Write `AuditEvent(kind = 'HR_UPDATE_ACKED')` linking the parent `HRUpdate`.
- **All child `HRUpdateRule` rows are considered acked** by virtue of their parent's `ackedAt`. No per-child ack flag — computed: a child is acked iff `parent.ackedAt IS NOT NULL`.
- No `DecisionWorkspaceItem` state transition (HR is direct-APPLIED per #6).

**Immutability (per Phase B revision pick — append-only):**

- `HRUpdate` and `HRUpdateRule` rows are **append-only** after creation. HR cannot mutate a rule's `title` or `body` after posting.
- If HR needs to "retract" or "correct" a rule, they post a new HRUpdate (or new digest) that supersedes the old one. The old HRUpdate remains in audit history with its original `ackedAt` (if acked) preserved.
- No `updatedAt` field needed. Subsequent changes to a row are limited to `ackedAt + ackText` on the parent `HRUpdate` only — and once set, those are not changed.

**Audit story:**

- Per-rule referenceable: `HRUpdateRule.id` is a stable identifier.
- Compliance query "did supervisor see rule #3 of digest D?" → `SELECT * FROM HRUpdateRule WHERE hrUpdateId = D AND order = 3`; check parent's `HRUpdate.ackedAt IS NOT NULL`.
- Cross-rule queries: standard SQL on `HRUpdateRule`, indexable.
- No JSONB path queries needed.

**Audit-event kinds (proposed; full enum locked in HR Updates spec):**

- `HR_UPDATE_POSTED` — fired when an `HRUpdate` (with or without children) is created
- `HR_UPDATE_ACKED` — fired when supervisor acks (per #6 resolution)
- `HR_UPDATE_RULE_VIEWED` (optional, deferred) — if per-rule "did supervisor expand rule X" granularity becomes a compliance requirement

**Path 1 trigger risk: none.** This addition stays entirely in the HR sub-schema. `DecisionWorkspaceItem` is untouched. No new actor types, no lifecycle complexity added to existing entities.

**How this unblocks #11 (HR Updates 5+ word prose ack):**

The HR Updates spec (referenced by #6 as "not yet written") now has clear inputs:

- `HRUpdate` is the ackable unit, with optional child `HRUpdateRule` rows.
- `ackedAt + ackText` live on `HRUpdate` and cover all children.
- The ack route validates 5+ word prose (per `updates.jsx` UX).
- Audit-event kinds and routes can now be specified without ambiguity about digest shape.

The full HR Updates spec remains owed but is no longer blocked by the digest shape question.

**What this section does NOT cover (out of scope for #12):**

- **Mixed-tier digests** (e.g., 4 OPERATIONAL rules + 1 EMPLOYMENT rule): three viable resolutions exist (forbid mixing, escalate ack tier to highest, per-rule ack). **Deferred to the future HR Updates spec** — not a contract decision the digest shape alone can make.
- **Notification fan-out** (one push per digest vs per-rule vs combined) — product/UX decision; out of scope.
- **Per-rule "viewed" tracking** — deferred until compliance requirement is explicit.
- **Max rules per digest** — no schema constraint at launch. R6 demo shows 5; real HR posts may be 10+.
- **Mutation/retraction flows** — append-only at launch. New posts supersede; old posts remain in audit history.

### 2.10 Note-tier visibility (`noteKind`)

**Resolved per Phase B revision 2026-05-12, contradiction #9 path A.**

R6's note-tier decision flow ([`shell.jsx:226-251`](../prototypes/supervisor-mobile-r6/project/src/shell.jsx), the WHERE TO SAVE picker) captures a privacy/visibility distinction with two named kinds:

- **Site rule** — "Visible to client if asked"
- **My working note** — "Private; auto-scrub"

This section locks the schema shape that supports the distinction, plus visibility and audit-payload semantics. Retention timing and client-portal export consumers are explicitly deferred.

**Critical principle (per advisor bias 2026-05-12):** the distinction is captured as a **typed first-class column** (see §2.3 `noteKind` row), NOT a boolean and NOT a JSONB payload field. Visibility filters are a hot path; typed enum supports indexing, validation, and audit clarity.

**Enum definition:**

```
enum NoteKind {
  SITE_RULE     // Company-shared; client may see it on request
  WORKING_NOTE  // Supervisor-private
}
```

**Visibility semantics:**

| `noteKind`     | Read scope (within `companyId`)                                    | Client-facing exports (when client-portal lands; deferred)      |
| -------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `SITE_RULE`    | Supervisor (any) + Owner + HR                                      | **Yes** — included in client-facing digests and audit responses |
| `WORKING_NOTE` | The supervisor who created it ONLY (`supervisorId = $auth.userId`) | **No** — excluded from any client-facing export, always         |

**Read API filtering (illustrative — locked when read APIs are designed):**

- `GET /decisions?supervisor=me`: all SITE_RULE notes in scope + supervisor's own WORKING_NOTE notes
- Owner-view (admin web): SITE_RULE notes only for `tier=note` rows
- Future client-portal export: SITE_RULE notes only (deferred — no consumer at launch)

**Default `noteKind` from chat AI extraction (per Phase B pick):**

**`WORKING_NOTE` is the default.** If a supervisor's chat utterance creates a note-tier decision without explicit `noteKind` specification, the AI tool surface (`propose_note` or equivalent) defaults to `WORKING_NOTE`. Supervisor can change to `SITE_RULE` via the R6 WHERE TO SAVE picker before tapping Apply.

Rationale: privacy-safe default. Mis-defaulting `WORKING_NOTE → SITE_RULE` leaks supervisor-private content to client surfaces; the reverse (mis-defaulting to `WORKING_NOTE` when supervisor meant `SITE_RULE`) is recoverable — supervisor just hasn't set `SITE_RULE` yet and can re-create the note correctly.

**Immutability after `APPLIED` (per Phase B pick):**

Once `status = APPLIED`, `noteKind` is **immutable**. Compliance reasoning:

- Visibility decisions on applied data have legal/audit implications. Changing `noteKind` post-apply means previously-private content could retroactively become client-visible (or vice versa) — both are unacceptable.
- If a supervisor mis-tagged at apply time (e.g., picked `SITE_RULE` when they meant `WORKING_NOTE`), they must `DISMISS` the existing decision and create a new one with the correct kind. The old `APPLIED` row stays in audit history with its original kind.
- Route handlers MUST reject `noteKind` mutations on rows with `status = APPLIED` (typed failure: `INVALID_STATE_TRANSITION`).

**Audit-event payload sanitization (companion rule):**

When `AuditEvent` rows are written for note-tier decisions, payload content differs by `noteKind`:

| `noteKind`     | AuditEvent payload                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `SITE_RULE`    | Full body included — content is company-shared anyway                                                          |
| `WORKING_NOTE` | Body EXCLUDED; only metadata (`kind`, `supervisorId`, `timestamp`) preserved. Body never enters the audit log. |

This sanitization rule lives in the AuditEvent writer for note-tier decisions. Spec captures the rule; implementation defers.

**Path 1 trigger risk: none.** This is a typed-column addition. No new entity, no new state machine, no lifecycle change. `DecisionWorkspaceItem` core shape untouched apart from one nullable column + one partial index.

**What this section does NOT cover (out of scope for #9):**

- **Retention/scrub timing** — when (if ever) `WORKING_NOTE` bodies get redacted from storage. R6's "Private; auto-scrub" UI label is aspirational at launch. Actual redaction window is a future retention-policy decision. **Deferred per Phase B revision pick.** Launch behavior: `WORKING_NOTE` is private indefinitely.
- **Client-portal read consumer** — the surface that consumes SITE_RULE exports doesn't exist at launch. Visibility scope is defined here; the export endpoint waits for client-portal design. **Deferred per Phase B revision pick.**
- **Cross-supervisor visibility nuances within a company** — at launch, `SITE_RULE` is company-shared. Sub-tenant / team-level scoping (e.g., "only supervisors in the Apollo region see this site rule") is a separate concern.
- **AI tool surface for note creation** — the `propose_note` (or equivalent) tool needs a `noteKind` parameter wired through `openaiToolLoop`. Tool definition is part of the chat tool inventory work, not this lock.

### 2.11 Option-picker decisions (`needsReview`)

**Resolved per Phase B revision 2026-05-12, contradiction #2 path A.**

R6's Decisions Workspace ([`decisions.jsx`](../prototypes/supervisor-mobile-r6/project/src/decisions.jsx)) renders an **option-picker** UI for decisions that need supervisor disambiguation — e.g., "Mukundan or Mukesh — which to terminate?" The supervisor picks one of N options instead of tapping a single Apply button. R6 treated this as a 5th tier (`review_required`); this section keeps the 4-tier enum (`NOTE / OPERATIONAL / PERSONNEL / EMPLOYMENT`) and adds a separate boolean signal `needsReview`.

**Critical principle:** `tier` captures policy severity. `needsReview` captures resolution mode. They are **orthogonal concepts** and BOTH must be present on a row that needs option-picking.

**Schema field:** see §2.3 — `needsReview: BOOLEAN default false`.

**When `needsReview = true`:**

1. **`payload.options[]` MUST be populated.** Minimum 2 options, each shaped `{id: string, label: string, subPayload?: JSON}`. The `subPayload` carries the actual decision data if this option is picked (e.g., for "Mukundan or Mukesh," each option's `subPayload.workerId` differs).
2. **`tier` MUST be populated** (the AI extraction emits both `tier` and `needsReview`, never one without the other). UI renders the `TierChip` from `tier` and the option-picker behavior from `needsReview`. R6's `TIER_STYLES.review_required` entry remains a UI-rendering convenience (border/background tinting), computed client-side from `needsReview = true`, NOT a backend tier value.
3. **`ackRequired` MUST be `false`.** Mutual exclusivity with the ack flow (typed-phrase ack or typed-prose ack) — see below.

**Mutual exclusivity with `ackRequired` (per Phase B pick):**

A decision row may have EXACTLY ONE of:

- `ackRequired = true` (typed-phrase EMPLOYMENT ack OR typed-prose HR ack per #6)
- `needsReview = true` (option-picker flow per this section)
- Neither (default — single Apply button)

A row MUST NOT have BOTH `ackRequired = true` AND `needsReview = true` at launch. Schema enforcement: a CHECK constraint or app-layer guard rejects writes that violate the invariant.

If a genuinely-ambiguous EMPLOYMENT-tier decision arises (e.g., "Mukundan or Mukesh — terminate one"), the AI MUST emit **two separate decisions**: first a `needsReview = true` row for the disambiguation pick, then — after the pick is applied — a second `ackRequired = true` row for the typed-phrase termination ack. The two-step UX is honest about the policy severity.

**Immutability (per Phase B pick):**

Once a row is written with `needsReview = true`, the flag is **immutable** — it cannot be flipped to `false` on an existing row. If AI mis-extracted (emitted `needsReview = true` when no real ambiguity exists), the supervisor dismisses and re-chats. The original row stays in audit history with its `DISMISSED` status.

**AI extraction rule (per Phase B pick — always emit `tier`):**

When chat AI emits a `propose_*` tool call that the extraction layer determines needs disambiguation, the resulting `DecisionWorkspaceItem` row has BOTH:

- `tier` populated per policy severity (NOTE/OPERATIONAL/PERSONNEL/EMPLOYMENT)
- `needsReview = true`
- `payload.options[]` populated

The AI tool surface (e.g., a future `propose_disambiguate_*` parameter) must require all three. Extraction validation rejects any `needsReview = true` payload missing options[] or tier.

**Decisions Workspace urgency grouping (per R6 r5 lock, restated cleanly):**

```
URGENT  ("NEEDS YOU NOW"):  tier = 'EMPLOYMENT' OR needsReview = true
ROUTINE                  :  status = 'PROPOSED' AND NOT urgent
FAILED                   :  status = 'FAILED'
```

R6's grouping condition (`tier === 'employment' || tier === 'review_required'`) becomes `tier === 'EMPLOYMENT' || needsReview === true` after this resolution lands. Same set; cleaner condition.

**Apply route behavior:**

`POST /decisions/:id/apply` accepts a `chosenOptionId` body parameter (required ONLY when `needsReview = true`). Route handler:

1. Loads the decision row.
2. If `needsReview = true` AND `chosenOptionId` is missing → reject with `BAD_INPUT`.
3. If `needsReview = true` AND `chosenOptionId` does not match any `payload.options[].id` → reject with `INVALID_OPTION_ID` (new failure reason, added to the typed enum).
4. Look up the matching option's `subPayload`; use it as the domain-write input.
5. Standard transition: `PROPOSED → APPLIED`. Writes the domain row using `subPayload` (or `payload` directly if `needsReview = false`).
6. **Idempotency:** if supervisor re-submits the same `chosenOptionId` after success, route observes `status = APPLIED` and returns the cached success.

**Path 1 trigger risk: none.** One boolean column + a payload validation rule + one new failure-reason enum value (`INVALID_OPTION_ID`). No new entity, no state machine change, no actor model shift.

**What this section does NOT cover (out of scope for #2):**

- **Unifying `ackRequired` into a `resolutionMode` enum** — Option B from the resolution plan. If resolution modes proliferate post-launch (sequential ack, threshold-reached, multi-step), revisit as a separate refactor.
- **`payload.options[]` strict schema validation** beyond minimum (≥2 options, each with `id + label + optional subPayload`) — implementation enforces.
- **AI tool surface** for emitting `needsReview` decisions (specific tool definitions like `propose_disambiguate_worker`) — part of the chat tool inventory work, not this lock.
- **Sequential `needsReview → ackRequired` flow** for ambiguous EMPLOYMENT cases — described as a HOW above; the actual state-machine sequencing/automation is a future spec.

## 3. Acceptance criteria (from external advisor review, 2026-05-12)

Path 2 is acceptable ONLY if all 5 hold:

| #   | Criterion                                                                         | How this spec satisfies it                                                                        |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | One query powers Decisions Workspace                                              | `GET /decisions` returns `DecisionWorkspaceItem` rows directly; no fan-in across multiple sources |
| 2   | apply / dismiss / fail / undo update the workspace row transactionally            | Every writer (§2.5) wraps row + domain mutation in single Prisma tx                               |
| 3   | Non-chat sources can also write rows                                              | `sourceKind` enum includes `HR`, `SYSTEM`, `MANUAL` at launch; not chat-only                      |
| 4   | Activity can join against this row cleanly                                        | `(companyId, targetType, targetId)` index supports the join; AuditEvent already keyed by these    |
| 5   | Explicitly documented as launch decision surface, even if chat remains one source | This spec is that documentation. Status: Active once approved.                                    |

## 4. Trigger conditions to switch from Path 2 to Path 1 (from external advisor)

Migration from Path 2 to Path 1 (full `SupervisorDecision` spine, deprecating `DecisionWorkspaceItem`) becomes a forced move IF any of:

1. **More than a few non-chat writers before launch.** Current launch plan has 4 writers (chat / hr / system / manual). If pre-launch scope adds a 5th distinct writer kind, re-evaluate. (Reason: projection-flavoured tables degrade once you have 5+ sources with diverging payload shapes.)
2. **Decision lifecycle starts owning real business logic rather than reflecting it.** If supervisors can edit a `DecisionWorkspaceItem` row's `kind` or `targetId` post-creation, the row is no longer a projection — it's the spine. Migrate.
3. **Undo/retry/expiry complicated enough that projection rows stop being trustworthy.** Specifically: if undo requires reversing a chain of 3+ dependent decisions, or retry requires re-running through state transitions, the projection model breaks down.
4. **Cross-surface decision identity beyond launch.** If decisions need to be referenced from billing, owner mobile, HR portal, or compliance audit such that the `DecisionWorkspaceItem.id` becomes a primary external identifier, promote it to spine.

**Each trigger has an explicit migration path documented in `appendix:path-1-migration` (to be added when first trigger fires).**

## 5. Implementation phases

Each phase is its own plan-mode + panel + execution cycle per `feedback_plan_mode_for_medium_major_changes`. Spec only locks the architecture; phases ship the code.

| Phase                                                  | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Estimate | Gates                                                                                                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1 — Schema migration**                              | Add `DecisionWorkspaceItem` table + indexes + Zod schemas in `@axhy/shared-schema`. Add state machine in `packages/state-machines/src/decision-workspace-item.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 1-2 days | Migration safety CI; cross-tenant test                                                                                                                                           |
| **P2 — Two-stage chat flow**                           | (a) **Extraction stage:** `openaiToolLoop` post-processing in `POST /chat/messages` writes `DecisionWorkspaceItem` rows (status=`PROPOSED`) when AI emits `propose_*` tool results — landing `PROPOSED` rows BEFORE the supervisor acts, so Decisions Workspace has something to render. (b) **Transition routes:** `POST /decisions/:id/apply` transitions `PROPOSED → APPLIED` in one tx (row + domain row + AuditEvent); `POST /decisions/:id/dismiss` transitions `PROPOSED → DISMISSED`. Existing `POST /chat/apply` is semantically replaced (route alias preserved for migration). Per §2.6, chat surface shows a "Review N decisions →" backlink to the Workspace, NOT inline cards. 6 apply kinds wired: `mark-absent`, `leave`, `swap`, `termination`, `create-assignment`, `living-doc-update`. | 2-3 days | Extraction test (PROPOSED rows land); existing chat-apply tests adapted to new route; cross-tenant DecisionWorkspaceItem isolation; chat surface shows backlink not inline cards |
| **P3 — Read APIs**                                     | `GET /decisions`, `GET /activity`, supervisor pulse aggregation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 1 day    | Pagination tested; auth-context isolation enforced                                                                                                                               |
| **P4 — Undo handlers (simplified per panel critique)** | `POST /decisions/:id/undo` for each of the 5 apply kinds. **30-minute window enforced at route level by comparing `now() - appliedAt`** — no `undoableUntil` field, no undo-specific cron. Reversal handler runs in same tx as row update. Cron only sweeps `PROPOSED → EXPIRED` (TTL default 24h).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 1 day    | Reversal tested for each kind; route correctly rejects undos past 30min from `appliedAt` with typed error; idempotency on retry; cron sweeps PROPOSED only                       |
| **P5 — Non-chat writers**                              | `POST /supervisor/bulk-mark-absent` (manual). HR-update path extended to write `DecisionWorkspaceItem`. System emission stub (gated on Visit lock #2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 1 day    | Each source-kind round-trip tested                                                                                                                                               |

**Total: ~6-8 days OPTIMISTIC, not generous.** Advisor flagged this as tight in the 2026-05-12 pressure-test review; panel critique on the same day simplified undo (P4 dropped from 1-2 days to 1 day by removing the `undoableUntil` field and undo cron). Scope includes: new table + migration, state machine, **two-stage chat flow with extraction-time `PROPOSED` creation**, apply/dismiss/fail/undo transitions, 5 undo handlers, read APIs, manual/HR/system writers, EMPLOYMENT-tier ack flow. Hits 6-8 days only if scope stays brutally tight. **Plan for 9-11 days with buffer** when scheduling; treat 6-8 as the floor, not the expected.

## 6. What this lock unblocks

Per the 8-lock contract list from 2026-05-12 review:

| Lock # | Lock                       | Effect of this spec                                                                                                                                                                                                                                                                                                                             |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1     | Decision entity model      | **LOCKED by this spec**                                                                                                                                                                                                                                                                                                                         |
| #2     | Visit alive or dormant     | Easier: if Visit is alive, `SYSTEM` writers fire on Visit transitions; if dormant, `SYSTEM` writers shrink to cost-cap and worker no-show only                                                                                                                                                                                                  |
| #3     | Attendance writer set      | Significantly easier: writer set is explicit per `sourceKind` (`CHAT`, `MANUAL`, optionally `SYSTEM`) — no longer ambiguous                                                                                                                                                                                                                     |
| #4     | Conflict semantics         | Resolved: `failureReason` enum on `DecisionWorkspaceItem.status=FAILED` is the typed conflict signal. No `REVIEW_REQUIRED` umbrella needed.                                                                                                                                                                                                     |
| #5     | Cost cap reconciliation    | Independent — not unblocked by this lock                                                                                                                                                                                                                                                                                                        |
| #6     | Membership.delegated       | **CUT** per founder-lock 2026-05-08 (backup-supervisor mode removed in R6 — see `docs/prototypes/supervisor-mobile-r6/project/src/shell.jsx:443-445`). Workaround: account-sharing; audit log records account holder. Active lock list reduces from 8 to 7 (#1–#5, #7, #8). Resolved per Phase B revision 2026-05-12 (contradiction #7 path A). |
| #7     | Undo contract              | **Substantially specified by §2.5 + Phase 4 above.** Per-kind reversal handlers + 5-min window + `UNDONE` state. Standalone spec polish only.                                                                                                                                                                                                   |
| #8     | LeaveRequest state machine | Independent in terms of LeaveRequest's own state machine, but cleaner because LeaveRequest is now a `targetType` of `DecisionWorkspaceItem`                                                                                                                                                                                                     |

**Net unblock: 5 of 6 active downstream locks become trivially easier or near-specified** (post-#6 cut). Cost cap (#5) is the only remaining independent spec. Membership.delegated (was #6) cut per founder-lock 2026-05-08; the 8-lock list reduces to 7 active locks.

## 7. Open questions for panel pressure-test

Mark these explicitly so the advisor's review can attack them, not me.

1. **Why a new table instead of repurposing `SupervisorDecision`?** Answer: schema comment on `SupervisorDecision` says it's a placeholder for chat-extracted decisions only. Renaming/widening it would either lose semantics or require deleting and re-creating. New table with clear lifecycle intent is honest. `SupervisorDecision` is **deprecated as of this spec being approved**; whether it is `DROP`ed, repurposed (e.g. as a view), or migrated will be an explicit Phase P1 implementation decision documented in that phase's plan-mode plan — NOT a casual side-effect of this spec. Until then, `SupervisorDecision` remains in the schema untouched.
2. **What if a decision needs to reference multiple domain rows?** (E.g., a SWAP creates two new Assignments + cancels one.) Answer: `targetId` is nullable and singular. For multi-target decisions, store an array in `payload` and accept that `targetId` may point at the "primary" row only. If multi-target becomes common (>20% of decisions), promote to Path 1.
3. **Is `batchId` enough for compound utterances, or do we need a parent-Decision row?** Answer: `batchId` is enough for launch (groups for UI rendering). If post-launch we need batch-level lifecycle (e.g., "undo whole batch"), promote to Path 1.
4. **What happens when `sourceKind=SYSTEM` and supervisor never sees it?** Answer: cron sweeps `PROPOSED` to `EXPIRED` after 24h. System-proposed decisions that go unread expire silently and AuditEvent records the expiry. Acceptable for launch.
5. **What's the migration story if Path 1 trigger fires post-launch?** Answer: `DecisionWorkspaceItem` rows become `SupervisorDecision` rows via a rename + schema rewrite. Writer side rewrites to write Decision first, then domain. Read APIs unchanged (just point at new table). Estimated ~2 weeks of migration when triggered.
6. **What happens when AI emits competing propose calls in one batch?** (E.g., `propose_create_assignment` for Pradeep AND `propose_create_assignment` for Arjun, both targeting the same shift.) Answer: not currently addressed by the spec. Current AI tool-use loop emits one propose per detected need, so this is theoretical at v3.0. If the AI behaviour changes to emit competing proposals, dedup policy needs definition: (a) render both and let the supervisor pick — the other becomes `DISMISSED` on apply, or (b) AI picks upstream and only one propose call lands. Acceptable to defer; explicitly marked as known not-yet-true so panel + advisor know this is unresolved. (Surfaced by Aanya panel critique, 2026-05-12.)

## 8. Rollback path

This spec is a DRAFT. Rollback = delete this file. No code, schema, or migration touched yet.

After spec is locked (Status: Active) and Phase P1 ships:

- Rollback Phase P1 alone: revert migration, drop table.
- Rollback the spec lock: re-open the architectural decision in a new spec; mark this one Superseded; remove `DecisionWorkspaceItem` writer paths from any phases that landed.

## 9. Cross-references

- Doc discipline protocol: `docs/protocols/doc-discipline.md` (§9 for header, §15 for language)
- Canonical truth index: `docs/index/canonical-truth.md` (entry must be added when this spec flips to Active)
- r3 supervisor design: `docs/specs/2026-05-11-supervisor-mobile-r3-design.md` (Active; provides the UI surfaces this spec backs)
- Wave 4b chat-completion plan: `docs/plans/2026-05-10-phase-c-wave-4b-chat-completion.md` (Active but contract-incomplete; Phases 3+4 are superseded by this lock + downstream Phase D locks)
- ADR-0006 (XState v5): governs the `DecisionWorkspaceItem` machine implementation
- Advisory review 2026-05-11 (`project_wave_4b_advisory_review.md` in memory): the typed `failureReason` enum reused here

## 10. Approval gate

This spec flips Status: Draft → Status: Active only after:

1. External advisor pressure-test review (forwarded by founder)
2. Internal panel critique (Maya / Eric / Naina / Vikram / Aanya at minimum)
3. Founder explicit approval

Until then, no Phase P1 implementation. No schema migration. No code.
