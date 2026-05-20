/**
 * Real-DB integration test: turn-embedder module
 *
 * Covers Wave A.3 Phase 1 §2.6 — 9 required test cases.
 * All DB assertions use raw SELECT (prisma.$queryRawUnsafe) since
 * embedTurnAsync returns void and the table is not in Prisma schema.
 *
 * Rules:
 *  - D8: real DB only, no DB mocks. Only allowed mock: vi.spyOn on embedText
 *    for the failure-path test.
 *  - D5: tenant isolation asserted via cross-company SELECT returning 0.
 *  - CHEAT 2: no `any` types.
 *  - Idempotency via ON CONFLICT (user_message_id) DO NOTHING.
 *
 * @derives(docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md §2.6)
 * @derives(docs/locked/vector-rag-context-assembly.md §11)
 * @derives(ADR-0004) — prisma singleton
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Row shape returned by SELECT on axhy_chat.turn_embeddings */
interface TurnEmbeddingRow {
  id: string;
  company_id: string;
  supervisor_id: string;
  thread_id: string;
  user_message_id: string;
  assistant_message_id: string;
  combined_text: string;
  token_count: number;
  has_decision: boolean;
  has_tool_call: boolean;
  tool_names: string[];
}

interface CountRow {
  count: string;
}

async function selectByUserMessageId(userMessageId: string): Promise<TurnEmbeddingRow[]> {
  return prismaRaw.$queryRawUnsafe<TurnEmbeddingRow[]>(
    `SELECT id, company_id, supervisor_id, thread_id,
            user_message_id, assistant_message_id, combined_text,
            token_count, has_decision, has_tool_call, tool_names
       FROM "axhy_chat"."turn_embeddings"
      WHERE user_message_id = $1::uuid`,
    userMessageId,
  );
}

async function countByUserMessageId(userMessageId: string): Promise<number> {
  const rows = await prismaRaw.$queryRawUnsafe<CountRow[]>(
    `SELECT COUNT(*)::text AS count
       FROM "axhy_chat"."turn_embeddings"
      WHERE user_message_id = $1::uuid`,
    userMessageId,
  );
  return parseInt(rows[0]!.count, 10);
}

async function countByCompanyId(companyId: string): Promise<number> {
  const rows = await prismaRaw.$queryRawUnsafe<CountRow[]>(
    `SELECT COUNT(*)::text AS count
       FROM "axhy_chat"."turn_embeddings"
      WHERE company_id = $1::uuid`,
    companyId,
  );
  return parseInt(rows[0]!.count, 10);
}

async function deleteByUserMessageId(userMessageId: string): Promise<void> {
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM "axhy_chat"."turn_embeddings" WHERE user_message_id = $1::uuid`,
    userMessageId,
  );
}

async function deleteByCompanyId(companyId: string): Promise<void> {
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM "axhy_chat"."turn_embeddings" WHERE company_id = $1::uuid`,
    companyId,
  );
}

