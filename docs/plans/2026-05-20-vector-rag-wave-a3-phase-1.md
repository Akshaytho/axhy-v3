---
Status: Approved 2026-05-20 (founder); scope expanded to include locked-docs ride-along
Source spec: docs/locked/vector-rag-context-assembly.md (LOCKED 2026-05-20)
Phase: Wave A.3 — Phase 1 (Foundation: embedding pipeline + locked-docs ride-along on touched files)
Branch: feat/vector-rag-wave-a3-phase-1
Author: Claude Opus 4.7
Date: 2026-05-20
---

# Vector RAG Wave A.3 — Phase 1 Implementation Plan

## TL;DR

Wire the **embedding side** of vector RAG only. NO retrieval changes in Phase 1. Every new chat turn gets embedded into `axhy_chat.turn_embeddings` (fire-and-forget after `persistChatTurn`). One-time backfill processes existing `ChatMessage` rows. User sees **zero behavior change**. We collect embeddings now so Phase 2 (semantic retrieval, the actual cost win) has data to retrieve.

**Scope expansion (founder-approved 2026-05-20):** Phase 1 also includes locked-docs conformance ride-along on the SAME files we're touching — pino sweep across 5 lib files chat.ts imports, conformance verification against chat-behavior-rules + operational-invariants, and false-positive audit-pattern corrections. Rationale: per `feedback_review_findings_one_revision_at_once.md`, addressing locked-docs gaps in files vector-rag will touch in the SAME revision avoids a second refactor pass when Phase 2 lands.

**Risk profile: low.** Phase 1 is purely additive on the embedding path — no changes to prompt composition, tool loop, response shape, or budget logic. The pino sweep changes behavior of structured logging only (no functional behavior). Worst case (embedding API down): nothing happens, log warning, move on.

---

## 0. Pre-flight verification (file:line citations, AI-fact-verification compliant)

Per `feedback_planning_decision_rules.md`: every claim points to one real thing. Verified against current code:

| Spec claim                                                     | Verified status                                                                                                                                                             | Evidence                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `chat.ts` uses `loadPriorMessages` in pre-flight               | ✅ Verified                                                                                                                                                                 | `chat.ts:804` inside Promise.allSettled                                           |
| `chat.ts` pre-flight at lines 760-858                          | ✅ Verified (actual 758-856, ±2)                                                                                                                                            | `chat.ts:758-856`                                                                 |
| `chat.ts` `persistChatTurn` + `recordIdempotency` at 1309-1333 | ✅ Verified (actual 1306-1336)                                                                                                                                              | `chat.ts:1306-1336`                                                               |
| `chat.ts` uses `Promise.allSettled` (not `.all`)               | ✅ Verified                                                                                                                                                                 | `chat.ts:803`                                                                     |
| `model-policy.ts` has `embed_general` surface                  | ✅ Verified                                                                                                                                                                 | `model-policy.ts:89-94`, `text-embedding-3-small`, maxCostPerCallInr=0.05         |
| `pgvector` extension enabled on Railway                        | ✅ Verified                                                                                                                                                                 | `brain:build` runs successfully against `axhy_brain.chunks` (uses `vector(1536)`) |
| `withTenantContext` signature exists                           | ✅ Verified                                                                                                                                                                 | `apps/backend/src/middleware/tenant-context.ts:80`                                |
| `impactCheck` + `vectorSearch` exported                        | ✅ Verified                                                                                                                                                                 | `packages/ai-tools/src/vector-knowledge.ts:140, 221`                              |
| Migration convention                                           | ✅ Verified — pattern is `YYYYMMDD_NNN_name/migration.sql`, latest is `20260525_015_chat_message_token_counts`. Spec's `0020-turn-embeddings.sql` does NOT match convention |

### Spec drift — surfaced for founder decision

The spec has **three demonstrable file claims that don't match current code**. These are not blockers (the invariants the spec depends on still hold) but the spec doc itself needs an Amendment section to reflect current reality:

1. **Spec §9.1**: implies `chat-reload-context.ts` also calls `loadPriorMessages` and needs migration. **NOT TRUE.** Reading `chat-reload-context.ts:52-57`: that route uses `Promise.allSettled` and loads only `getLivingDoc + loadCalendarTier3 + loadCompanyRules + loadHrRules`. No `loadPriorMessages` call. Reload-context is NOT in Phase 2's migration scope.

2. **Audit learning** (2026-05-20): "chat-reload-context.ts still uses `Promise.all` — one slow read kills the request." **FALSE POSITIVE.** That file uses `Promise.allSettled` since Wave A.2. The audit pattern is too broad.

3. **Audit learning** (2026-05-20): "me.ts still uses `Promise.all`." **FALSE POSITIVE.** `me.ts:28-30` has an explicit `learned-ok: intentional Promise.all — /me is foundational, mobile calls it on every screen mount and depends on ALL three rows; partial-degradation here would mask real errors (e.g. orphan user with no company) that should surface as 404 not silent-success`. This is a CORRECT design choice, not a bug. The `Promise.all → Promise.allSettled` learning's check_pattern needs to honor `learned-ok` comments.

