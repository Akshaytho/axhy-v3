# Vector DB RAG Design — Semantic Context Assembly for Chat

Status: **LOCKED — Founder-approved 2026-05-20**
Created: 2026-05-20, Wave A cost-reduction design
Authors: Founder + Claude (deep code review session)
References: ADR-0023 (model policy), ADR-0022 (brain schema), Spec 2 §8 (chat prompt)

---

## 1. Problem Statement

### Current state

Every chat message sends the FULL context to OpenAI regardless of relevance:

- System prompt: ~1,200 tokens (static)
- 10 tool schemas: ~2,000 tokens (static)
- ALL company rules: ~600 tokens (static per company)
- ALL HR rules: ~600 tokens (static per company)
- FULL LivingDoc (ACTIVE rules): ~500 tokens (static per supervisor)
- ALL calendar entries (30 days, up to 50): ~300 tokens (semi-static)
- Last 10 chat turns (blind window): ~1,500 tokens (dynamic per turn)
- User message: ~100 tokens (dynamic)
- **Total per API call: ~6,800 tokens input**

With OpenAI prefix caching, ~3,400 tokens (system + rules + LivingDoc) are cached
at 50% rate within a session. Effective input cost per call: ~₹0.20.

Average output: ~700 tokens. Average tool iterations: ~1.4 per message.

**Current cost: ~₹0.40 per message → ₹40/day for 100 messages.**

### Target

**₹20/day for 100 messages per supervisor (₹0.20/message).**

### Why not just trim the turn window?

Cutting prior messages from 10 to 5 saves tokens but destroys the self-learning AI
promise. The Day-365 magic ("Ravi, last time you said Mukesh struggles with toilets
on Mondays") is Axhy's core product differentiator. A blind 5-turn window forgets
everything beyond 5 messages ago. Vector search gives INFINITE memory — the AI
retrieves the most relevant past conversation from ALL of history, not just recent.

### What vector RAG unlocks

1. **Infinite memory** — retrieve relevant turns from 6 months ago, not just last 10
2. **50% input token reduction** — send 3-5 relevant turns instead of 10 blind ones
3. **Smarter responses** — model sees relevant history, not just recent noise
4. **Fewer tool iterations** — pre-fetched entity context reduces find_workers calls
5. **Cost target hit** — ₹0.20/message achievable via combined optimizations

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     POST /chat/messages                       │
│                                                               │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Guards  │→│ Embed Query   │→│  Semantic Context Assembly │ │
│  │ (as-is)  │  │ (new, async) │  │  (new, replaces blind     │ │
│  │          │  │              │  │   loadPriorMessages)      │ │
│  └─────────┘  └──────────────┘  └──────────────────────────┘ │
│                                          │                    │
│                    ┌─────────────────────┼──────────────┐     │
│                    │                     │              │     │
│              ┌─────▼─────┐  ┌───────────▼──┐  ┌───────▼──┐  │
│              │ Turn Search│  │ Entity Search │  │Rule Search│  │
│              │ (pgvector) │  │  (pgvector)   │  │(pgvector) │  │
│              └─────┬─────┘  └───────┬──────┘  └────┬─────┘  │
│                    │                │               │        │
│              ┌─────▼────────────────▼───────────────▼─────┐  │
│              │         Context Assembler (new)             │  │
│              │  Merges: semantic turns + entity hints +    │  │
│              │  relevant rules + last 1 turn (continuity)  │  │
│              └──────────────────┬──────────────────────────┘  │
│                                 │                             │
│              ┌──────────────────▼──────────────────────────┐  │
│              │        6-Tier Prompt (modified Tier 5)       │  │
│              │  Tier 0: System prompt (cached, as-is)       │  │
│              │  Tier 1: Company rules (cached, as-is)       │  │
│              │  Tier 2: HR rules (cached, as-is)            │  │
│              │  Tier 3: LivingDoc (cached, as-is)           │  │
│              │  Tier 4: Calendar (as-is, low token count)   │  │
│              │  Tier 5: SEMANTIC turns (NEW, replaces blind)│  │
│              │  Tier 5b: Entity hints (NEW, optional)       │  │
│              │  Amend: as-is                                │  │
│              │  User: as-is                                 │  │
│              └─────────────────────────────────────────────┘  │
│                                 │                             │
│              ┌──────────────────▼──────────────────────────┐  │
│              │        openaiToolLoop (as-is)                │  │
│              └──────────────────┬──────────────────────────┘  │
│                                 │                             │
│              ┌──────────────────▼──────────────────────────┐  │
│              │        persistChatTurn (as-is)               │  │
│              │        + embedTurnAsync (NEW, fire-and-forget)│
│              └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   Background: Embedding Worker                │
│                                                               │
│  Triggered after persistChatTurn. Embeds the (user, assistant)│
│  turn pair into axhy_chat.turn_embeddings via                 │
│  text-embedding-3-small. Async — does NOT block response.     │
└──────────────────────────────────────────────────────────────┘
```

### Design principle: KEEP the 6-tier cache prefix

OpenAI prefix caching gives 50% discount on the message prefix that matches across
requests. For the SAME supervisor within a session, the prefix
`system_prompt + company_rules + hr_rules + LivingDoc + calendar` is stable
(~3,400 tokens cached at ₹0.02/1K). We preserve this by only changing Tier 5
(prior messages), which was never cached anyway.

---

## 3. Schema Design

### 3.1 New table: `axhy_chat.turn_embeddings`

Separate schema from `axhy_brain` (which holds dev-time docs). This holds
production chat data with tenant isolation.

```sql
-- Migration: 0020-turn-embeddings.sql
CREATE SCHEMA IF NOT EXISTS axhy_chat;

CREATE TABLE axhy_chat.turn_embeddings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation (RLS-ready)
  company_id    uuid NOT NULL,
  supervisor_id uuid NOT NULL,
  thread_id     uuid NOT NULL,

  -- Source reference
  user_message_id      uuid NOT NULL,    -- ChatMessage.id (role=user)
  assistant_message_id uuid NOT NULL,    -- ChatMessage.id (role=assistant)

  -- Embedding
  combined_text text    NOT NULL,        -- "User: {transcript}\nAssistant: {response}"
  embedding     vector(1536) NOT NULL,   -- text-embedding-3-small output
  token_count   int     NOT NULL,        -- tokens in combined_text (for budget tracking)

  -- Metadata for retrieval quality
  has_decision    boolean NOT NULL DEFAULT false,   -- turn produced a decision card
  has_tool_call   boolean NOT NULL DEFAULT false,   -- turn used tools
  tool_names      text[]  NOT NULL DEFAULT '{}',    -- which tools were called
  topic_hint      text,                              -- 1-line AI-generated summary (phase 2)

  -- Timestamps
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Prevent double-embedding
  UNIQUE (user_message_id)
);

