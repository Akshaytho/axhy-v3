/**
 * Fire-and-forget embedding of a chat turn into `axhy_chat.turn_embeddings`.
 *
 * Called from chat.ts after `persistChatTurn` completes. The caller wraps
 * `embedTurnAsync(input)` in `.catch()` so embedding failures never block
 * the chat response path.
 *
 * Phase 1 scope: collect embeddings only. Retrieval (semantic search over
 * axhy_chat.turn_embeddings) is wired in Phase 2.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §11)
 * @derives(docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md §2.3)
 * @derives(ADR-0023) — modelFor / embed_general surface
 * @derives(ADR-0004) — prisma singleton
 */

import pino from 'pino';

import { prisma } from './prisma.js';
import { embedText } from './openai-embeddings.js';

const log = pino({ name: 'turn-embedder' });

/** Maximum character length of the combined_text sent to the embeddings API. */
const COMBINED_TEXT_MAX_CHARS = 8_000;

/** Rough tokens-per-character divisor (refined in Phase 3 monitoring). */
const CHARS_PER_TOKEN = 4;

/**
 * Zero vector literal for DPDP erasure: pgvector accepts a string of the
 * form '[0,0,...,0]' for vector literals in raw SQL. Generated once at
 * module load to avoid allocating 1536-element arrays on every erasure call.
 */
const ZERO_VECTOR_LITERAL = `[${new Array(1536).fill('0').join(',')}]`;

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Text preparation ────────────────────────────────────────────────────────

/**
 * Build the combined_text string that is both stored in the DB and sent to
 * the embeddings API.
 *
 * Format:
 *   User: <userText>
 *   Assistant: <assistantText>
 *   [Tools used: <name1, name2>]          (only when toolCalls is non-empty)
 *   [Decision: <kind> — <summary>]        (one line per decision card)
 *
 * Capped at COMBINED_TEXT_MAX_CHARS (8000). Truncation happens on the full
 * assembled string, not per-section, so structure is preserved as long as
 * possible.
 *
 * Exported for test reuse (Wave 2 unit tests call this directly).
 */
export function prepareTurnText(input: EmbedTurnInput): string {
  const lines: string[] = [];

  lines.push(`User: ${input.userText}`);
  lines.push(`Assistant: ${input.assistantText}`);

  if (input.toolCalls.length > 0) {
    const toolNameList = input.toolCalls.map((t) => t.name).join(', ');
    lines.push(`[Tools used: ${toolNameList}]`);
  }

  for (const card of input.decisionCards) {
    const kind = card.kind ?? 'decision';
    const summary = card.summary ?? '';
    lines.push(`[Decision: ${kind} — ${summary}]`);
  }

  const combined = lines.join('\n');
  return combined.length > COMBINED_TEXT_MAX_CHARS
    ? combined.slice(0, COMBINED_TEXT_MAX_CHARS)
    : combined;
}

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * Embed a chat turn and persist it to `axhy_chat.turn_embeddings`.
 *
 * Fire-and-forget: callers do NOT await this; they attach `.catch()` to
 * prevent unhandled-rejection noise if the embedding call fails.
 *
 * Idempotent: ON CONFLICT (user_message_id) DO NOTHING means re-delivering
 * the same turn is safe.
 *
 * No internal try/catch — errors bubble to the caller's `.catch()` handler.
 */
export async function embedTurnAsync(input: EmbedTurnInput): Promise<void> {
  const combinedText = prepareTurnText(input);
  const tokenCount = Math.ceil(combinedText.length / CHARS_PER_TOKEN);

  const embedding = await embedText(combinedText);

  const hasDecision = input.decisionCards.length > 0;
  const hasToolCall = input.toolCalls.length > 0;
  const toolNames = input.toolCalls.map((t) => t.name);
  const embeddingLiteral = `[${embedding.join(',')}]`;

  // Column order matches migration 016 exactly (D1 — schema is law).
  // Params: $1 company_id, $2 supervisor_id, $3 thread_id,
  //         $4 user_message_id, $5 assistant_message_id,
  //         $6 combined_text, $7 embedding::vector, $8 token_count,
  //         $9 has_decision, $10 has_tool_call, $11 tool_names::text[]
  //
  // Wave A.3 Phase 2.5 — RLS-aware. Migration 017 enables RLS on
  // axhy_chat.turn_embeddings with policy
  //   USING (company_id::text = current_setting('axhy.current_company_id'))
  // Since embedTurnAsync runs fire-and-forget AFTER chat.ts's
  // withTenantContext has returned, the per-connection GUC from that
  // outer scope is gone. We wrap the INSERT in its own tx that calls
  // set_config(..., true) so the GUC is set ONLY for this statement's
  // session and rolls back at tx end. Matches the withTenantContext
  // pattern at apps/backend/src/middleware/tenant-context.ts.
  // @derives(docs/locked/vector-rag-context-assembly.md §3.3)
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('axhy.current_company_id', ${input.companyId}, true)`;
    await tx.$executeRawUnsafe(
      `INSERT INTO "axhy_chat"."turn_embeddings"
         ( company_id,  supervisor_id,  thread_id,
           user_message_id,  assistant_message_id,
           combined_text,  embedding,  token_count,
           has_decision,  has_tool_call,  tool_names )
       VALUES
         ( $1::uuid, $2::uuid, $3::uuid,
           $4::uuid, $5::uuid,
           $6, $7::vector, $8,
           $9, $10, $11::text[] )
       ON CONFLICT (user_message_id) DO NOTHING`,
      input.companyId,
      input.supervisorId,
      input.threadId,
      input.userMessageId,
      input.assistantMessageId,
      combinedText,
      embeddingLiteral,
      tokenCount,
      hasDecision,
      hasToolCall,
      toolNames,
    );
  });

  log.info(
    {
      event: 'turn_embedded',
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      threadId: input.threadId,
      userMessageId: input.userMessageId,
      tokenCount,
      hasDecision,
      hasToolCall,
    },
    'turn-embedder: persisted embedding',
  );
}

// ─── DPDP erasure stub ───────────────────────────────────────────────────────

/**
 * DPDP erasure path stub (Eric Chen panel finding, Wave A.3 Phase 1 plan §2.3).
 *
 * Anonymizes all turn embeddings for a company: combined_text is replaced with
 * '[anonymized]' and the embedding is zeroed out so cosine similarity queries
 * return no meaningful results.
 *
 * Full cascade-delete FK handling lands in Phase 2. This stub satisfies the
 * DPDP right-to-erasure obligation for the embedding surface only.
 *
 * Returns the number of rows anonymized.
 */
export async function anonymizeTurnEmbeddings(companyId: string): Promise<number> {
  // RLS Option-A: migration 017's tenant_isolation policy on turn_embeddings
  // is keyed on the company GUC — a bare UPDATE under axhy_app would silently
  // match 0 rows and the DPDP erasure would no-op. Same set_config-then-execute
  // transaction pattern as the INSERT above (locked
  // vector-rag-context-assembly.md §3.3).
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('axhy.current_company_id', ${companyId}, true)`;
    return await tx.$executeRawUnsafe(
      `UPDATE "axhy_chat"."turn_embeddings"
          SET combined_text = '[anonymized]',
              embedding     = $2::vector
        WHERE company_id = $1::uuid`,
      companyId,
      ZERO_VECTOR_LITERAL,
    );
  });
  return result;
}