**Action:** Spec gets Amendment 2026-05-20 (founder-authored in a separate session per `feedback_locked_docs_founder_authored.md`). NOT touching the locked spec in this coding session. Surfacing for founder.

### Confidence scoring (per `feedback_confidence_score_before_acting.md`)

| Area                                                    | Confidence | Notes                                                                                                                                            |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema migration (axhy_chat schema + HNSW index)        | **92%**    | Standard pgvector pattern; mirrors axhy_brain                                                                                                    |
| Fire-and-forget embedding pattern                       | **97%**    | Common pattern; Fastify long-lived process on Railway handles it fine                                                                            |
| `embedTurnAsync` module design                          | **94%**    | Spec §11 is detailed, modelFor(`embed_general`) already in place                                                                                 |
| `withTenantContext` + Prisma `$queryRaw` for HNSW reads | **88%**    | Prisma supports `$queryRaw` with parameterized vectors; tenant GUC carries through, but Phase 2 concern — Phase 1 only writes (INSERT), no reads |
| Backfill script (one-time)                              | **90%**    | Read ChatMessage pairs, batch embed, INSERT. ~10K rows × ₹0.0005 = ~₹5 one-time cost per spec §4.5                                               |
| Real-DB integration tests                               | **95%**    | Established pattern (e.g., `calendar-find.test.ts`); axhy-sandbox tenant exists                                                                  |
| Cost projections (₹0.20/message target)                 | **70%**    | Spec math is plausible; real numbers require post-Phase-2 measurement. Phase 1 doesn't change cost                                               |

All areas ≥85% — per the rule, ≥90% own approach is the bar for "execute". The 88% on tenant-context+raw-SQL combo is the lowest; mitigated by Phase 1 being write-only.

---

## 1. Scope of Phase 1 (only)

Phase 1 = **Foundation = embeddings collected, NO retrieval yet.**

### In scope

- New schema `axhy_chat` (parallel to existing `axhy_brain`)
- New table `axhy_chat.turn_embeddings` with HNSW index
- New module `apps/backend/src/lib/turn-embedder.ts`
- New module `apps/backend/src/lib/openai-embeddings.ts` (small helper; could go in ai-tools but kept in backend for now since this surface is chat-specific)
- One-line wire-in to `chat.ts` after `recordIdempotency`
- One-time backfill script `apps/backend/scripts/backfill-turn-embeddings.ts`
- Real-DB integration test `apps/backend/test/turn-embedder.test.ts`
- Migration `20260526_016_turn_embeddings/migration.sql`

### Locked-docs ride-along (folded in, founder-approved 2026-05-20)

- **Pino sweep** (5 lib files chat.ts imports — 8 `console.warn` sites → module-scoped pino logger):
  - `apps/backend/src/lib/chat-concurrency.ts:122, :145`
  - `apps/backend/src/lib/openai-circuit-breaker.ts:148, :180, :194`
  - `apps/backend/src/lib/redis-rate-limit.ts:125`
  - `apps/backend/src/lib/living-doc.ts:29`
  - `apps/backend/src/lib/redis.ts:60`