-- HNSW index for fast cosine similarity search
CREATE INDEX turn_embeddings_hnsw ON axhy_chat.turn_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Tenant-scoped queries (always filter by company_id + supervisor_id)
CREATE INDEX turn_embeddings_tenant ON axhy_chat.turn_embeddings
  (company_id, supervisor_id, created_at DESC);

-- Thread-scoped queries
CREATE INDEX turn_embeddings_thread ON axhy_chat.turn_embeddings
  (thread_id, created_at DESC);

-- Decision-bearing turns (high-value context)
CREATE INDEX turn_embeddings_decisions ON axhy_chat.turn_embeddings
  (company_id, supervisor_id)
  WHERE has_decision = true;
```

### 3.2 Why a separate table (not reuse axhy_brain.chunks)?

| Concern          | axhy_brain.chunks          | axhy_chat.turn_embeddings                 |
| ---------------- | -------------------------- | ----------------------------------------- |
| Data type        | Dev docs, specs, learnings | Production chat data                      |
| Write pattern    | Batch (brain:build)        | Per-message (real-time)                   |
| Tenant isolation | Global (no tenant)         | Per-company, per-supervisor               |
| Volume           | ~500 chunks total          | ~100 per supervisor per day               |
| Staleness        | Auto-stale on file change  | Never stale (immutable chat history)      |
| GDPR/DPDP        | Internal docs              | @personal user data — must cascade-delete |

### 3.3 Row-Level Security (phase 2, pre-launch)

```sql
ALTER TABLE axhy_chat.turn_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON axhy_chat.turn_embeddings
  USING (company_id = current_setting('app.company_id')::uuid);
```

Matches the existing `withTenantContext` GUC pattern used by chat.ts.

---

## 4. Embedding Pipeline

### 4.1 When to embed

**After `persistChatTurn` returns, fire-and-forget.** The embedding does NOT block
the HTTP response. The user sees their response immediately; embedding happens
in the background.

```
persistChatTurn()
  → return response to client (HTTP 200)
  → fire embedTurnAsync(turnData)  // non-blocking
      → text-embedding-3-small API call
      → INSERT into axhy_chat.turn_embeddings
      → on failure: log error, move on (turn still exists in ChatMessage)