/** Minimal valid EmbedTurnInput with all required fields. */
function makeInput(
  overrides: Partial<{
    companyId: string;
    supervisorId: string;
    threadId: string;
    userMessageId: string;
    assistantMessageId: string;
    userText: string;
    assistantText: string;
    toolCalls: ReadonlyArray<{ name: string; input: Record<string, unknown> }>;
    decisionCards: ReadonlyArray<{ kind?: string; summary?: string }>;
  }> = {},
) {
  return {
    companyId: overrides.companyId ?? crypto.randomUUID(),
    supervisorId: overrides.supervisorId ?? crypto.randomUUID(),
    threadId: overrides.threadId ?? crypto.randomUUID(),
    userMessageId: overrides.userMessageId ?? crypto.randomUUID(),
    assistantMessageId: overrides.assistantMessageId ?? crypto.randomUUID(),
    userText: overrides.userText ?? 'Show me attendance for today.',
    assistantText:
      overrides.assistantText !== undefined
        ? overrides.assistantText
        : "Here is today's attendance summary.",
    toolCalls: overrides.toolCalls ?? [],
    decisionCards: overrides.decisionCards ?? [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('turn-embedder', () => {
  // Track IDs to clean up after each test
  let cleanupUserMessageIds: string[] = [];
  let cleanupCompanyIds: string[] = [];

  afterEach(async () => {
    for (const id of cleanupUserMessageIds) {
      await deleteByUserMessageId(id);
    }
    for (const id of cleanupCompanyIds) {
      await deleteByCompanyId(id);
    }
    cleanupUserMessageIds = [];
    cleanupCompanyIds = [];
    vi.restoreAllMocks();
  });

  // ── Test 1: Happy path ──────────────────────────────────────────────────

  it('happy path: embeds turn and writes row with non-empty combined_text and token_count > 0', async () => {
    const { embedTurnAsync } = await import('../src/lib/turn-embedder.js');

    const input = makeInput();
    cleanupUserMessageIds.push(input.userMessageId);

    await embedTurnAsync(input);

    const rows = await selectByUserMessageId(input.userMessageId);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.combined_text.length).toBeGreaterThan(0);
    expect(row.token_count).toBeGreaterThan(0);
    expect(row.company_id).toBe(input.companyId);
    expect(row.supervisor_id).toBe(input.supervisorId);
    expect(row.user_message_id).toBe(input.userMessageId);
  });

  // ── Test 2: Idempotency ─────────────────────────────────────────────────

  it('idempotency: calling embedTurnAsync twice for same userMessageId inserts exactly 1 row', async () => {
    const { embedTurnAsync } = await import('../src/lib/turn-embedder.js');

    const input = makeInput();
    cleanupUserMessageIds.push(input.userMessageId);

    await embedTurnAsync(input);
    await embedTurnAsync(input);

    const count = await countByUserMessageId(input.userMessageId);
    expect(count).toBe(1);
  });

  // ── Test 3: Tenant isolation ────────────────────────────────────────────

  it('tenant isolation: rows for company A and B are independent; cross-company SELECT returns 0', async () => {
    const { embedTurnAsync } = await import('../src/lib/turn-embedder.js');

    const companyIdA = crypto.randomUUID();
    const companyIdB = crypto.randomUUID();
    const companyIdC = crypto.randomUUID(); // third company — no rows; used for cross-tenant assert

    cleanupCompanyIds.push(companyIdA, companyIdB);

    const inputA = makeInput({ companyId: companyIdA });
    const inputA2 = makeInput({ companyId: companyIdA });
    const inputB = makeInput({ companyId: companyIdB });

    await embedTurnAsync(inputA);
    await embedTurnAsync(inputA2);
    await embedTurnAsync(inputB);

    const countA = await countByCompanyId(companyIdA);
    const countB = await countByCompanyId(companyIdB);
    const countC = await countByCompanyId(companyIdC);

    expect(countA).toBe(2);
    expect(countB).toBe(1);
    expect(countC).toBe(0);
  });

  // ── Test 4: Decision turns flagged ──────────────────────────────────────

  it('decision turns: row has has_decision = true when decisionCards is non-empty', async () => {
    const { embedTurnAsync } = await import('../src/lib/turn-embedder.js');

    const input = makeInput({
      decisionCards: [{ kind: 'shift_change', summary: 'Move Ramesh to site B' }],
    });
    cleanupUserMessageIds.push(input.userMessageId);

    await embedTurnAsync(input);

    const rows = await selectByUserMessageId(input.userMessageId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.has_decision).toBe(true);
  });

  // ── Test 5: Tool turns flagged ──────────────────────────────────────────

  it('tool turns: row has has_tool_call = true and tool_names matches input', async () => {
    const { embedTurnAsync } = await import('../src/lib/turn-embedder.js');

    const input = makeInput({
      toolCalls: [
        { name: 'getAttendance', input: { date: '2026-05-20' } },
        { name: 'listWorkers', input: {} },
      ],
    });
    cleanupUserMessageIds.push(input.userMessageId);

    await embedTurnAsync(input);

    const rows = await selectByUserMessageId(input.userMessageId);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.has_tool_call).toBe(true);
    // tool_names is returned from Postgres as text[]; compare as sorted arrays
    expect([...row.tool_names].sort()).toEqual(['getAttendance', 'listWorkers'].sort());
  });

  // ── Test 6: Long-text truncation (pure-function, no DB) ─────────────────

  it('prepareTurnText: userText of 20000 chars is capped at 8000 chars', async () => {
    const { prepareTurnText } = await import('../src/lib/turn-embedder.js');

    const input = makeInput({ userText: 'x'.repeat(20_000) });
    const result = prepareTurnText(input);

    expect(result.length).toBe(8_000);
  });

  // ── Test 7: Empty assistant text ────────────────────────────────────────

  it('empty assistantText: embeds successfully; combined_text contains "Assistant: " suffix', async () => {
    const { embedTurnAsync } = await import('../src/lib/turn-embedder.js');

    const input = makeInput({ assistantText: '' });
    cleanupUserMessageIds.push(input.userMessageId);

    await embedTurnAsync(input);

    const rows = await selectByUserMessageId(input.userMessageId);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.combined_text).toContain('User: ');
    expect(row.combined_text).toContain('Assistant: ');
    // Assistant section exists but is empty — ends with "Assistant: " (no trailing content)
    const assistantIdx = row.combined_text.indexOf('Assistant: ');
    const afterAssistant = row.combined_text.slice(assistantIdx + 'Assistant: '.length);
    // afterAssistant is either empty or starts with a newline (tool/decision lines)
    expect(afterAssistant.trimStart().length).toBe(0);
  });

  // ── Test 8: Embed API failure ────────────────────────────────────────────

  it('embed API failure: throws OpenAIEmbeddingError and writes NO row to DB', async () => {
    const { embedTurnAsync } = await import('../src/lib/turn-embedder.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const input = makeInput();
    cleanupUserMessageIds.push(input.userMessageId);

    const spy = vi
      .spyOn(embeddingsModule, 'embedText')
      .mockRejectedValueOnce(new embeddingsModule.OpenAIEmbeddingError('mocked API failure', 500));

    let thrownError: unknown = null;
    try {
      await embedTurnAsync(input);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(embeddingsModule.OpenAIEmbeddingError);
    expect(spy).toHaveBeenCalledOnce();

    const count = await countByUserMessageId(input.userMessageId);
    expect(count).toBe(0);
  });

  // ── Test 9: Anonymization stub ──────────────────────────────────────────

  it('anonymizeTurnEmbeddings: sets combined_text to "[anonymized]" and zeroes the embedding', async () => {
    const { embedTurnAsync, anonymizeTurnEmbeddings } = await import('../src/lib/turn-embedder.js');

    const companyId = crypto.randomUUID();
    cleanupCompanyIds.push(companyId);

    const input = makeInput({ companyId });
    await embedTurnAsync(input);

    // Verify row exists before anonymization
    const beforeRows = await selectByUserMessageId(input.userMessageId);
    expect(beforeRows).toHaveLength(1);

    const rowsUpdated = await anonymizeTurnEmbeddings(companyId);
    expect(rowsUpdated).toBeGreaterThan(0);

    // Assert combined_text is replaced
    const afterRows = await selectByUserMessageId(input.userMessageId);
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0]!.combined_text).toBe('[anonymized]');

    // Assert embedding is zeroed — cast to text and check it starts with [0,0,0
    interface EmbeddingTextRow {
      embedding_text: string;
    }
    const embeddingRows = await prismaRaw.$queryRawUnsafe<EmbeddingTextRow[]>(
      `SELECT embedding::text AS embedding_text
         FROM "axhy_chat"."turn_embeddings"
        WHERE user_message_id = $1::uuid`,
      input.userMessageId,
    );
    expect(embeddingRows).toHaveLength(1);
    expect(embeddingRows[0]!.embedding_text).toMatch(/^\[0,0,0/);
  });
});