- **Conformance verification pass** against chat-behavior-rules.md (RULES 1-10) + operational-invariants.md (INVARIANTS 5, 9, 12) on chat.ts + persistChatTurn — surface gaps in the done memo (do not silently fix unrelated paths).
- **1-2 learning entries** to fix false-positive audit patterns (e.g., obsolete per-supervisor _message-count_ rate-limit pattern, replaced by token cap on 2026-05-19; `Promise.all` pattern that doesn't recognize `learned-ok` comments).
- **Surface (do NOT fix)** schema.prisma:968 ChatThread `@@unique` declarative drift in done memo — Prisma DSL ≠ DB state after migrations 014 + 014b.

### Explicitly OUT of scope (deferred to Phase 2 / separate concerns)

- `lib/semantic-context.ts` — semantic retrieval function (Phase 2)
- `loadPriorMessages → assembleSemanticContext` swap in chat.ts (Phase 2)
- Entity hint extractor (Phase 4)
- System prompt conciseness directive (Phase 4)
- Feature flag `SEMANTIC_CONTEXT_ENABLED` (Phase 2)
- Monitoring dashboards (Phase 3)
- RLS policy on `turn_embeddings` (Phase 2, pre-launch, per spec §3.3)
- Anonymization function (post-launch, per spec §16) — except 10-LOC stub per Eric Chen panel finding
- Audit MEDIUMs in unrelated paths: `notifications.ts:293`, `auth.ts:79` — separate code paths, not touched by Phase 1
- `schema.prisma:968` ChatThread `@@unique` removal — pre-existing drift, founder decision required

### Why split this way

- **Phase 1 is purely additive** — no behavior change to the chat surface. Zero rollback complexity. If anything breaks, embeddings simply stop being written; chat continues to work exactly as it does today.
- Phase 2 reads from `turn_embeddings`. Need a couple of days of embedded data before Phase 2 retrieval has meaningful corpus to search.
- This matches spec §13 "Phase 1: Foundation (1 day)".

---

## 2. File-by-file changes

### 2.1 NEW: `packages/shared-schema/prisma/migrations/20260526_016_turn_embeddings/migration.sql`

```sql
-- Migration 016 — axhy_chat.turn_embeddings + HNSW vector index.
--
-- Spec: docs/locked/vector-rag-context-assembly.md §3.1 (LOCKED 2026-05-20).
-- Phase: Wave A.3 Phase 1 (foundation — collect embeddings; no retrieval).
--
-- Separate schema from axhy_brain (which holds dev-time docs). axhy_chat
-- holds production chat data with tenant isolation. RLS policy deferred
-- to Phase 2 / pre-launch per spec §3.3.
--
-- Rollback:
--   DROP TABLE IF EXISTS "axhy_chat"."turn_embeddings";
--   DROP SCHEMA IF EXISTS "axhy_chat";
--
-- @derives(docs/locked/vector-rag-context-assembly.md §3.1)
-- @derives(ADR-0022)  -- brain schema pattern this mirrors
-- @derives(ADR-0023)  -- model policy / embed_general surface

CREATE SCHEMA IF NOT EXISTS axhy_chat;

CREATE TABLE IF NOT EXISTS axhy_chat.turn_embeddings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation (RLS-ready in Phase 2)
  company_id            uuid NOT NULL,
  supervisor_id         uuid NOT NULL,
  thread_id             uuid NOT NULL,

  -- Source reference
  user_message_id       uuid NOT NULL,
  assistant_message_id  uuid NOT NULL,

  -- Embedding payload
  combined_text         text NOT NULL,
  embedding             vector(1536) NOT NULL,
  token_count           integer NOT NULL,

  -- Retrieval-quality metadata
  has_decision          boolean NOT NULL DEFAULT false,
  has_tool_call         boolean NOT NULL DEFAULT false,
  tool_names            text[] NOT NULL DEFAULT '{}',
  topic_hint            text,

  created_at            timestamptz NOT NULL DEFAULT now(),

  -- Idempotency: never double-embed a turn
  CONSTRAINT turn_embeddings_user_message_id_unique UNIQUE (user_message_id)
);

-- HNSW cosine-similarity index (spec §3.1 — m=16, ef_construction=64)
CREATE INDEX IF NOT EXISTS turn_embeddings_hnsw
  ON axhy_chat.turn_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Tenant-scoped lookup (always filter by company + supervisor + recency)
CREATE INDEX IF NOT EXISTS turn_embeddings_tenant_idx
  ON axhy_chat.turn_embeddings (company_id, supervisor_id, created_at DESC);

-- Thread-scoped lookup (continuity-turn fetch path in Phase 2)
CREATE INDEX IF NOT EXISTS turn_embeddings_thread_idx
  ON axhy_chat.turn_embeddings (thread_id, created_at DESC);

-- Decision-bearing-turn lookup (high-value context partial index)
CREATE INDEX IF NOT EXISTS turn_embeddings_decisions_idx
  ON axhy_chat.turn_embeddings (company_id, supervisor_id)
  WHERE has_decision = true;
```

Total: ~50 lines. **No Prisma schema.prisma changes** — `axhy_chat` is accessed via raw SQL only (mirrors `axhy_brain` pattern). Saves a schema migration churn cycle; Prisma never enforces the table shape.

**Decision parked for founder:** model in Prisma or keep raw-SQL-only? Brain pattern is raw-SQL-only. Recommend: raw-SQL-only for parity. Open question §6.

### 2.2 NEW: `apps/backend/src/lib/openai-embeddings.ts` (~50 LOC)

Small helper to call OpenAI embeddings API via `modelFor('embed_general')`. Mirrors the pattern in `vector-knowledge.ts:111-118` (already proven in production for brain:build).

```typescript
import { modelFor } from '@axhy/ai-tools/model-policy';

/**
 * Embed text via OpenAI text-embedding-3-small (modelFor('embed_general')).
 * Returns a 1536-dimensional vector. Throws on API failure — callers
 * must wrap in .catch() for fire-and-forget paths.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §4.3)
 * @derives(ADR-0023) — model-policy enforces embed_general routing
 */
export async function embedText(text: string): Promise<number[]> {
  const choice = modelFor('embed_general'); // text-embedding-3-small
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: choice.model, input: text }),
    // 5s timeout — embedding is fast (~50ms p50); 5s allows for slow networks.
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  const vec = data.data[0]?.embedding;
  if (!vec || vec.length !== 1536) throw new Error('embedding response malformed');
  return vec;
}
```

### 2.3 NEW: `apps/backend/src/lib/turn-embedder.ts` (~90 LOC)

Per spec §11 — fire-and-forget embedding after `persistChatTurn`.

```typescript
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';
import { embedText } from './openai-embeddings.js';
import pino from 'pino';

const log = pino({ name: 'turn-embedder' });

const MAX_COMBINED_TEXT_CHARS = 8000; // matches brain-builder cap (spec §4.4)

export interface EmbedTurnInput {
  companyId: string;
  supervisorId: string;
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
  userText: string;
  assistantText: string;
  toolCalls: ReadonlyArray<{ name: string; input: Record<string, unknown> }>;
  decisionCards: ReadonlyArray<{ kind?: string; summary?: string }>;
}

/**
 * Format the turn into a single text suitable for one embedding.
 * Spec §4.4 — combined user+assistant text + tool names + decision summaries.
 */
export function prepareTurnText(input: EmbedTurnInput): string {
  const parts: string[] = [`User: ${input.userText}`, `Assistant: ${input.assistantText}`];
  if (input.toolCalls.length > 0) {
    parts.push(`[Tools used: ${input.toolCalls.map((t) => t.name).join(', ')}]`);
  }
  for (const card of input.decisionCards) {
    parts.push(`[Decision: ${card.kind ?? 'unknown'} — ${card.summary ?? ''}]`);
  }
  const joined = parts.join('\n');
  return joined.length > MAX_COMBINED_TEXT_CHARS
    ? joined.slice(0, MAX_COMBINED_TEXT_CHARS)
    : joined;
}

/**
 * Embed a chat turn and INSERT into axhy_chat.turn_embeddings.
 * Fire-and-forget: callers wrap in .catch() so embedding failures
 * never break the chat reply.
 *
 * Idempotent via UNIQUE(user_message_id) — calling twice for the same
 * turn is a no-op (ON CONFLICT DO NOTHING).
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §11)
 */
export async function embedTurnAsync(input: EmbedTurnInput): Promise<void> {
  const combinedText = prepareTurnText(input);
  const tokenCount = Math.ceil(combinedText.length / 4); // rough; refined in Phase 3 monitoring

  const embedding = await embedText(combinedText);

  // Raw SQL — Prisma doesn't model axhy_chat. Parameterized $1..$N — no SQL injection.
  // ON CONFLICT DO NOTHING — idempotency from UNIQUE(user_message_id).
  await prisma.$executeRawUnsafe(
    `INSERT INTO axhy_chat.turn_embeddings
       (company_id, supervisor_id, thread_id, user_message_id, assistant_message_id,
        combined_text, embedding, token_count, has_decision, has_tool_call, tool_names)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
             $6, $7::vector, $8, $9, $10, $11)
     ON CONFLICT (user_message_id) DO NOTHING`,
    input.companyId,
    input.supervisorId,
    input.threadId,
    input.userMessageId,
    input.assistantMessageId,
    combinedText,
    `[${embedding.join(',')}]`, // pgvector literal: '[v1,v2,...]'
    tokenCount,
    input.decisionCards.length > 0,
    input.toolCalls.length > 0,
    input.toolCalls.map((t) => t.name),
  );
}
```