```

### 4.2 What to embed

Combine user + assistant into one text for semantic coherence:

```
User: Ravi told Mukesh to skip the morning shift at Tower B.
Assistant: I'll mark Mukesh as absent for today's morning shift at Tower B,
Site #42. This matches his assignment schedule.
[Tool: propose_mark_absent for Mukesh at Tower B]
```

**Why combined?** A semantic search for "Mukesh absent Tower B" should find both
the user's request AND the AI's action. Splitting them would require 2x embeddings
and complex result merging.

### 4.3 Embedding model

**Model:** `text-embedding-3-small` (1536 dimensions)
**Already in model-policy.ts** as `embed_general` surface.
**Cost:** ~₹0.0017 per 1K tokens → ~₹0.0005 per turn (avg ~300 tokens/turn)

Per 100 messages: ₹0.05 embedding cost. **Negligible.**

### 4.4 Text preparation

```typescript
function prepareTurnText(turn: {
  userText: string;
  assistantText: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  decisionCards: Array<Record<string, unknown>>;
}): string {
  const parts: string[] = [];

  parts.push(`User: ${turn.userText}`);
  parts.push(`Assistant: ${turn.assistantText}`);

  // Include tool call names (not full input/output — too many tokens)
  if (turn.toolCalls.length > 0) {
    const toolNames = turn.toolCalls.map((tc) => tc.name).join(', ');
    parts.push(`[Tools used: ${toolNames}]`);
  }

  // Include decision summary if present
  if (turn.decisionCards.length > 0) {
    for (const card of turn.decisionCards) {
      parts.push(`[Decision: ${card.kind} — ${card.summary ?? ''}]`);
    }
  }

  return parts.join('\n');
}
```

**Max text length for embedding: 8,000 characters** (same cap as brain-builder).
Chat turns are typically 200-500 characters, well under this limit.

### 4.5 Backfill strategy

Existing ChatMessage rows (pre-vector-DB) need embedding for the AI to access
older history. Run a one-time backfill:

```typescript
// backfill-turn-embeddings.ts (CLI script, run once)
// 1. SELECT all (user, assistant) message pairs ordered by createdAt
// 2. Batch embed in chunks of 50 (OpenAI batch API)
// 3. INSERT into turn_embeddings
// 4. Rate-limit: 3,000 RPM (OpenAI tier 3)
// Estimated: 10K existing turns → ~₹5 one-time cost
```

---

## 5. Semantic Context Assembly (the core)

This is the new function that REPLACES `loadPriorMessages` in the pre-flight
read block.

### 5.1 Function signature

```typescript
export async function assembleSemanticContext(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    supervisorId: string;
    threadId: string | null; // current active thread
    userMessage: string; // current user's message text
    topK?: number; // default 5
    recencyBonus?: number; // default 0.1
  },
): Promise<{
  priorMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  entityHints: string | null; // pre-fetched entity names for reduced tool calls
  retrievalMeta: {
    semanticTurnsRetrieved: number;
    continuityTurnsAdded: number;
    totalTokensEstimate: number;
  };
}>;
```

### 5.2 Algorithm

```
Step 1: EMBED the user's current message
  → text-embedding-3-small(userMessage)
  → queryVector (1536 dims)
  → ~50 tokens, ~₹0.0001 cost

Step 2: SEARCH turn_embeddings for semantically similar past turns
  → Cosine similarity search, filtered to (company_id, supervisor_id)
  → Top K=5, similarity threshold ≥ 0.35
  → Exclude turns from current thread's last 2 messages (loaded separately)
  → Boost decision-bearing turns: similarity * 1.15 if has_decision=true

Step 3: LOAD last 1 turn from current thread (continuity guarantee)
  → Always include the immediately previous turn regardless of relevance
  → This prevents "did you forget what I just said?" moments
  → Only 1 turn, not 10 — saves ~1,200 tokens vs current

Step 4: DEDUPLICATE and ORDER
  → Merge semantic results + continuity turn
  → Remove duplicates (same message_id)
  → Sort: semantic turns by relevance DESC, then continuity turn last
  → Cap at 6 total turns (5 semantic + 1 continuity)

Step 5: EXTRACT entity hints (optional, Phase 2)
  → From the semantic turns, extract worker names, site names, tool names
  → Format as a brief hint block: "Recent context: Mukesh (worker), Tower B (site)"
  → Injected as a system message between calendar and prior messages
  → Helps model skip find_workers calls when entity is already known

Step 6: FORMAT as priorMessages array
  → Each turn becomes 2 messages: {role:'user', content:transcript}
                                    {role:'assistant', content:response}
  → Chronological order (oldest → newest)
  → Continuity turn always last (most recent)
```

### 5.3 SQL query for semantic search

```sql
-- Semantic turn retrieval (runs inside withTenantContext)
SELECT
  te.user_message_id,
  te.assistant_message_id,
  te.combined_text,
  te.has_decision,
  te.tool_names,
  te.token_count,
  te.created_at,
  -- Cosine similarity with recency bonus
  (1 - (te.embedding <=> $1::vector))
    * CASE WHEN te.has_decision THEN 1.15 ELSE 1.0 END
    + ($4::float * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - te.created_at)) / 86400.0)))
    AS score
FROM axhy_chat.turn_embeddings te
WHERE te.company_id = $2
  AND te.supervisor_id = $3
  AND (1 - (te.embedding <=> $1::vector)) >= 0.35   -- similarity threshold
  AND te.user_message_id NOT IN ($5, $6)              -- exclude last 2 from current thread
