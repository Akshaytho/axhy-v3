# Phase C — Spec 2: AI chat + LivingDoc + Assignment hydrator

> **Status:** DRAFT for founder review
> **Date:** 2026-05-09
> **Sequence:** Spec 2 of 3 in Phase C (Spec 1 = Assignment primitive ✅ Wave 1 shipped, Spec 3 = Mobile UI)
> **Depends on:** Wave 1 (PR #2, 66/66 tests, CalendarEntry + 4 routes + 20-tool surface contract)
> **Authors:** Akshay (founder) + panel debate (2026-05-09 session)

> **How to give async feedback:** anywhere in this doc, leave `> FOUNDER NOTE: …` lines. Save and push (or commit on GitHub mobile/web). I integrate next session.

---

## TL;DR (lock from your phone in 30 seconds)

1. **Hardened-sync chat loop**: `POST /chat/messages` runs the full Anthropic tool-use loop server-side, returns DecisionCard. Mandatory `Idempotency-Key` header for retry safety on flaky Indian networks. 10s server timeout. Client retries with same key on network failure.
2. **One ChatThread per supervisor, forever** (WhatsApp-style). All messages append. 90-day hot retention, 1-year cold archive for state-changing messages.
3. **LivingDoc restructure** (existing `SupervisorDailyContext` → `LivingDoc`) with 5 JSON sections + each rule has a `state` field (`PENDING`/`ACTIVE`/`REJECTED`/`EXPIRED`). Explicit rules captured immediately via `propose_living_doc_update` tool (15th propose\_\*); inferred patterns written into LivingDoc with `state='PENDING'` via nightly nano-tier cron, supervisor reviews each morning.
4. **Assignment table created + hydrator runs** to convert Wave 1's deferred `pendingAssignmentPayload` into real Assignment rows. Trigger `block_past_assignment_update` attached.
5. **Prompt cache 3-tier strategy** — tools (1h) + per-supervisor LivingDoc (1h) + recent context (5min) — saves ~70% input tokens.
6. **Per-tenant daily AI cost ceiling** — soft warn ₹3000, hard cap ₹5000 → 429 with friendly copy.
7. **Schema grows: 22 → 25 tables.** Adds Assignment, ChatRequestLog, ChatThread, ChatMessage. Each justified by real scenarios. **LivingDocProposal merged into LivingDoc** as a `state` field on each rule (panel-locked 2026-05-09 — same concept, different state, single retention).
8. **AI-impact-analyzer (Claude grep+reason) is the v3 default** for cross-file change tracking — empirical 93% accuracy on hard scenario. Connectedness Map deferred to Phase D.
9. **No streaming, no WebSocket, no Outbox-driven chat** — all explicitly rejected for v3.0; revisit in Phase D pilot data.

---

## 1. Why this spec exists

Wave 1 shipped the soft-state Calendar primitive — supervisors can save tentative plans, AI tools are schema-defined. The MISSING half: there's no AI yet. Mukesh can't actually voice his plans because no chat endpoint runs Anthropic.

Wave 2 wires the AI side. Specifically:

- **The Anthropic tool-use loop** that takes voice → text → Claude → tool call → backend route → DecisionCard return.
- **Chat history** so Mukesh can scroll back to "what did I tell AI Tuesday?"
- **LivingDoc** so AI knows Mukesh's per-supervisor context (rules, sitePrefs, aliases, recentDecisions) and gets smarter over time.
- **The Assignment table itself** (deferred from Wave 1) + the hydrator that converts Wave 1's pending payloads into real rows.
- **Cost ceilings** so a runaway tenant can't blow past pricing-cap limits.

After Wave 2: vignettes 1, 2, 3, 5, 6 from Vision Narrative work end-to-end with AI involvement (vignette 4 = visit correction needs Wave 3 visit-correction route; vignette 7 = end-of-day summary lands in Wave 2's nightly cron).

**Wave 2 does NOT include:**

- Visit materialization cron (Wave 3 — though Spec 1 §5 designed it)
- Mobile UI rendering of DecisionCards (Wave 4)
- Outbox handlers swapping from stubs to real Gupshup / payroll / R2 (Phase D)

---

## 2. What ships (locks summary)

| #          | Lock                                                                                                                                                                                                                                                                                                                                                                                  | Source                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Q1         | Hardened-sync `POST /chat/messages` + mandatory `Idempotency-Key` + 10s server timeout + client retry-with-key + optimistic mobile UI. NO streaming, NO WebSocket, NO Outbox. New table: `ChatRequestLog` (idempotency dedup).                                                                                                                                                        | Q1 round-2 panel debate             |
| Q2         | One ChatThread per supervisor (lifetime). ChatMessage append-only. 90-day hot, 1-year cold archive for state-changing (non-null toolCalls). NO topic clustering, NO daily threads. PII-bearing fields scrubbed on supervisor erasure.                                                                                                                                                 | Q2 panel debate                     |
| Q3         | LivingDoc restructure (rename `SupervisorDailyContext` → `LivingDoc`, 5 JSON sections per master plan §G.6). Explicit rules captured immediately via `propose_living_doc_update` tool (15th propose\_\*). Inferred patterns via nightly nano-tier cron, written into LivingDoc with `state='PENDING'` for morning supervisor review (no separate proposal table — merged 2026-05-09). | Q3 panel debate + table-count panel |
| Q4         | Assignment table created per Spec 1 §3.2. `block_past_assignment_update` trigger attached. One-time hydrator script converts Wave 1's `pendingAssignmentPayload` JSON → real Assignment rows + updates `CalendarEntry.promotedToId` from synth IDs to real Assignment IDs.                                                                                                            | Q4 batched lock                     |
| Q5         | Prompt cache 3-tier: tier 1 = tool schemas + system instructions (1h); tier 2 = per-supervisor LivingDoc + aliases (1h); tier 3 = last 30-day Calendar + last 10 ChatMessages (5min). Saves ~70% input tokens.                                                                                                                                                                        | Q5 batched lock                     |
| Q6         | Per-tenant daily AI cost ceiling: soft warn ₹3000 (Slack alert), hard cap ₹5000 (429 + Owner notification). New column `Company.aiSpendDailyInr`, midnight cron resets. ADR-0023 hard rule #2 enforced at gateway.                                                                                                                                                                    | Q6 batched lock                     |
| Discipline | AI-impact-analyzer (Claude grep+reason) is v3 default for cross-file change tracking. Empirical test: ~93% accuracy on enum-conversion scenario. PR template gains "concepts touched" line. Connectedness Map deferred to Phase D unless accuracy drops below 80%.                                                                                                                    | Empirical test + panel synthesis    |

---

## 3. Schema additions (22 → 25 tables)

The 6 buckets, updated:

```
people/      — User, Worker, Membership                                       (3 tables)
places/      — Client, Site, SiteShiftRequirement                             (3 tables)
work/        — Assignment ★, Visit, VisitPhoto, Attendance                    (4 tables)
decisions/   — ChangeRequest, Complaint                                       (2 tables)
chat/        — ChatThread ★, ChatMessage ★, ChatRequestLog ★, LivingDoc,
               CalendarEntry                                                  (5 tables)
infra/       — Company, AuditEvent, Outbox, Device                            (4 tables)
                                                                  total: 22 → 25 tables
                                                                  ★ = added in Wave 2
```

**Bucket integrity:** `chat/` grows to 5 tables (was almost 6 before LivingDocProposal was merged into LivingDoc). Each table has 1 distinct job. No further additions in Wave 2 without explicit founder approval.

**Table-count discipline (panel synthesis 2026-05-09):** AI cost does NOT grow linearly with table count (Tier 1 cache amortizes the schema in system prompt). AI accuracy depends on **conceptual distinctness, not count**. Decision framework:

- Same concept + different state + single retention = MERGE (e.g., LivingDoc + LivingDocProposal → state field on rule)
- Different lifecycle + different retention + future divergence = KEEP SEPARATE (e.g., ChatThread vs ChatMessage; ChatRequestLog vs ChatMessage)

### 3.1 Assignment (deferred from Wave 1, lands here)

Per Spec 1 §3.2 — schema unchanged from that lock. State machine: 3 states (DRAFT, ACTIVE, TERMINATED). dayMask 7-char Mon-Sun, validFrom/validUntil dates, Postgres trigger blocks past-Assignment edits.

```ts
model Assignment {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @db.Uuid
  workerId        String    @db.Uuid
  siteId          String    @db.Uuid
  shiftStart      String    // "HH:mm"
  shiftEnd        String    // "HH:mm"
  dayMask         String    // 7-char Mon-Sun
  validFrom       DateTime
  validUntil      DateTime?
  state           String    @default("DRAFT")
  terminatedReason String?
  terminatedBy    String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  worker  Worker  @relation(fields: [workerId], references: [id], onDelete: Cascade)
  site    Site    @relation(fields: [siteId], references: [id], onDelete: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, state])
  @@index([workerId, state])
  @@index([siteId, state])
  @@schema("axhy")
}
```

**Postgres trigger** (function defined in Wave 1, attached now):

```sql
CREATE TRIGGER assignment_block_past_update
  BEFORE UPDATE ON "axhy"."Assignment"
  FOR EACH ROW
  EXECUTE FUNCTION "axhy"."block_past_assignment_update"();
```

### 3.2 ChatThread

```ts
model ChatThread {
  id            String    @id @default(uuid()) @db.Uuid
  companyId     String    @db.Uuid
  supervisorId  String    @db.Uuid  // FK Membership
  createdAt     DateTime  @default(now())
  lastMessageAt DateTime?
  archivedAt    DateTime?

  company  Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  messages ChatMessage[]

  @@unique([companyId, supervisorId])  // one thread per supervisor per tenant
  @@schema("axhy")
}
```

### 3.3 ChatMessage

```ts
model ChatMessage {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @db.Uuid
  threadId        String    @db.Uuid
  role            String    // 'user' | 'assistant' | 'system'
  /// @personal supervisor's voice transcript or typed text
  transcript      String?
  /// @personal AI's response text (the chat-bubble copy)
  aiResponseText  String?
  toolCalls       Json?     // [{ toolName, toolCallId, input, output? }]
  decisionCard    Json?     // DecisionCardData per Spec 1 §9.5
  voiceConfidence String?   // 'HIGH'|'MEDIUM'|'LOW' from Sarvam
  modelUsed       String?   // 'claude-sonnet-4-6' etc
  costInr         Decimal?  // computed cost per ADR-0023 hard rule #4
  idempotencyKey  String?   // links back to ChatRequestLog
  createdAt       DateTime  @default(now())

  thread  ChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  company Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, threadId, createdAt])
  @@schema("axhy")
}
```

### 3.4 ChatRequestLog (idempotency dedup)

```ts
model ChatRequestLog {
  companyId       String    @db.Uuid
  /// Client-generated UUID; same key = same response, no Anthropic re-call
  idempotencyKey  String
  responseJson    Json      // cached final response shape
  chatMessageId   String?   @db.Uuid  // FK to message row created on first call
  createdAt       DateTime  @default(now())
  expiresAt       DateTime  // createdAt + 24h, then row-evictable

  @@id([companyId, idempotencyKey])
  @@index([expiresAt])  // for nightly eviction cron
  @@schema("axhy")
}
```

### 3.5 LivingDoc (renamed from SupervisorDailyContext)

```ts
model LivingDoc {
  id                String    @id @default(uuid()) @db.Uuid
  companyId         String    @db.Uuid
  supervisorId      String    @db.Uuid
  /// Each section is array of structured rules — see LivingDocRule type
  siteRules         Json      @default("[]")
  workerNotes       Json      @default("[]")
  clientPreferences Json      @default("[]")
  recurringTasks    Json      @default("[]")
  freeNotes         Json      @default("[]")
  /// Yesterday's snapshot for "what changed today" diffing
  lastArchivedAt    DateTime?
  archivedSnapshot  Json?
  updatedAt         DateTime  @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, supervisorId])
  @@schema("axhy")
}
```

`LivingDocRule` JSON shape (each item in any section array):

```ts
type LivingDocRule = {
  id: string; // uuid
  ruleText: string; // human-readable: "Sundeep is 5-10 min late on rainy days"
  description: string; // natural-language for AI consumption
  visibility: 'COMPANY' | 'SUPERVISOR_OWN' | 'WORKER_OWN';
  scope: { workerId?: string; siteId?: string; clientId?: string };
  createdAt: string; // ISO date
  createdBy: 'supervisor' | 'ai_inferred';
  /// Lifecycle state — replaces what would have been a separate LivingDocProposal table.
  /// PENDING = AI inferred this overnight, awaiting supervisor's morning review
  /// ACTIVE = supervisor confirmed (or supervisor wrote it directly)
  /// REJECTED = supervisor rejected on review (kept for audit + future training)
  /// EXPIRED = stale PENDING (>30 days); ignored by AI prompts
  state: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED';
  decidedAt?: string; // null until supervisor decides on a PENDING rule
  confidence?: number; // 0-1, only for ai_inferred
  source: { chatMessageId?: string; visitIds?: string[]; pattern?: string };
};
```

**Why state lives on the rule** (not a separate table): same concept, different state, single retention policy. Per panel decision framework — merge wins. AI prompt context filters by `state==='ACTIVE'`. Morning-review query flattens sections + filters `state==='PENDING'`. JSONB GIN index on the state field keeps this fast at scale.

### 3.6 ~~LivingDocProposal~~ — MERGED into LivingDoc

Originally proposed as a separate staging table. **Merged 2026-05-09** via panel decision framework into `LivingDocRule.state` field. Saves 1 table; clarifies that "rules" and "proposed rules" are the same concept at different lifecycle states. See §3.5 for the unified shape.

### 3.7 Migrations + hydrator

**Migration `20260510_phase_c_wave_2`** does (in order):

1. `CREATE TABLE Assignment` per §3.1
2. Attach trigger `assignment_block_past_update` per §3.1
3. `CREATE TABLE ChatThread`, `ChatMessage`, `ChatRequestLog` per §3.2-3.4 (LivingDocProposal removed via merge — state lives on rule)
4. `ALTER TABLE SupervisorDailyContext RENAME TO LivingDoc` (and re-add new JSON columns; data migration of any existing Phase B SupervisorDailyContext rows)
5. ALTER `Company` add column `aiSpendDailyInr Decimal @default(0)`

**Hydrator script** `apps/backend/scripts/hydrate-deferred-assignments.ts` — runs once after migration deploy:

```ts
// pseudocode
for entry in CalendarEntry where promotedToKind = 'ASSIGNMENT' AND pendingAssignmentPayload IS NOT NULL:
  const assignmentId = await prisma.assignment.create({ data: entry.pendingAssignmentPayload })
  await prisma.calendarEntry.update({
    where: { id: entry.id },
    data: { promotedToId: assignmentId, pendingAssignmentPayload: null }
  })
  // AuditEvent: kind=ASSIGNMENT_HYDRATED_FROM_CALENDAR
```

Deploy sequence:

1. Apply migration → schema changes
2. Run hydrator → deferred payloads become real rows
3. Deploy new backend code → `POST /calendar/:id/promote` writes real Assignment directly (no more deferred path)

If any step fails, rollback the migration. Standard release engineering.

---

## 4. The AI loop architecture

### 4.1 Hardened-sync flow (Q1 lock)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Mukesh on metro: taps mic, speaks                                       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ▼
                       ┌──────────── Mobile (RN) ─────────────┐
                       │ 1. Sarvam STT (or local cache)       │
                       │ 2. Generate idempotency UUID         │
                       │ 3. Render user's bubble immediately  │
                       │    (optimistic UI)                   │
                       │ 4. Render "thinking..." placeholder  │
                       └──────────────┬───────────────────────┘
                                      ▼  POST /chat/messages
                                          Idempotency-Key: <uuid>
                       ┌──────────── Backend ─────────────────┐
                       │ 5. Check ChatRequestLog              │
                       │    (return cached if dup)            │
                       │ 6. Check Company.aiSpendDailyInr     │
                       │    (429 if ≥ ₹5000)                  │
                       │ 7. Build prompt:                     │
                       │    [tier1: tools + system]           │
                       │    [tier2: LivingDoc + aliases]      │
                       │    [tier3: recent context]           │
                       │    [user message]                    │
                       │ 8. Anthropic tool-use loop:          │
                       │    - call Claude Sonnet 4.6          │
                       │    - if tool_use:                    │
                       │      - find_workers/find_sites:      │
                       │        execute server-side (read)    │
                       │      - propose_*:                    │
                       │        return as DecisionCard data,  │
                       │        DO NOT commit                 │
                       │      - update_living_doc:            │
                       │        return as DecisionCard,       │
                       │        DO NOT commit                 │
                       │    - continue until end_turn         │
                       │ 9. Atomic transaction:               │
                       │    - INSERT ChatThread (if first)    │
                       │    - INSERT ChatMessage (user)       │
                       │    - INSERT ChatMessage (assistant)  │
                       │    - INSERT ChatRequestLog (cache)   │
                       │    - INCREMENT Company.aiSpend       │
                       │    - INSERT AuditEvent               │
                       │ 10. Return JSON to client            │
                       └──────────────┬───────────────────────┘
                                      ▼
                       ┌──────────── Mobile (RN) ─────────────┐
                       │ 11. Replace "thinking..." with       │
                       │     DecisionCard rendered from JSON  │
                       │ 12. User taps "Apply" (separate UX)  │
                       └──────────────┬───────────────────────┘
                                      ▼ POST /chat/apply (separate flow)
                       │ 13. Execute the proposed tool calls  │
                       │     against the real backend routes  │
                       │ 14. Return success                   │
                       └──────────────────────────────────────┘
```

### 4.2 Idempotency contract

Every `POST /chat/messages` request:

- MUST include `Idempotency-Key: <uuid>` header (rejected with 400 if missing)
- Server checks `ChatRequestLog` for `(companyId, idempotencyKey)` — if found and not expired, returns cached `responseJson`
- Otherwise: executes the loop, writes to ChatRequestLog with TTL = 24h
- Eviction cron drops `ChatRequestLog` rows where `expiresAt < now()` daily

### 4.3 Server-side timeouts + concurrency

- Server timeout: 10s on the Fastify request
- Anthropic SDK timeout: 8s per call (within the 10s envelope)
- Per-instance concurrent chat limit: 50 (semaphore in `apps/backend/src/lib/chat-concurrency.ts`)
- 51st concurrent request returns `503 Retry-After: 5`

### 4.4 Client retry policy

- Network failure or 504 → retry with same Idempotency-Key
- 503 with Retry-After → retry after the suggested delay
- Backoff: 2s, 4s, 8s; max 3 retries
- Beyond 3: surface error UX with manual retry button

### 4.5 Tool execution split (master plan §76 lock)

| Tool category                                                                | Server-side behavior in chat loop                                        | Commit on supervisor's "Apply" tap                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| **Read tools** (`find_workers`, `find_sites`, `get_worker_status`, etc.)     | Execute server-side immediately; result fed back to Claude for next turn | N/A — already committed (read)                     |
| **Propose write tools** (`propose_create_assignment`, `propose_leave`, etc.) | Parse params; return as DecisionCard data; **DO NOT commit**             | YES — `POST /chat/apply` runs the underlying route |
| **`propose_living_doc_update`**                                              | Same as propose\_\*; return as confirmation card                         | YES — `POST /chat/apply` writes to LivingDoc       |

---

## 5. ChatThread model (Q2 lock detail)

- Auto-created on first message per `(companyId, supervisorId)` — no separate "create thread" flow
- ChatMessage append-only; no edit, no delete (audit-grade)
- Pagination via `GET /chat/messages?threadId=X&before=cursor&limit=50`
- Date-jump shortcut: `?before=YYYY-MM-DD`
- **No full-text search in v3.0** (Phase D upgrade if pilot demands)
- 90-day hot retention; older messages move to cold archive
- DPDP scrub on supervisor erasure: `transcript`, `aiResponseText` → `'[scrubbed]'`; structured data preserved (anonymized) for audit
- Voice raw audio NEVER stored (master plan §B.6 — deleted within 24h after STT)

---

## 6. LivingDoc + extraction policy (Q3 lock detail)

### 6.1 Two extraction paths

**Path A — Explicit rules (immediate via tool call)**

When supervisor utterance contains an explicit rule pattern ("remember X", "always do Y", "Sundeep tends to..."), Sonnet emits `propose_living_doc_update` AS PART OF its main response (no extra Sonnet call, same loop). DecisionCard shows the proposed rule. Supervisor taps Save → atomic write to LivingDoc + AuditEvent.

**Path B — Inferred patterns (nightly cron, nano-tier)**

Cron job at midnight per-tenant local time:

- Worker: `apps/backend/src/jobs/livingdoc-pattern-extractor.ts`
- Surface: `livingdoc_inferred_pattern` (new entry in ADR-0023 → `gpt-5.4-nano`)
- Input: yesterday's `ChatMessage` rows + `Visit` events for each supervisor
- Output: inferred patterns written into LivingDoc with `state='PENDING'` (one rule per pattern, in the relevant section based on scope)
- Supervisor sees "AI noticed 3 patterns. Review?" card on next morning login

### 6.2 New tool surface: `propose_living_doc_update`

Spec 1's 14 propose\_\* tools → 15 with this addition.

```ts
propose_living_doc_update(
  section: 'site_rules' | 'worker_notes' | 'client_preferences' | 'recurring_tasks' | 'free_notes',
  visibility: 'COMPANY' | 'SUPERVISOR_OWN' | 'WORKER_OWN',
  payload: {
    ruleText,                    // human-readable
    naturalLanguageDescription,  // for AI consumption
    scope: { workerId? | siteId? | clientId? }
  }
)
```

Routes to `POST /living-doc/rules`. Backend writes to the appropriate JSON section atomically + AuditEvent.

### 6.3 ACL on rules (master plan §G.6 lock)

- `COMPANY` — visible to HR, Owner, all Supervisors. Editable: HR + Owner only.
- `SUPERVISOR_OWN` — visible+editable to that supervisor only. AI uses for that supervisor's chat context.
- `WORKER_OWN` — visible to nobody directly; AI uses when answering questions ABOUT that worker.

---

## 7. Assignment hydrator (Q4 lock detail)

### 7.1 Sequence

1. Migration creates Assignment table + attaches trigger
2. Hydrator script reads CalendarEntry rows where:
   ```sql
   promotedToKind = 'ASSIGNMENT'
   AND pendingAssignmentPayload IS NOT NULL
   ```
3. For each row:
   ```ts
   const a = await prisma.assignment.create({
     data: row.pendingAssignmentPayload, // already shaped by mapCalendarPayloadToAssignment
   });
   await prisma.calendarEntry.update({
     where: { id: row.id },
     data: { promotedToId: a.id, pendingAssignmentPayload: null },
   });
   await recordAuditEvent({
     kind: 'ASSIGNMENT_HYDRATED_FROM_CALENDAR',
     targetId: a.id,
     payload: { sourceEntryId: row.id, originalSynthId: row.promotedToId },
   });
   ```
4. Once empty, all promotions write directly to Assignment (updated `POST /calendar/:id/promote` route logic)

### 7.2 Edge cases

- **Empty result set** (no deferred payloads): hydrator no-ops, exits clean
- **Hydrator fails midway**: AuditEvent shows progress; resume = re-run script (idempotent on `pendingAssignmentPayload IS NOT NULL` filter)
- **Old synth ID still referenced anywhere**: nothing references it externally (Wave 1 docs). Safe to discard.
- **`pendingAssignmentPayload` column** persists in schema as deprecated/ignored after hydration. Drop in Phase D when no historical writes possible.

### 7.3 Code changes from migration cascade

| File                                                                             | Change                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared-schema/prisma/schema.prisma`                                    | Add `Assignment` model; add `LivingDoc` rename + new sections (with `state` field on rules); add `ChatThread` + `ChatMessage` + `ChatRequestLog`. (LivingDocProposal removed via merge.) |
| `packages/shared-schema/prisma/migrations/20260510_phase_c_wave_2/migration.sql` | All schema changes + trigger attach + RENAME TABLE for LivingDoc                                                                                                                         |
| `apps/backend/src/routes/calendar.ts` (promote handler)                          | Replace `pendingAssignmentPayload + synthId` logic with real `prisma.assignment.create()`                                                                                                |
| `apps/backend/scripts/hydrate-deferred-assignments.ts`                           | NEW — one-time hydrator                                                                                                                                                                  |
| `apps/backend/test/calendar-promote.test.ts`                                     | Update assertions: real Assignment row exists; no more synth IDs                                                                                                                         |

---

## 8. Prompt cache 3-tier strategy (Q5 lock detail)

### 8.1 Tiers

| Tier                          | Content                                                                                | Cache key                                          | TTL    | Tokens (typical) |
| ----------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ------ | ---------------- |
| **1 — Stable global**         | All 15 propose\_\* + 6 read tool schemas + system instructions + persona-framing rules | `globalSystemHash` (computed from spec version)    | 1 hour | ~8,000           |
| **2 — Per-supervisor stable** | LivingDoc 5-section JSON + per-supervisor aliases                                      | `(companyId, supervisorId, livingDocVersion)`      | 1 hour | ~3,000-5,000     |
| **3 — Recent context**        | Last 30-day CalendarEntry + last 10 ChatMessages + today's Visit context               | `(companyId, supervisorId, lastNonTier3MessageId)` | 5 min  | ~6,000-10,000    |

Per Anthropic: cached input tokens cost ~10% of fresh. Tier 1+2 hits = ~80% of input is at 10% cost. **Net: ~70% input-token cost reduction.**

### 8.2 Cache invalidation triggers

- Tier 1: bump `globalSystemHash` constant on Spec edits (rare — one bump per spec PR)
- Tier 2: bump `livingDocVersion` on every successful `POST /living-doc/rules` (every supervisor confirmation)
- Tier 3: bump per ChatMessage write (auto-incremented `lastNonTier3MessageId`)

### 8.3 Cost dashboard

Per ADR-0023 hard rule #4: every AI invocation logs `model_used` + `costInr` to ChatMessage. Admin web dashboard (Spec 3 territory) aggregates: per-supervisor AI cost / day, cache-hit ratio, surface breakdown.

---

## 9. Per-tenant daily AI cost ceiling (Q6 lock detail)

### 9.1 Schema column

```prisma
model Company {
  // ... existing fields
  aiSpendDailyInr  Decimal @default(0)  // resets at midnight UTC via cron
  // ... existing relations
}
```

### 9.2 Gateway check

Every AI call (any surface) goes through `@axhy/ai-tools` policy resolver. The resolver:

1. Checks `Company.aiSpendDailyInr` against tier thresholds:
   - `< ₹3000` → proceed normally
   - `₹3000-4999` → proceed but emit Slack alert (1x per tenant per day)
   - `≥ ₹5000` → return `AICostBudgetError` (HTTP 429 in chat route)
2. After successful AI call: increment `aiSpendDailyInr` atomically by `model.computeCost(input, output)`

### 9.3 Reset cron

Daily UTC-midnight `apps/backend/src/jobs/reset-ai-spend.ts` resets all tenants:

```sql
UPDATE axhy."Company" SET "aiSpendDailyInr" = 0;
```

### 9.4 Hard-cap UX

When tenant hits ₹5000:

- Chat returns 429 with body: `{ "error": "AI_BUDGET_EXCEEDED", "message": "Daily AI budget reached. Resets at midnight. Owner: contact support to upgrade." }`
- Mobile shows friendly error: "Daily AI usage limit reached. Try again tomorrow or contact your administrator."
- Owner gets Slack/email notification

### 9.5 Why these numbers

Master plan §B AI cost cap: ₹2K/customer/month (within ₹8K/month total pricing).

- Steady state: ~₹65/day average — well under ₹3000 soft warn
- Heavy day (incident, lots of corrections): could spike to ₹500-1500 — under soft warn
- ₹3000 soft warn = ~5x average, real anomaly
- ₹5000 hard cap = catches a runaway loop or attack early; loses ~1 day for the customer

Adjustable per-tenant via Owner-tier override (Phase D admin web feature).

---

## 10. AI tool surface — additions

Spec 1 locked 20 tools (14 propose\_\* + 6 read). Spec 2 adds:

| New tool                    | Type        | Surface                                                |
| --------------------------- | ----------- | ------------------------------------------------------ |
| `propose_living_doc_update` | propose\_\* | `voice_change_parse` (same Sonnet call, no extra cost) |

**New count: 21 tools (15 propose\_\* + 6 read).** All other surface tooling unchanged from Spec 1.

---

## 11. Backend routes added in Wave 2

| Route                                                  | Purpose                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `POST /chat/messages`                                  | The hardened-sync chat endpoint. Idempotency-Key required.                           |
| `POST /chat/apply`                                     | User taps Apply on DecisionCard → execute proposed tool calls against backend routes |
| `GET /chat/messages?threadId=X&before=cursor&limit=50` | Scroll-back history                                                                  |
| `POST /assignments`                                    | `propose_create_assignment` consumer (Spec 1 locked, lands here)                     |
| `PATCH /assignments/:id`                               | `propose_modify_assignment` consumer                                                 |
| `PATCH /assignments/:id/terminate`                     | `propose_terminate_assignment` consumer                                              |
| `POST /living-doc/rules`                               | `propose_living_doc_update` consumer                                                 |
| `GET /living-doc/rules?supervisorId=X`                 | Read supervisor's rules                                                              |
| `POST /living-doc/proposals/:id/decide`                | Accept/reject inferred pattern from morning review                                   |

Total Wave 2 routes: 9. (ChangeRequest routes deferred — see §13.)

---

## 12. Outbox cascades (additions)

| Source                    | Outbox topic                                 | Consumer                                            |
| ------------------------- | -------------------------------------------- | --------------------------------------------------- |
| ChatMessage written       | (none — kept in chat path; no async cascade) | —                                                   |
| Assignment created (real) | `assignment.materialize` (Wave 3)            | Visit materialization cron                          |
| LivingDoc rule added      | `livingdoc.cascade` (Phase D)                | Cross-supervisor rule sharing if visibility=COMPANY |
| AICostBudgetError thrown  | `cost.budget_alert`                          | Slack/email notification                            |

Most Wave 2 paths are synchronous; Outbox is for side-effects that DO need async (cost alerts, cross-supervisor cascades). Chat itself is sync.

---

## 13. What's NOT in Wave 2 (deferred)

| Item                                                                                           | Wave                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------ |
| ChangeRequest table + 7 routes (LEAVE, SWAP, VISIT*CORRECTION, TERMINATION*\*, decide, cancel) | Wave 2.5 or Wave 3             |
| Visit materialization cron (cron + lazy materialize-on-action)                                 | Wave 3                         |
| Real Outbox handlers (replace stubs with Gupshup, payroll recompute, R2 photo upload)          | Phase D                        |
| Supervisor mobile UI (chat tab, DecisionCard rendering, calendar tab, profile, etc.)           | Wave 4 (Spec 3)                |
| Connectedness Map full ingestion                                                               | Phase D                        |
| Full-text search on chat history                                                               | Phase D                        |
| Streaming chat (SSE / WebSocket)                                                               | Phase D — pilot data dependent |

**Wave 2 scope is intentionally bounded.** ChangeRequest routes pull in 5 propose\_\* tools + decide flow + a new state machine — that's Wave 2.5's natural scope. Bundling here = 50+ task wave; splitting = two ~20-task waves.

---

## 14. Engineering discipline

### 14.1 Locked from Wave 1 + Spec 2 panel

- ESLint rule `axhy/require-derives` enforces `@derives(...)` annotations on every code unit
- ESLint rule `no-direct-visit-read` (Wave 1) blocks `prisma.visit.find*` in payroll/billing
- New ESLint rule (Spec 2): **`no-raw-anthropic-call`** — every `anthropic.messages.create()` call must go through `@axhy/ai-tools/sonnet-tool-loop`. No direct SDK use in route code.
- ESLint rule for ai-spend tracking: every AI call must include `surface: AISurface` parameter — enforced via `@axhy/ai-tools` API shape
- Pure-function packages stay pure (`state-machines/`, `ai-tools/policy + tool-defs`, `conflicts/`)

### 14.2 PR discipline (added today per panel synthesis)

`.github/PULL_REQUEST_TEMPLATE.md` updated to include:

```markdown
## Concepts touched

<!-- Tables / state machines / routes / packages affected. Helps reviewers + AI subagents in future PRs. -->

## Re-debate triggers added/changed

<!-- If this PR creates a new lock that should be revisitable on certain conditions. -->

## Tests verifying

<!-- Names of test cases that prove this works. -->
```

### 14.3 AI-impact-analyzer as v3 default (panel-locked)

Empirical test (β — enum conversion scenario, 2026-05-09): ~93% accuracy. Above 90% threshold.

**Pattern:** Before any cross-cutting change in Wave 2+:

1. Ask Claude: "If I change X, what files need to update?"
2. Verify suggestions against actual code (5 min)
3. Proceed with confidence

**Re-evaluation trigger:** if accuracy drops below 80% on a real scenario, build the Connectedness Map (Phase D). Until then, AI grep+reason replaces the formal map.

---

## 15. Test surface for Wave 2

### 15.1 Unit tests (`packages/state-machines/**`, `packages/ai-tools/**`)

- LivingDocRule shape validation: ~5 cases
- Idempotency-Key header validation: ~3 cases
- Cost ceiling enforcement: ~6 cases (under, near, at, over each threshold)
- Prompt cache key generation: ~8 cases (each tier × hit/miss)
- Hydrator (deferred → real): ~4 cases (single, multiple, empty, partial-fail-resume)
- `propose_living_doc_update` payload validation: ~6 cases per section
- Tool routing dispatch: ~12 cases (each tool's route mapping)

### 15.2 Integration tests (`tests/integration/phase-c-wave-2/**`)

Each on real Railway via `axhy-sandbox` tenant:

- `chat-create-message.test.ts` — POST /chat/messages happy path + idempotency dedup + 429 over budget + 503 concurrency cap
- `chat-tool-loop.test.ts` — Anthropic tool-use loop with mocked Anthropic responses (NOT mocking DB)
- `chat-apply.test.ts` — POST /chat/apply executes propose_create_assignment → real Assignment row appears
- `living-doc-rule-create.test.ts` — propose_living_doc_update → DecisionCard → tap Apply → rule lands in LivingDoc section
- `living-doc-proposal-decide.test.ts` — staged proposal → accept → moves to LivingDoc; reject → state=REJECTED
- `assignment-hydrator.test.ts` — seed deferred CalendarEntries + run hydrator + assert real Assignment rows + nulled pending payloads
- `prompt-cache-hit.test.ts` — 2 sequential calls to same supervisor; assert Anthropic billed for tier 1+2 only on second call
- `cost-ceiling.test.ts` — fast loop of AI calls; assert 429 at threshold + Slack alert dispatched (stub)
- `cross-tenant-chat-isolation.test.ts` — Tenant B can't access Tenant A's threads/messages/livingdoc

Targets: **9 integration test files, ~50 tests total, all green on real Railway.**

### 15.3 Water-flow test

End-to-end via real iPhone (founder owns):

1. Login as supervisor in axhy-sandbox tenant
2. Tap mic, speak: "Add Suresh to Apollo Mon-Sat starting Monday"
3. Sarvam STT → Anthropic Sonnet → tool_use → DecisionCard appears with "Confirm assignment?"
4. Tap Apply → real Assignment row + AuditEvent + Outbox(`assignment.materialize`) — visible in Prisma Studio
5. Speak again: "Remember Sundeep is always 5 min late on rainy days"
6. DecisionCard appears: "Save as a rule for Sundeep?" → tap Save → LivingDoc.workerNotes section gets the entry
7. Verify cumulative aiSpendDailyInr increment per call

This is the GATE before Wave 2.5 (ChangeRequest routes) starts.

---

## 16. Re-debate triggers

| Signal                                                        | What forces re-debate                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Pilot p95 latency on `POST /chat/messages` > 10s consistently | Switch from sync to streaming (Q1 fork B)                                |
| Idempotency-Key collisions > 0                                | Audit client UUID generation; tighten enforcement                        |
| Cost ceiling triggered for >5% of tenants in any month        | Pricing model needs adjustment; surface to Naina + Karthik               |
| AI-impact-analyzer accuracy < 80% on a real scenario          | Pause Wave N to build Connectedness Map (Phase D pull-forward)           |
| Tier 2 cache hit rate < 50%                                   | LivingDoc churns too fast; revisit invalidation strategy                 |
| Hydrator finds > 1000 deferred payloads                       | Wave 1 deferral pattern was used in production unexpectedly; investigate |
| Inferred-pattern accept rate < 30% in pilots                  | Nano extraction noisy; revisit extraction prompt                         |

---

## 17. Glossary additions

| Term                    | Meaning                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hardened sync**       | Synchronous HTTP request with Idempotency-Key, server timeout, client retry. Replaces "naive sync" which is broken on flaky networks.                                                  |
| **Tool-use loop**       | Anthropic SDK pattern: assistant emits `tool_use` → backend executes → `tool_result` returned → assistant continues until `end_turn`. May span multiple tools per single user message. |
| **DecisionCard**        | UI primitive showing a proposed action awaiting tap-to-apply. Returned by every `propose_*` tool.                                                                                      |
| **Optimistic UI**       | Client renders user's bubble immediately, "thinking..." placeholder, replaces with DecisionCard on response.                                                                           |
| **3-tier prompt cache** | Stratified system prompt by churn rate: tools (rare) / livingdoc (per-supervisor) / recent context (per-message).                                                                      |
| **AI-impact-analyzer**  | Pattern of asking Claude "what files break if I change X" instead of maintaining a separate dependency map.                                                                            |
| **Hydrator**            | One-time data migration script converting Wave 1's deferred Assignment payloads into real Assignment rows.                                                                             |
| **AICostBudgetError**   | Thrown by `@axhy/ai-tools` gateway when tenant exceeds daily ₹5000 ceiling. Surfaced as 429 to client.                                                                                 |

---

## 18. Sign-off

> **Founder review:** approve, request changes, or open new questions inline as `> FOUNDER NOTE: …`. Once approved, this spec gets locked and the implementation plan is written via writing-plans skill.

> **Implementation gate:** Wave 1's 50/50 (Phase B) + 16 Wave 1 tests must remain green. Any regression on existing tests during Wave 2 implementation = stop, fix, re-run.

> **Wave decomposition (likely):**
>
> - **Wave 2a** (~10 tasks): Assignment table + hydrator + `POST /chat/messages` skeleton + idempotency + ONE tool wired (propose_create_assignment) — vertical slice
> - **Wave 2b** (~8 tasks): LivingDoc restructure (with state field on rules) + propose_living_doc_update + nightly cron writes pending rules
> - **Wave 2c** (~6 tasks): ChatThread/ChatMessage history + scroll-back + cross-tenant tests
> - **Wave 2d** (~5 tasks): Prompt cache 3-tier + cost ceiling + dashboard + observability

> **Next step after lock:** writing-plans skill produces `docs/plans/2026-05-09-phase-c-wave-2-ai-chat-plan.md` (likely 4 sub-plans aligned to 2a/b/c/d).