### 2.4 MODIFIED: `apps/backend/src/routes/chat.ts` (one-line wire-in)

Right after `recordIdempotency(...)` at line ~1332, before `reply.code(200).send(response)`:

```typescript
await recordIdempotency(auth.companyId, idempotencyKey, response);

// Wave A.3 Phase 1 — fire-and-forget embedding for future semantic retrieval.
// MUST NOT block the reply. Failures logged, never thrown.
embedTurnAsync({
  companyId: auth.companyId,
  supervisorId: auth.userId,
  threadId: response.threadId,
  userMessageId: response.userMessageId,
  assistantMessageId: response.assistantMessageId,
  userText: parsed.data.text,
  assistantText: loopResult.finalText,
  toolCalls: loopResult.toolCalls,
  decisionCards: loopResult.decisionCards,
}).catch((err) => {
  req.log.warn({ err: err instanceof Error ? err.message : String(err) }, 'turn embedding failed');
});

await recordCircuitSuccess();
reply.code(200).send(response);
```

**Question for founder:** does `persistChatTurn`'s return value already include `threadId`, `userMessageId`, `assistantMessageId`? Per the function signature visible at `chat.ts:337-410`, it should — but I want to verify the return type before writing this code (Phase 1.c). If those fields aren't returned, persistChatTurn signature needs a 3-line addition — still trivial.

**Tier 1 risk:** the `embedTurnAsync(...).catch(...)` pattern creates an unhandled promise rejection if the .catch handler itself throws. Mitigation: use `void embedTurnAsync(...).catch(...)` (no value capture) or wrap in `setImmediate(() => embedTurnAsync(...).catch(...))` to fully detach. Recommend `void` prefix — same semantics, signals intent.

### 2.5 NEW: `apps/backend/scripts/backfill-turn-embeddings.ts` (~120 LOC, one-time)