ORDER BY score DESC
LIMIT $7;                                              -- topK
```

**Recency bonus formula:** `recencyBonus * (1 / (1 + days_ago))`.
At 0.1 bonus: today's turn gets +0.1, yesterday's gets +0.05, 7-day-old gets +0.0125.
This gently favors recent turns when semantic scores are close.

### 5.4 Token budget for Tier 5

| Component                        | Current tokens | With vector RAG |
| -------------------------------- | -------------- | --------------- |
| 10 blind turns × ~150 tok each   | ~1,500         | —               |
| 5 semantic turns × ~150 tok each | —              | ~750            |
| 1 continuity turn × ~150 tok     | —              | ~150            |
| Entity hints (Phase 2)           | —              | ~100            |
| **Tier 5 total**                 | **~1,500**     | **~1,000**      |
| **Savings per call**             | —              | **~500 tokens** |

Across 1.4 average iterations per message: ~700 tokens saved per message.
At ₹0.04/1K: ₹0.028 saved per message → ₹2.80/day for 100 messages.

Not huge alone, but combined with iteration reduction (§6) and output optimization
(§7), it reaches the target.

---

## 6. Iteration Reduction via Entity Pre-Fetch

### The problem

Today, action messages require 2+ API calls:

1. Model calls `find_workers({query: "Mukesh"})` → gets results
2. Model calls `propose_mark_absent({workerId: "..."})` → action

The find step is a pure lookup. If the model already knows Mukesh's ID from
semantic context, it can skip straight to the action.

### The solution: Entity hints in Tier 5b

When semantic turns reference specific workers/sites (via tool_names and decision
cards), extract entity IDs and inject them as a hint:

```
<recent_entity_context>
Workers recently discussed: Mukesh (id:abc123, assigned: Tower B morning),
  Suresh (id:def456, assigned: Mall C evening)
Sites recently discussed: Tower B (id:site42), Mall C (id:site99)
</recent_entity_context>
```

**~100 tokens.** The model can now call `propose_mark_absent` directly with the
worker ID, skipping `find_workers` entirely.

### Iteration reduction estimate

| Message type                                       | Current avg iterations | With entity hints |
| -------------------------------------------------- | ---------------------- | ----------------- |
| Informational ("what's Mukesh's schedule?")        | 1.0                    | 1.0 (no change)   |
| Single action ("mark Mukesh absent")               | 2.0                    | 1.0 (skip find)   |
| Multi-action ("mark Mukesh absent, reassign site") | 3.0                    | 2.0 (skip finds)  |
| Clarification needed                               | 1.0                    | 1.0 (no change)   |

**Weighted average** (est. 50% informational, 35% single-action, 10% multi, 5% clarify):

- Current: 0.5×1.0 + 0.35×2.0 + 0.10×3.0 + 0.05×1.0 = 1.55
- With hints: 0.5×1.0 + 0.35×1.0 + 0.10×2.0 + 0.05×1.0 = 1.10

**Iteration reduction: 1.55 → 1.10 (29% fewer API calls)**

---

## 7. Output Optimization

### Current: avg ~700 output tokens per call

The system prompt doesn't enforce brevity. The model often generates:

- Verbose acknowledgments ("I understand you want me to...")
- Restating the request before acting
- Over-explaining decisions

### Fix: Add conciseness directive to system prompt

```
You are a supervisor's AI assistant. Be direct and brief.
- Action responses: state what you did in 1-2 sentences, then show the decision card.
- Informational responses: answer in 2-3 sentences max.
- Never restate the supervisor's request back to them.
- Never explain how tools work. Just use them.
```

**Target: avg ~450 output tokens** (35% reduction). This is realistic — most
cleaning-company supervisor interactions are simple commands, not essays.

---

## 8. Combined Cost Math

### 8.1 Per-API-call breakdown

| Component                                          | Current                       | With RAG                      | Change      |
| -------------------------------------------------- | ----------------------------- | ----------------------------- | ----------- |
| **Cached input** (system+rules+LivingDoc+calendar) | 3,400 tok × ₹0.02/1K = ₹0.068 | Same                          | —           |
| **Dynamic input** (history+user)                   | 1,600 tok × ₹0.04/1K = ₹0.064 | 1,100 tok × ₹0.04/1K = ₹0.044 | −31%        |
| **Embedding query** (per-message, not per-call)    | ₹0                            | ₹0.0001                       | +negligible |
| **Output**                                         | 700 tok × ₹0.16/1K = ₹0.112   | 450 tok × ₹0.16/1K = ₹0.072   | −36%        |
| **Per-call total**                                 | **₹0.244**                    | **₹0.184**                    | **−25%**    |

### 8.2 Per-message breakdown (including iteration multiplier)

| Component                  | Current                | With RAG               |
| -------------------------- | ---------------------- | ---------------------- |
| Avg iterations per message | 1.55                   | 1.10                   |
| Input cost per message     | ₹0.132 × 1.55 = ₹0.205 | ₹0.112 × 1.10 = ₹0.123 |
| Output cost per message    | ₹0.112 × 1.55 = ₹0.174 | ₹0.072 × 1.10 = ₹0.079 |
| Embedding cost per message | ₹0.000                 | ₹0.001                 |
| **Total per message**      | **₹0.379**             | **₹0.203**             |

### 8.3 Daily cost for 100 messages

| Metric                     | Current   | With RAG  | Savings    |
| -------------------------- | --------- | --------- | ---------- |
| Input tokens/day           | ~204K     | ~123K     | −40%       |
| Output tokens/day          | ~109K     | ~50K      | −54%       |
| Embedding tokens/day       | 0         | ~30K      | (new)      |
| **Daily cost**             | **₹37.9** | **₹20.3** | **−46%**   |
| **Monthly cost (30 days)** | ₹1,137    | ₹609      | ₹528 saved |

### 8.4 Embedding infrastructure cost

| Item                           | Volume                   | Cost          |
| ------------------------------ | ------------------------ | ------------- |
| Turn embedding (after persist) | 100 turns/day × 300 tok  | ₹0.05/day     |
| Query embedding (per message)  | 100 queries/day × 50 tok | ₹0.009/day    |
| Backfill (one-time)            | ~10K existing turns      | ~₹5 total     |
| **Daily embedding overhead**   | —                        | **₹0.06/day** |

Embedding cost is 0.3% of total AI spend. Negligible.

### 8.5 Break-even at scale

| Supervisors | Current monthly | RAG monthly | Monthly savings |
| ----------- | --------------- | ----------- | --------------- |
| 10          | ₹11,370         | ₹6,090      | ₹5,280          |
| 50          | ₹56,850         | ₹30,450     | ₹26,400         |
| 100         | ₹1,13,700       | ₹60,900     | ₹52,800         |
| 500         | ₹5,68,500       | ₹3,04,500   | ₹2,64,000       |

At 500 supervisors: ₹2.64L/month savings. Pays for a junior engineer.

---

## 9. Integration Points

### 9.1 Where it plugs into chat.ts

```
CURRENT (chat.ts lines 760-858):
  const settled = await Promise.allSettled([
    loadPriorMessages(tx, companyId, supervisorId),  ← REPLACE THIS
    getLivingDoc(tx, companyId, supervisorId),
    loadCalendarTier3(tx, companyId, supervisorId),
    loadCompanyRules(tx, companyId),
    loadHrRules(tx, companyId),
  ]);

NEW:
  const settled = await Promise.allSettled([
    assembleSemanticContext(tx, {                     ← NEW FUNCTION
      companyId,
      supervisorId,
      threadId: activeThread?.id ?? null,
      userMessage: parsed.data.text,
    }),
    getLivingDoc(tx, companyId, supervisorId),
    loadCalendarTier3(tx, companyId, supervisorId),
    loadCompanyRules(tx, companyId),
    loadHrRules(tx, companyId),
  ]);
```

The assembleSemanticContext function returns the same shape as loadPriorMessages
(`Array<{role, content}>`), so the downstream openaiToolLoop call is unchanged.

### 9.2 Where embedding plugs into persist

```
CURRENT (chat.ts lines 1309-1333):
  const response = await persistChatTurn({...});
  await recordIdempotency(...);

NEW:
  const response = await persistChatTurn({...});
  await recordIdempotency(...);

  // Fire-and-forget: embed turn for future semantic retrieval
  embedTurnAsync({
    companyId, supervisorId,
    threadId: response.threadId,
    userMessageId: response.userMessageId,
    assistantMessageId: response.assistantMessageId,
    userText: parsed.data.text,
    assistantText: loopResult.finalText,
    toolCalls: loopResult.toolCalls,
    decisionCards: loopResult.decisionCards,
  }).catch(err => req.log.warn({ err }, 'turn embedding failed'));
```

### 9.3 New files to create

| File                                          | Purpose                                                      |
| --------------------------------------------- | ------------------------------------------------------------ |
| `lib/semantic-context.ts`                     | `assembleSemanticContext()` — the core retrieval function    |
| `lib/turn-embedder.ts`                        | `embedTurnAsync()` — fire-and-forget embedding after persist |
| `lib/entity-hint-extractor.ts`                | Extracts worker/site IDs from semantic results (Phase 2)     |
| `scripts/migrations/0020-turn-embeddings.sql` | Schema migration                                             |
| `scripts/backfill-turn-embeddings.ts`         | One-time backfill of existing ChatMessage rows               |

### 9.4 Modified files

| File                            | Change                                                                      |
| ------------------------------- | --------------------------------------------------------------------------- |
| `routes/chat.ts`                | Replace `loadPriorMessages` call with `assembleSemanticContext`             |
| `routes/chat.ts`                | Add `embedTurnAsync` after `persistChatTurn`                                |
| `routes/chat-reload-context.ts` | Same pattern (uses `loadPriorMessages` too)                                 |
| `ai-budget.ts`                  | Add `SEMANTIC_CONTEXT_TOP_K = 5` and `SEMANTIC_SIMILARITY_THRESHOLD = 0.35` |
| `server.ts`                     | No changes (embedding uses existing OpenAI client)                          |

### 9.5 openaiToolLoop changes

**None.** The tool loop receives `priorMessages` as an array — it doesn't care
whether those messages came from a blind window or semantic search. The Tier 5
slot in the message assembly is just `for (const m of args.priorMessages)`.

---

## 10. New Module: `lib/semantic-context.ts`

### 10.1 Dependencies

```typescript
import { getRedis } from './redis.js'; // Optional: cache hot query embeddings
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import pino from 'pino';

const log = pino({ name: 'semantic-context' });
```

### 10.2 Core implementation sketch

```typescript
const EMBED_MODEL = 'text-embedding-3-small';
const SIMILARITY_THRESHOLD = 0.35;
const RECENCY_BONUS = 0.1;
const DECISION_BOOST = 1.15;