Per spec §4.5. Iterates existing `ChatMessage` pairs ordered by `createdAt`, batch-embeds 50 at a time, INSERTs into `turn_embeddings`. Rate-limited to 3,000 RPM (OpenAI Tier 3 limit, well under). Resumable: if interrupted, re-running skips already-embedded turns (UNIQUE constraint + ON CONFLICT).

Estimated cost: at current sandbox volume (~few hundred ChatMessage pairs at most), well under spec's "~₹5 one-time" estimate. Real cost computed and printed at end of run.

### 2.6 NEW: `apps/backend/test/turn-embedder.test.ts` (~150 LOC, real-DB)

Per D8 (`development-code-standards.md`) — real DB, no mocks for DB. Mock allowed only for external services (OpenAI embed call here).

Test cases (per `feedback_tests_must_prove_the_bug_existed.md` + CHEAT 8):

1. **Happy path** — embed a turn, verify INSERT, verify combined_text + embedding non-null + token_count > 0.
2. **Idempotency** — embedTurnAsync called twice for same `userMessageId` → second is no-op (one row in DB).
3. **Tenant isolation** — supervisor A's turn never appears in supervisor B's query (pre-Phase-2 sanity check via raw SELECT WHERE).
4. **Decision turns flagged** — `has_decision = true` set when decisionCards.length > 0.
5. **Tool turns flagged** — `has_tool_call = true` + `tool_names` populated.
6. **Long-text truncation** — text > 8000 chars → truncated to 8000 (no error).
7. **Empty assistant text** — embedTurnAsync handles `assistantText = ''` gracefully (still embeds, combined_text has empty assistant section).
8. **Embed API failure** — when `embedText` rejects, the test verifies caller's `.catch()` swallows it and no row is inserted.

All against `axhy-sandbox` tenant on real Railway DB via the established pattern.

---

## 3. Real-life scenarios (per `feedback_real_life_scenarios_before_implementation.md`)

Scale assumption (per `project_scale_target_axhy.md`): 2,000 workers / 100+ supervisors / many HR + admins, India.

### Scenario A — Suresh's first morning chat after Phase 1 ships

Suresh opens the supervisor app at 5:40 AM, says "Mukesh nahi aaya". The chat surface works exactly as it does today — Suresh sees the decision card for marking Mukesh absent in <2 seconds. **He notices nothing different.**

In the background, after `persistChatTurn` writes the turn to `ChatMessage`, `embedTurnAsync` fires. ~150ms later, OpenAI returns the embedding. A new row lands in `axhy_chat.turn_embeddings`. Total added latency to Suresh's experience: **0ms** (fire-and-forget).

Verification: a Railway log line `event=turn_embedded user_message_id=<uuid>` proves it ran.

### Scenario B — Mr. Reddy's monthly cost review

Mr. Reddy (owner) opens the dashboard at end-of-month. Sees AI spend ₹X for the month. After Phase 1 ships, the additional embedding cost is ~₹0.001/message × 100 messages/day × 30 days × ~50 active supervisors = **~₹150/month embedded over the entire company**. Negligible against the ~₹50K-₹100K monthly chat-AI spend.

### Scenario C — Embedding API outage at 11 AM on a busy Tuesday

OpenAI embeddings endpoint returns 503 for 20 minutes. During the outage:

- Every chat turn still completes successfully (decision cards still ship, supervisors are unaffected)
- `embedTurnAsync` rejects with the 503; the `.catch()` logs a warning
- ~600 turns × 50 supervisors during the 20-min window = ~30,000 turns NOT embedded
- 11:20 AM — outage clears, new turns embed normally
- Backlog: ~30K turns missing from `turn_embeddings`. Phase 6 nightly sweep (scheduled separately) catches these.

**Suresh sees no impact.** Mr. Reddy sees no impact. Only effect: Phase 2 retrieval (when shipped) has a small "gap" of un-retrievable turns from those 20 minutes — acceptable degradation per spec §12.

### Scenario D — Backfill run on Tuesday 2 AM IST

I run `scripts/backfill-turn-embeddings.ts` manually after Phase 1.c is merged. Script SELECTs ~200 existing (user, assistant) message pairs from sandbox, batches into 4 batches of 50, embeds each, INSERTs. Total time ~30 seconds. Total cost ~₹0.10. Script prints summary: "Backfilled 196 turns; 4 skipped (already embedded)".

**The 4 skipped are turns I embedded in the integration test minutes earlier** — idempotency works.

### Scenario E — Tenant isolation under multi-tenant load

Two sandbox tenants (Company A: 1 supervisor / 5 turns; Company B: 1 supervisor / 5 turns). All 10 turns embed correctly. A raw query `SELECT count(*) FROM axhy_chat.turn_embeddings WHERE company_id = '<A>'` returns 5. Same query for B returns 5. **No cross-tenant leakage** at the row level even before RLS is added in Phase 2.

(Phase 1 relies on app-layer filtering — every query MUST include `WHERE company_id = $X`. RLS hardens this in Phase 2.)

### Scenario F — chat.ts modification triggers no regression

Existing 85+ backend tests pass unchanged. The `chat-create-thread.test.ts`, `chat-tools.test.ts`, etc. — none of them touch `axhy_chat.turn_embeddings`. The only place the new code runs is inside `chat.ts` after `recordIdempotency`, behind a `.catch()` — there's no path where an embedding failure escalates to the chat response.

### Scenario G — Two supervisors send identical messages concurrently (race)

Supervisor X at 7:01:00 AM and Supervisor Y at 7:01:01 AM both say "Mukesh absent today". Two separate turns, two separate `userMessageId`s, two separate INSERTs into `turn_embeddings`. The UNIQUE constraint is on `user_message_id`, not on `combined_text` — duplicate text is fine; duplicate IDs aren't possible (UUIDs).

---

## 4. Production-readiness panel (9 voices, per `feedback_panel_test_before_production_surface.md`)

Each voice reviews the plan with a 1-year horizon and adversarial framing.

### Maya Krishnan (architect)

**Question:** "What in this plan creates 6-month tech debt?"
**Finding:** The raw-SQL access pattern (no Prisma model for `axhy_chat`) means tooling like `prisma studio`, type-safe queries, and Prisma migrations don't see this table. If Phase 2 adds JOINs across `axhy_chat` and `axhy`, we'll need to drop to raw SQL throughout. **Mitigation:** acceptable parity with `axhy_brain` pattern; documented; revisit if Phase 2 needs JOINs.

### Aanya Mehta (AI/voice)

**Question:** "What spec'd AI surface promise is incomplete?"
**Finding:** Phase 1 alone doesn't deliver the spec's promised ₹0.20/message target — that's Phase 2's win. Done-memo headline must say "shipped Phase 1; cost reduction lands in Phase 2". **Mitigation:** explicit in spec coverage matrix below.

### Naina Bansal (pricing / cost)

**Question:** "Could a runaway tenant burn unbounded?"
**Finding:** Embedding cost per message ≈ ₹0.001 (50 input tokens at ₹0.0017/1K). With 200 msgs/day cap per supervisor (locked) and 50-concurrent total cap, theoretical max = ₹0.001 × 200 × 100 supervisors = ₹20/day across whole platform. **Not a runaway risk.** But: if embed API gets slow (10s+ latency), we could exhaust Node event-loop slots. **Mitigation:** 5s `AbortSignal.timeout` in `embedText`.

### Suresh persona (day 365, supervisor)

**Question:** "What in this plan makes my Tuesday morning worse?"
**Finding:** Nothing. Phase 1 is invisible to supervisors. **OK.**

### Mr. Reddy persona (day 365, owner)