export async function assembleSemanticContext(
  tx: PrismaClient,
  opts: SemanticContextOpts,
): Promise<SemanticContextResult> {
  const { companyId, supervisorId, threadId, userMessage, topK = 5 } = opts;

  // Step 1: Embed user's query
  const queryEmbedding = await embedText(userMessage);

  // Step 2: Search for relevant past turns
  const semanticTurns = await searchTurns(tx, {
    queryEmbedding,
    companyId,
    supervisorId,
    threadId,
    topK,
  });

  // Step 3: Load last 1 turn from current thread (continuity)
  const continuityTurn = await loadLastTurn(tx, companyId, supervisorId);

  // Step 4: Merge and deduplicate
  const merged = deduplicateAndOrder(semanticTurns, continuityTurn);

  // Step 5: Load actual message text for the selected turns
  const priorMessages = await hydrateTurns(tx, merged);

  // Step 6: Extract entity hints (Phase 2)
  const entityHints = extractEntityHints(semanticTurns);

  return {
    priorMessages,
    entityHints,
    retrievalMeta: {
      semanticTurnsRetrieved: semanticTurns.length,
      continuityTurnsAdded: continuityTurn ? 1 : 0,
      totalTokensEstimate: estimateTokens(priorMessages),
    },
  };
}
```

### 10.3 Graceful degradation

```typescript
// If embedding API fails → fall back to loadPriorMessages (blind window)
try {
  return await assembleSemanticContext(tx, opts);
} catch (err) {
  log.warn({ err }, 'semantic context failed, falling back to blind window');
  const fallback = await loadPriorMessages(tx, companyId, supervisorId);
  return { priorMessages: fallback, entityHints: null, retrievalMeta: { ... } };
}
```

**loadPriorMessages is NOT deleted.** It becomes the fallback path. Existing
behavior is preserved when:

- Embedding API is down
- pgvector query times out
- Supervisor has <3 historical turns (not enough data for semantic search)
- Feature flag `SEMANTIC_CONTEXT_ENABLED` is false

---

## 11. New Module: `lib/turn-embedder.ts`

### 11.1 Async embedding after persist

```typescript
const log = pino({ name: 'turn-embedder' });

export async function embedTurnAsync(input: {
  companyId: string;
  supervisorId: string;
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
  userText: string;
  assistantText: string;
  toolCalls: ReadonlyArray<{ name: string; input: Record<string, unknown> }>;
  decisionCards: ReadonlyArray<Record<string, unknown>>;
}): Promise<void> {
  const combinedText = prepareTurnText(input);
  const tokenCount = estimateTokens(combinedText);

  const embedding = await embedText(combinedText);

  await insertTurnEmbedding({
    companyId: input.companyId,
    supervisorId: input.supervisorId,
    threadId: input.threadId,
    userMessageId: input.userMessageId,
    assistantMessageId: input.assistantMessageId,
    combinedText,
    embedding,
    tokenCount,
    hasDecision: input.decisionCards.length > 0,
    hasToolCall: input.toolCalls.length > 0,
    toolNames: input.toolCalls.map((tc) => tc.name),
  });
}
```

### 11.2 Idempotency

The `UNIQUE (user_message_id)` constraint on `turn_embeddings` prevents
double-embedding. If `embedTurnAsync` is called twice for the same turn
(e.g., retry after partial failure), the second INSERT is a no-op
(`ON CONFLICT DO NOTHING`).

### 11.3 Failure handling

Embedding failure is NOT fatal. The turn is already persisted in ChatMessage.
If embedding fails:

1. Log warning with error details
2. Turn is simply not available for semantic search
3. It still appears if it's the "last 1 continuity turn" (loaded from ChatMessage)
4. Retry: a nightly sweep job re-embeds any ChatMessage pairs missing from
   turn_embeddings (Phase 2)

---

## 12. Failure Modes

| Failure                                      | Impact                              | Mitigation                                                                   |
| -------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| OpenAI embedding API down                    | Can't embed new turns or search     | Fall back to `loadPriorMessages` (blind 10-turn window)                      |
| pgvector query slow (>500ms)                 | Adds latency to chat response       | Timeout at 300ms, fall back to blind window                                  |
| turn_embeddings table empty (new supervisor) | No semantic results                 | `assembleSemanticContext` detects 0 results, returns blind window            |
| Embedding dimension mismatch                 | Query fails                         | Version-pin embedding model; migration to new model = re-embed all           |
| Railway Postgres down                        | Can't query embeddings              | Same failure as all DB queries — handled by existing circuit breaker         |
| HNSW index corruption                        | Slow or wrong results               | Monitor query latency; rebuild index if >500ms avg                           |
| Backfill incomplete                          | Old turns not searchable            | Not critical — recent turns embedded in real-time. Backfill is nice-to-have. |
| Redis down (if caching query embeddings)     | Slightly higher embedding API calls | Skip cache, embed directly. Negligible cost impact.                          |

### Degradation priority

```
Best:    Semantic context (vector RAG)
Good:    Blind 10-turn window (current behavior, loadPriorMessages)
Worst:   Empty history (if DB completely down)