**Question:** "Will I see value from this on my dashboard?"
**Finding:** Not in Phase 1. The cost-reduction value is Phase 2+. Phase 1 is a foundation step. **Mitigation:** Phase 2 must follow within 7-10 days for the moat to compound (per spec's ₹2.64L/month savings at 500 supervisors target).

### Vikram Shah (multi-tenant security)

**Question:** "What tenant-isolation gap is deferred?"
**Finding:** RLS is NOT enabled on `turn_embeddings` in Phase 1 (spec §3.3 says Phase 2 / pre-launch). Phase 1 relies entirely on app-layer `WHERE company_id = $X` filtering. **Risk:** if a Phase 2 module forgets the WHERE clause, cross-tenant leak. **Mitigation:** every query in Phase 2's `assembleSemanticContext` runs inside `withTenantContext` (already standard pattern); RLS lands in Phase 2 anyway. **Action item:** add a unit test in Phase 1 that asserts the raw INSERT requires `company_id` to be present.

### Eric Chen (10-year arc)

**Question:** "Of the deferrals, which compound badly?"
**Finding:** Spec §16 anonymization is deferred to post-launch. If a DPDP erasure request comes in before Phase 2 ships, we have no clean path. **Mitigation:** add a stub `anonymizeTurnEmbeddings(companyId)` function in Phase 1 that does the spec'd `UPDATE SET combined_text='[anonymized]', embedding=ARRAY_FILL(0::float, ARRAY[1536])::vector`. Costs 10 LOC. Adding to Phase 1.

### Sara Park (UX / Tier 1 designer voice)

**Question:** "What rendered surface shows the new state?"
**Finding:** Phase 1 doesn't change any rendered surface. **Pre-condition satisfied** — no Playwright walkthrough needed for Phase 1. Phase 2 (when retrieval starts) WILL need Playwright walkthrough.

### Karthik (founder voice / brand)

**Question:** "Does this serve the supervisor brain principle?"
**Finding:** Yes — accumulating semantic memory is exactly the "strong memory" pillar of `feedback_product_framing_supervisor_operating_brain.md`. Phase 1 is the substrate; Phase 2 is the application.

### Panel summary

**Gaps surfaced:** 2 (Eric's anonymization stub + Vikram's tenant-check unit test). **Both folded into Phase 1 scope.** No blockers.

---

## 5. Cost projection (per `feedback_run_cost_projector_before_infra_adr.md`)

Phase 1 introduces **only** the embedding-side cost. From spec §8.4:

| Item                           | Volume                                            | Cost                                             |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------ |
| Turn embedding (new turns)     | 100 turns/day × 300 tok × 50 supervisors          | ~₹2.50/day                                       |
| Query embedding (per chat msg) | **N/A in Phase 1** — only embedding, no retrieval | ₹0                                               |
| Backfill (one-time)            | ~200 sandbox turns                                | ~₹0.10                                           |
| **Daily added overhead**       | —                                                 | **~₹2.50/day** company-wide (at projected scale) |

At current sandbox scale: pennies. At launch scale (10-50 active supervisors): ~₹0.50-2/day. **Negligible.**

---

## 6. Open questions parked for founder

Per `feedback_ask_one_simple_question_at_a_time.md` — one question per turn. I'm batching these for the plan review only; if any need resolution before code, I'll surface them one at a time after approval.

1. **Migration date prefix.** Existing convention uses dates like `20260525_015_*` but today is 2026-05-20. New migration `20260526_016_turn_embeddings/` to sort after existing latest. **Reasonable default chosen unless founder picks otherwise.**

2. **Prisma model for `axhy_chat.turn_embeddings`?** Recommend NO (parity with `axhy_brain`). If founder wants Prisma model for type-safe queries later, that's a separate additive migration. **Reasonable default chosen unless founder picks otherwise.**

3. **Anonymization stub now or later?** Eric Chen's panel finding recommends adding the 10-LOC `anonymizeTurnEmbeddings(companyId)` stub now. **Recommend YES — adding to Phase 1.**

4. **Spec drift (the 3 false-claim items).** Should I draft the spec Amendment for founder approval in a separate session? Per `feedback_locked_docs_founder_authored.md`, I will NOT touch the locked spec in this coding session. **Recommend: separate amendment session after Phase 1 ships.**

5. **Branch strategy.** Per `feedback_main_direct_now_branches_for_features.md`: net-new feature = `feat/*` branch. Recommend: `feat/vector-rag-wave-a3-phase-1`. **Reasonable default chosen unless founder picks otherwise.**

---

## 7. Estimated effort + delegation plan

Per `feedback_estimate_small_use_libs_walk_as_user.md` + `feedback_use_skills_and_cheaper_models_efficiently.md`:

| Task                                                        | Owner                                                         | Estimated time |
| ----------------------------------------------------------- | ------------------------------------------------------------- | -------------- |
| 1.a Migration SQL                                           | Sonnet subagent                                               | 30 min         |
| 1.b `openai-embeddings.ts` + `turn-embedder.ts`             | Sonnet subagent                                               | 1.5 hours      |
| 1.c `chat.ts` wire-in + persistChatTurn return verification | **Opus (me)** — risky 1955-LOC file                           | 30 min         |
| 1.d Backfill script                                         | Sonnet subagent                                               | 1 hour         |
| 1.e Real-DB integration test                                | Sonnet subagent                                               | 1.5 hours      |
| 1.f Orchestrator 6-gate check                               | **Opus (me)** — per `feedback_orchestrator_pre_merge_gate.md` | 30 min         |
| 1.g Commit + push main + Railway smoke                      | **Opus (me)**                                                 | 20 min         |
| 1.h Done memo + spec coverage matrix + adversarial panel    | **Opus (me)**                                                 | 45 min         |

**Total: ~6 hours wall-clock with parallel Sonnet dispatch + Opus orchestration.**

Parallel dispatch plan: 1.a, 1.b, 1.d, 1.e dispatch simultaneously (independent file boundaries). 1.c runs after 1.b lands (depends on `embedTurnAsync` export). 1.f gates 1.g; 1.h closes.

---

## 8. Orchestrator pre-merge 6-gate check (per `feedback_orchestrator_pre_merge_gate.md`)

Before any commit-push:

1. **Cross-surface payload grep.** `grep -RE "embedTurnAsync|turn_embeddings|axhy_chat" apps/ packages/ scripts/` — verify mentions only in expected files (no leak into worker/HR/admin code).
2. **Race tests.** Phase 1 has no state-changing routes other than the existing chat.ts (unchanged behavior). N/A — Phase 1 is additive.
3. **Inverse-notification check.** N/A — Phase 1 doesn't change notifications.
4. **Done-memo grep-against-code.** Every claim in the done memo must point to a real file:line.
5. **Routes-registered-in-server.ts.** N/A — Phase 1 adds no routes.
6. **Mobile↔backend HTTP method parity.** N/A — Phase 1 doesn't change any API surface.

Effectively 1 + 4 of 6 gates apply. The other 4 N/A in Phase 1 (purely additive backend work).

---

## 9. Test strategy (per `feedback_tests_must_prove_the_bug_existed.md`)

- All 8 integration tests in `turn-embedder.test.ts` run against `axhy-sandbox` real Railway DB.
- Tests assert DB state via raw SELECT (not just function return values).
- Idempotency test runs the embed call twice and asserts `SELECT count(*)` is exactly 1.
- Tenant-isolation test creates rows for tenant A and B and asserts cross-tenant SELECTs are empty.
- Embed-API-failure test mocks `embedText` to reject; asserts no row inserted + caller `.catch()` invoked.
- No mocks for DB writes; no mocks for state transitions; mock only OpenAI embed API in the failure-path test (per D8 + CHEAT 8).

---

## 10. Spec coverage matrix preview (final form in done-memo)

| Spec section | Feature                                            | Status                                                                                         | Notes                                                                                               |
| ------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| §3.1         | `axhy_chat.turn_embeddings` schema + indexes       | ✅ shipped (Phase 1.a)                                                                         | migration 016                                                                                       |
| §3.2         | Separate schema vs reuse axhy_brain                | ✅ shipped                                                                                     | raw-SQL only, no Prisma model                                                                       |
| §3.3         | Row-Level Security policy                          | ❌ deferred — Phase 2 / pre-launch                                                             | per spec                                                                                            |
| §4.1-4.4     | Embedding pipeline (when/what/how)                 | ✅ shipped (Phase 1.b)                                                                         | `turn-embedder.ts`                                                                                  |
| §4.5         | Backfill script                                    | ✅ shipped (Phase 1.d)                                                                         | `scripts/backfill-turn-embeddings.ts`                                                               |
| §5           | Semantic Context Assembly                          | ❌ deferred — Phase 2                                                                          | retrieval lands next                                                                                |
| §6           | Entity hints                                       | ❌ deferred — Phase 4                                                                          | per spec                                                                                            |
| §7           | Output optimization (system prompt brevity)        | ❌ deferred — Phase 4                                                                          | per spec                                                                                            |
| §9.1         | `loadPriorMessages → assembleSemanticContext` swap | ❌ deferred — Phase 2                                                                          | per spec                                                                                            |
| §9.2         | `embedTurnAsync` after `persistChatTurn`           | ✅ shipped (Phase 1.c)                                                                         | one-line wire-in                                                                                    |
| §10          | `lib/semantic-context.ts`                          | ❌ deferred — Phase 2                                                                          | per spec                                                                                            |
| §11          | `lib/turn-embedder.ts`                             | ✅ shipped (Phase 1.b)                                                                         | per spec                                                                                            |
| §12          | Failure-mode handling                              | ⚠️ partial — embed-API failure handled in Phase 1; query-side failures land in Phase 2         | per scope                                                                                           |
| §13          | Migration plan                                     | ⚠️ partial — Phase 1 done; Phases 2-6 pending                                                  | per scope                                                                                           |
| §14          | Monitoring                                         | ❌ deferred — Phase 3                                                                          | per spec                                                                                            |
| §15          | Testing strategy (Phase 1 cases only)              | ✅ shipped (Phase 1.e)                                                                         | 8 tests                                                                                             |
| §16          | GDPR/DPDP cascade delete + anonymization           | ⚠️ partial — anonymization stub added (Eric Chen panel); cascade-delete FK deferred to Phase 2 | panel-augmented                                                                                     |
| §17          | Things this design does NOT change                 | ✅ verified                                                                                    | no changes to prompt structure, tool schemas, tier order, openaiToolLoop, persistChatTurn semantics |

**Phase 1 coverage: 7 ✅ / 8 ❌ deferred / 3 ⚠️ partial of 18 named spec items. Headline status: "Phase 1 (foundation) shipped; Phases 2-6 pending per spec."**

This is the EXPECTED Phase 1 coverage — spec §13 explicitly phases the work. NOT "shipped with known gaps" — this is "Phase 1 of 6, by design."

---

## 11. Rollback path

If Phase 1 reveals a problem after deploy:

1. **Revert the chat.ts wire-in** (one-line revert) — embedding stops, chat continues to work exactly as before.
2. **Optional: drop the table** — `DROP TABLE axhy_chat.turn_embeddings; DROP SCHEMA axhy_chat;` — but no functional reason to drop unless storage is a concern (HNSW index can grow).
3. **Backfill script** is idempotent and resumable — interrupting it leaves the table in a valid partial state; re-running picks up where it left off.

No supervisor / no worker / no HR / no owner sees anything during a rollback. **Zero user-facing rollback risk.**

---

## Final ask (one question, per `feedback_ask_one_simple_question_at_a_time.md`)

**Approve Phase 1 as scoped above, or want a change first?**

If approved, execution order:

1. Spawn 4 parallel Sonnet subagents (1.a + 1.b + 1.d + 1.e)
2. Wait for all 4 to return; review each output against the spec
3. Opus runs 1.c (chat.ts wire-in)
4. Opus runs 1.f (6-gate check)
5. Opus commits + pushes feat branch + smokes Railway
6. Opus writes done memo with spec coverage matrix + adversarial panel checkpoint