Never return an error to the user due to embedding failures.
The chat must always work, with or without semantic context.
```

---

## 13. Migration Plan (phased rollout)

### Phase 1: Foundation (1 day)

1. Create migration `0020-turn-embeddings.sql` (schema + indexes)
2. Create `lib/turn-embedder.ts` (embed after persist)
3. Wire into chat.ts (fire-and-forget after persistChatTurn)
4. Run backfill script for existing ChatMessage rows
5. **Ship.** New turns are now being embedded. No retrieval yet.

### Phase 2: Semantic retrieval (1 day)

1. Create `lib/semantic-context.ts` (the core assembler)
2. Add feature flag: `SEMANTIC_CONTEXT_ENABLED` (env var, default false)
3. Replace `loadPriorMessages` with `assembleSemanticContext` behind flag
4. Keep `loadPriorMessages` as fallback
5. **Ship behind flag.**

### Phase 3: Measure + tune (2-3 days)

1. Enable flag for 1 test supervisor (founder account)
2. Monitor: response quality, latency, token usage, cache hit rate
3. Tune: similarity threshold, topK, recency bonus, decision boost
4. Add logging: `retrievalMeta` written to ChatMessage.metadata for analysis
5. Compare: blind-window turns vs semantic turns (are the semantic ones better?)

### Phase 4: Entity hints (1 day)

1. Create `lib/entity-hint-extractor.ts`
2. Add Tier 5b entity hint block to openaiToolLoop args
3. Add conciseness directive to system prompt
4. Monitor iteration count reduction

### Phase 5: Full rollout

1. Enable for all supervisors
2. Remove feature flag
3. Update ai-budget.ts constants (document new defaults)
4. Monitor daily cost dashboard for ₹20/day target

### Phase 6: Nightly sweep (post-launch)

1. Cron job: find ChatMessage pairs without matching turn_embedding row
2. Re-embed missing turns (handles embedding API failures)
3. Prune turn_embeddings older than 1 year (if needed for storage)

---

## 14. Monitoring

### 14.1 Metrics to track

| Metric                            | How                                               | Alert threshold                  |
| --------------------------------- | ------------------------------------------------- | -------------------------------- |
| Semantic query latency (p50, p95) | Timer around pgvector query                       | p95 > 300ms                      |
| Embedding API latency             | Timer around OpenAI embed call                    | p95 > 500ms                      |
| Fallback rate                     | Count of blind-window fallbacks / total           | > 5%                             |
| Avg semantic similarity score     | Log score of top-1 result                         | < 0.40 (poor retrieval quality)  |
| Turns retrieved per message       | Log `retrievalMeta.semanticTurnsRetrieved`        | Avg < 2 (not enough history)     |
| Avg iterations per message        | Existing `toolCalls.length` tracking              | > 1.5 (entity hints not working) |
| Daily input tokens per supervisor | Existing `tokensIn` sum                           | > 200K (regression)              |
| Daily cost per supervisor         | Existing `costInr` sum                            | > ₹25 (above target)             |
| Embedding backlog                 | Count of ChatMessage pairs without turn_embedding | > 100 (embedding pipeline stuck) |

### 14.2 Dashboard additions

Add to existing `ai_cost_daily` Postgres view:

- `avg_semantic_turns_retrieved` (from ChatMessage.metadata)
- `avg_iterations_per_message` (from toolCalls array length)
- `fallback_to_blind_window_count`
- `avg_semantic_query_latency_ms`

---

## 15. Testing Strategy

### 15.1 Unit tests

| Test                                     | What it verifies                                            |
| ---------------------------------------- | ----------------------------------------------------------- |
| `prepareTurnText` formats correctly      | Combined text includes user + assistant + tools + decisions |
| `deduplicateAndOrder` removes dupes      | Same message_id from semantic + continuity = 1 entry        |
| `extractEntityHints` parses tool calls   | Worker/site IDs extracted from decision cards               |
| Graceful degradation on embed failure    | Falls back to loadPriorMessages                             |
| Graceful degradation on search failure   | Falls back to loadPriorMessages                             |
| Idempotent embedding (UNIQUE constraint) | Second embed of same turn is no-op                          |

### 15.2 Integration tests (real DB + real embedding)

| Test                                         | What it verifies                                    |
| -------------------------------------------- | --------------------------------------------------- |
| Embed 3 turns, search by similar query       | Returns correct turn with highest similarity        |
| Tenant isolation                             | Supervisor A's turns not visible to Supervisor B    |
| Continuity turn always included              | Even if not semantically relevant                   |
| Decision-bearing turns boosted               | Turns with decisions rank higher at same similarity |
| Backfill script processes all existing turns | Count matches                                       |
| Cascade delete (company deletion)            | turn_embeddings rows deleted with company           |

### 15.3 Water-flow test

Full end-to-end: send 20 messages as supervisor, verify that message #21
references something from message #3 (which semantic search should retrieve
even though it's outside a 10-turn blind window).

---

## 16. GDPR/DPDP Compliance

### Data classification

`turn_embeddings.combined_text` contains @personal data (supervisor transcripts).
The embedding vector is a mathematical representation — not directly readable
but potentially reconstructible.

### Cascade delete

```sql
-- Company deletion cascades to turn_embeddings via company_id FK
ALTER TABLE axhy_chat.turn_embeddings
  ADD CONSTRAINT fk_turn_embeddings_company
  FOREIGN KEY (company_id) REFERENCES public."Company"(id) ON DELETE CASCADE;
```

### Anonymization (DPDP alternative to deletion)

If a supervisor requests data anonymization instead of deletion:

1. Replace `combined_text` with `'[anonymized]'`
2. Zero out `embedding` vector
3. Keep metadata for aggregate analytics

---

## 17. What This Design Does NOT Change

Kept exactly as-is to minimize risk:

| Component                              | Why no change                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| 6-tier prompt structure                | Preserves prefix caching                                                      |
| Tool schemas (all 10)                  | Static = cacheable, savings from dynamic selection are marginal (₹0.016/call) |
| Company rules (Tier 1)                 | Low token count (~600), always relevant, cached                               |
| HR rules (Tier 2)                      | Low token count (~600), always relevant, cached                               |
| LivingDoc (Tier 3)                     | Low token count (~500), always relevant, cached                               |
| Calendar (Tier 4)                      | Low token count (~300), already capped at 50 entries                          |
| openaiToolLoop internals               | No changes to tool handling, iteration logic, or cost tracking                |
| persistChatTurn                        | No changes to persistence (embedding is additive, fire-and-forget)            |
| Idempotency/rate-limit/circuit-breaker | No changes to any guard                                                       |

**The ONLY thing that changes in the hot path is: Tier 5 (prior messages)
comes from semantic search instead of a blind window query.**

---

## 18. Risks and Mitigations

| Risk                                                | Severity | Mitigation                                                               |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| Semantic search returns irrelevant context          | Medium   | Tunable threshold (0.35 default), fallback to blind window, A/B test     |
| pgvector HNSW index grows large (1M+ rows)          | Low      | Partition by company_id, prune >1 year, HNSW handles 1M well             |
| OpenAI embedding model deprecated                   | Medium   | Pin model version, migration script to re-embed all on new model         |
| Latency regression (embedding + search adds ~200ms) | Medium   | Parallel with other pre-flight reads (Promise.allSettled), 300ms timeout |
| Cold start (new supervisor, no history)             | Low      | <3 turns → skip semantic, use blind window                               |
| Embedding API rate limit hit                        | Low      | Current volume (~100/day/supervisor) is well under OpenAI Tier 3 limits  |

---

## 19. Decision Log

| #   | Decision                                            | Rationale                                                                        |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| D1  | Separate `axhy_chat` schema, not reuse `axhy_brain` | Different data lifecycle, tenant isolation, GDPR cascade                         |
| D2  | Embed user+assistant combined, not separate         | Single embedding captures full semantic context of the interaction               |
| D3  | Keep all 10 tool schemas static                     | Cache benefit (₹0.04/call) > dynamic selection savings (₹0.016/call)             |
| D4  | 1 continuity turn always included                   | Prevents "you just forgot what I said" — user trust is non-negotiable            |
| D5  | Fire-and-forget embedding (not blocking)            | Response latency must not increase for embedding                                 |
| D6  | Graceful degradation to blind window                | Chat must NEVER fail because of vector search issues                             |
| D7  | HNSW index (not IVFFlat)                            | Better recall at low K, no need for `nprobe` tuning                              |
| D8  | Decision-bearing turns get 1.15x boost              | Actions are more valuable context than informational chit-chat                   |
| D9  | Recency bonus formula (not hard cutoff)             | Smooth degradation: recent turns get gentle preference, old ones still findable  |
| D10 | text-embedding-3-small (not ada-002 or large)       | Already in model-policy.ts, 1536 dims matches axhy_brain, ₹0.0017/1K is cheapest |

---

## 20. Summary

| Metric                    | Before         | After                  | Change     |
| ------------------------- | -------------- | ---------------------- | ---------- |
| Input tokens per message  | ~5,000 dynamic | ~3,500 dynamic         | −30%       |
| Output tokens per message | ~700 avg       | ~450 avg               | −36%       |
| API calls per message     | ~1.55 avg      | ~1.10 avg              | −29%       |
| Cost per message          | ~₹0.38         | ~₹0.20                 | **−47%**   |
| Daily cost (100 msgs)     | ~₹38           | **~₹20**               | **−47%**   |
| History depth             | Last 10 turns  | Infinite (semantic)    | ∞          |
| New infra                 | —              | 1 table + 2 modules    | Minimal    |
| Embedding overhead        | —              | ₹0.06/day              | Negligible |
| Fallback if broken        | —              | Blind window (current) | Zero risk  |

**The self-learning AI gets BETTER (infinite memory) while costing LESS (₹20/day).**

---

## Status

- [x] Founder review — approved 2026-05-20
- [x] Locked for next coding session
- [ ] Assign to Wave A.3 (or dedicated mini-wave)
