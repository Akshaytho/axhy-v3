/**
 * Real-DB integration tests: semantic-context module
 *
 * Covers Wave A.3 Phase 2 — 10 required test cases.
 *
 * Rules:
 *  - D8: real DB only, no DB mocks. Only allowed mock: vi.spyOn on embedText
 *    for the API-failure and timeout tests.
 *  - D5: tenant isolation asserted (company A turns not visible to company B query).
 *  - No `any` types — unknown + narrowing used where shapes are dynamic.
 *  - All DB setup uses prismaRaw outside transactions (seed data);
 *    assembleSemanticContext receives a tx from prismaRaw.$transaction.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5)
 * @derives(docs/locked/vector-rag-context-assembly.md §6)
 * @derives(docs/locked/vector-rag-context-assembly.md §15.2)
 * @derives(ADR-0004)
 */

import { describe, it, expect, afterEach, vi, beforeEach, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// ─── Types ────────────────────────────────────────────────────────────────────

interface CountRow {
  count: string;
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

/** Insert a turn embedding row directly into axhy_chat.turn_embeddings. */
async function insertTurnEmbeddingDirect(opts: {
  companyId: string;
  supervisorId: string;
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
  combinedText: string;
  embedding: number[];
  tokenCount: number;
  hasDecision?: boolean;
  hasToolCall?: boolean;
  toolNames?: string[];
}): Promise<void> {
  const embeddingLiteral = `[${opts.embedding.join(',')}]`;
  await prismaRaw.$executeRawUnsafe(
    `INSERT INTO "axhy_chat"."turn_embeddings"
       ( company_id, supervisor_id, thread_id,
         user_message_id, assistant_message_id,
         combined_text, embedding, token_count,
         has_decision, has_tool_call, tool_names )
     VALUES
       ( $1::uuid, $2::uuid, $3::uuid,
         $4::uuid, $5::uuid,
         $6, $7::vector, $8,
         $9, $10, $11::text[] )
     ON CONFLICT (user_message_id) DO NOTHING`,
    opts.companyId,
    opts.supervisorId,
    opts.threadId,
    opts.userMessageId,
    opts.assistantMessageId,
    opts.combinedText,
    embeddingLiteral,
    opts.tokenCount,
    opts.hasDecision ?? false,
    opts.hasToolCall ?? false,
    opts.toolNames ?? [],
  );
}

/** Delete all turn_embeddings rows for a companyId. */
async function deleteTurnEmbeddingsByCompany(companyId: string): Promise<void> {
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM "axhy_chat"."turn_embeddings" WHERE company_id = $1::uuid`,
    companyId,
  );
}

/** Count turn_embeddings rows for a companyId. */
async function countTurnEmbeddingsByCompany(companyId: string): Promise<number> {
  const rows = await prismaRaw.$queryRawUnsafe<CountRow[]>(
    `SELECT COUNT(*)::text AS count FROM "axhy_chat"."turn_embeddings" WHERE company_id = $1::uuid`,
    companyId,
  );
  return parseInt(rows[0]!.count, 10);
}

/**
 * Create a minimal Company (required for Prisma FK constraints on ChatThread).
 * Uses crypto.randomUUID() for uniqueness guarantees across same-millisecond runs.
 * Returns companyId.
 */
async function createCompany(prefix: string): Promise<string> {
  const uniqueHex = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const phone = `+90${uniqueHex.replace(/[a-f]/gi, (c) => String(c.charCodeAt(0) % 10))}`;
  const company = await prismaRaw.company.create({
    data: {
      name: `sc-test-${prefix}-${uniqueHex}`,
      slug: `sc-${prefix}-${uniqueHex}`,
      ownerPhone: phone,
      ownerName: `Test Owner ${prefix}`,
    },
  });
  return company.id;
}

/**
 * Create a minimal User row.
 * Phone uses crypto.randomUUID() digits to guarantee global uniqueness across
 * parallel test runs and same-millisecond invocations.
 * Returns userId.
 */
async function createUser(prefix: string): Promise<string> {
  // Take first 10 hex digits from a UUID → always unique
  const uniqueHex = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const phone = `+91${uniqueHex.replace(/[a-f]/gi, (c) => String(c.charCodeAt(0) % 10))}`;
  const user = await prismaRaw.user.create({
    data: {
      phone,
      name: `sc-supervisor-${prefix}-${uniqueHex}`,
      locale: 'en',
    },
  });
  return user.id;
}

/** Create a ChatThread and return its id. */
async function createThread(companyId: string, supervisorId: string): Promise<string> {
  const thread = await prismaRaw.chatThread.create({
    data: { companyId, supervisorId },
  });
  return thread.id;
}

/** Create a user ChatMessage and return its id. */
async function createUserMessage(
  companyId: string,
  threadId: string,
  transcript: string,
): Promise<string> {
  const msg = await prismaRaw.chatMessage.create({
    data: { companyId, threadId, role: 'user', transcript },
  });
  return msg.id;
}

/** Create an assistant ChatMessage and return its id. */
async function createAssistantMessage(
  companyId: string,
  threadId: string,
  aiResponseText: string,
): Promise<string> {
  const msg = await prismaRaw.chatMessage.create({
    data: { companyId, threadId, role: 'assistant', aiResponseText },
  });
  return msg.id;
}

/** Cleanup: delete company and all FK-dependent rows. */
async function cleanupCompany(companyId: string): Promise<void> {
  try {
    await deleteTurnEmbeddingsByCompany(companyId);
    await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
    await prismaRaw.chatThread.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.deleteMany({ where: { id: companyId } });
  } catch {
    // Ignore cleanup errors — don't mask original test failure
  }
}

/** Cleanup: delete a user row. */
async function cleanupUser(userId: string): Promise<void> {
  try {
    await prismaRaw.user.deleteMany({ where: { id: userId } });
  } catch {
    // Ignore
  }
}

/**
 * Generate a random 1536-dimensional embedding vector.
 * Used for seeding turn_embeddings rows that won't collide with real API calls.
 */
function randomEmbedding(): number[] {
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
}

/**
 * Generate an embedding that is very similar (high cosine similarity) to a
 * given base vector by adding tiny noise.
 */
function similarEmbedding(base: number[], noise = 0.01): number[] {
  return base.map((v) => v + (Math.random() * 2 - 1) * noise);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('semantic-context', () => {
  let companyIds: string[] = [];
  let userIds: string[] = [];

  // Warm up the Prisma connection pool before the first test runs.
  // Without this, the first test (which hits the DB) can fail with
  // "Can't reach database server" due to Railway's ~1-2s connection
  // initialization time on a cold pool.
  beforeAll(async () => {
    await prismaRaw.$queryRawUnsafe<[{ one: number }]>('SELECT 1 AS one');
  });

  beforeEach(() => {
    // Ensure kill switch is unset before each test (semantic ON by default)
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    for (const id of companyIds) {
      await cleanupCompany(id);
    }
    for (const id of userIds) {
      await cleanupUser(id);
    }
    companyIds = [];
    userIds = [];
  });

  // ── Test 1: Kill switch disengaged (env unset) ───────────────────────────

  it('kill switch disengaged (unset): semantic path runs, source≠kill_switch, priorMessages from semantic/blind', async () => {
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');

    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;

    const companyId = await createCompany('t1');
    const userId = await createUser('t1');
    companyIds.push(companyId);
    userIds.push(userId);

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId: null,
        userMessage: 'test query',
      });
    });

    // Kill switch disengaged → semantic path attempted; no embeddings → falls back or returns semantic with 0 turns
    expect(result.retrievalMeta.source).not.toBe('kill_switch');
    expect(result.entityHints).toBeNull();
    expect(result.retrievalMeta.semanticTurnsRetrieved).toBe(0);
    // priorMessages is [] since no threads exist
    expect(Array.isArray(result.priorMessages)).toBe(true);
  });

  // ── Test 2: Kill switch engaged (explicit 'true') ─────────────────────────

  it("kill switch engaged ('true'): returns source=kill_switch with blind-window fallback", async () => {
    process.env.SEMANTIC_CONTEXT_KILL_SWITCH = 'true';
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');

    const companyId = await createCompany('t2');
    const userId = await createUser('t2');
    companyIds.push(companyId);
    userIds.push(userId);

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId: null,
        userMessage: 'test query',
      });
    });

    expect(result.retrievalMeta.source).toBe('kill_switch');
    expect(result.entityHints).toBeNull();
  });

  // ── Test 3: Happy path (kill switch disengaged) ───────────────────────────

  it('happy path (kill switch disengaged): embeds 3 turns, similar query returns ≥1 semantic turn', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t3');
    const userId = await createUser('t3');
    companyIds.push(companyId);
    userIds.push(userId);

    const threadId = await createThread(companyId, userId);

    // Create 3 message pairs in DB
    const userMsg1 = await createUserMessage(companyId, threadId, 'Mukesh absent today');
    const asst1 = await createAssistantMessage(companyId, threadId, 'Marked Mukesh absent.');
    const userMsg2 = await createUserMessage(companyId, threadId, 'Tower B shift status');
    const asst2 = await createAssistantMessage(companyId, threadId, 'Tower B is fully staffed.');
    const userMsg3 = await createUserMessage(companyId, threadId, 'Create leave for Suresh');
    const asst3 = await createAssistantMessage(companyId, threadId, 'Leave created for Suresh.');

    // Generate a base embedding and plant similar embeddings in turn_embeddings
    const baseEmbed = randomEmbedding();

    await insertTurnEmbeddingDirect({
      companyId,
      supervisorId: userId,
      threadId,
      userMessageId: userMsg1,
      assistantMessageId: asst1,
      combinedText: 'User: Mukesh absent today\nAssistant: Marked Mukesh absent.',
      embedding: similarEmbedding(baseEmbed, 0.005),
      tokenCount: 20,
    });
    await insertTurnEmbeddingDirect({
      companyId,
      supervisorId: userId,
      threadId,
      userMessageId: userMsg2,
      assistantMessageId: asst2,
      combinedText: 'User: Tower B shift status\nAssistant: Tower B is fully staffed.',
      embedding: similarEmbedding(baseEmbed, 0.005),
      tokenCount: 20,
    });
    // userMsg3 and asst3 are the last pair → will be excluded (last 2 IDs) or
    // loaded as continuity turn. Don't embed them so the exclusion path is clean.

    // Mock embedText to return a vector very close to baseEmbed
    const spy = vi
      .spyOn(embeddingsModule, 'embedText')
      .mockResolvedValueOnce(similarEmbedding(baseEmbed, 0.001));

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId,
        userMessage: 'attendance question',
        topK: 5,
        queryTimeoutMs: 5000,
      });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(result.retrievalMeta.source).toBe('semantic');
    expect(result.retrievalMeta.semanticTurnsRetrieved).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.priorMessages)).toBe(true);

    // Continuity turn (userMsg3) should be present in priorMessages
    const hasUserMsg3 = result.priorMessages.some((m) => m.content === 'Create leave for Suresh');
    expect(hasUserMsg3).toBe(true);

    // Cleanup DB-side rows
    await prismaRaw.chatMessage.deleteMany({
      where: { id: { in: [userMsg1, asst1, userMsg2, asst2, userMsg3, asst3] } },
    });
  });

  // ── Test 4: Tenant isolation ──────────────────────────────────────────────

  it('tenant isolation: company A turns not returned when querying as company B', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyA = await createCompany('t4a');
    const companyB = await createCompany('t4b');
    const userA = await createUser('t4a');
    const userB = await createUser('t4b');
    companyIds.push(companyA, companyB);
    userIds.push(userA, userB);

    const threadA = await createThread(companyA, userA);
    const userMsgA = await createUserMessage(companyA, threadA, 'company A secret message');
    const asstA = await createAssistantMessage(companyA, threadA, 'company A response');

    // Seed turn_embedding for company A with a distinctive embedding
    const aEmbedding = randomEmbedding();
    await insertTurnEmbeddingDirect({
      companyId: companyA,
      supervisorId: userA,
      threadId: threadA,
      userMessageId: userMsgA,
      assistantMessageId: asstA,
      combinedText: 'User: company A secret message\nAssistant: company A response',
      embedding: aEmbedding,
      tokenCount: 15,
    });

    // Create company B thread (so B has an active thread to resolve)
    await createThread(companyB, userB);

    // Query as company B using a vector almost identical to company A's embedding
    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(
      similarEmbedding(aEmbedding, 0.001),
    );

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId: companyB,
        supervisorId: userB,
        threadId: null,
        userMessage: 'tenant isolation check',
        topK: 5,
        queryTimeoutMs: 5000,
      });
    });

    // Should return semantic (flag on) or fallback, but NEVER company A's turns
    const containsCompanyAContent = result.priorMessages.some(
      (m) => m.content.includes('company A secret') || m.content.includes('company A response'),
    );
    expect(containsCompanyAContent).toBe(false);
    // Semantic turns retrieved must be 0 (company A rows filtered by company_id)
    expect(result.retrievalMeta.semanticTurnsRetrieved).toBe(0);

    await prismaRaw.chatMessage.deleteMany({
      where: { id: { in: [userMsgA, asstA] } },
    });
  });

  // ── Test 5: Empty corpus ──────────────────────────────────────────────────

  it('empty corpus: no turn_embeddings rows → returns semantic with 0 semantic turns', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t5');
    const userId = await createUser('t5');
    companyIds.push(companyId);
    userIds.push(userId);

    // No turn_embeddings rows. No threads. embedText will be called.
    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(randomEmbedding());

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId: null,
        userMessage: 'any query',
        topK: 5,
        queryTimeoutMs: 5000,
      });
    });

    // Either semantic (0 results) or could return priorMessages from blind window too
    // — both 'semantic' and 'fallback' are acceptable; what matters is 0 semantic turns.
    expect(result.retrievalMeta.semanticTurnsRetrieved).toBe(0);
    expect(Array.isArray(result.priorMessages)).toBe(true);
  });

  // ── Test 6: Embed API failure → fallback ──────────────────────────────────

  it('embed API failure: returns source=fallback, never throws', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t6');
    const userId = await createUser('t6');
    companyIds.push(companyId);
    userIds.push(userId);

    vi.spyOn(embeddingsModule, 'embedText').mockRejectedValueOnce(
      new embeddingsModule.OpenAIEmbeddingError('mocked API failure', 500),
    );

    let threw = false;
    let result: Awaited<ReturnType<typeof assembleSemanticContext>> | null = null;

    try {
      result = await prismaRaw.$transaction(async (tx) => {
        return assembleSemanticContext({
          tx,
          companyId,
          supervisorId: userId,
          threadId: null,
          userMessage: 'query that triggers embed failure',
          queryTimeoutMs: 5000,
        });
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    expect(result!.retrievalMeta.source).toBe('fallback');
    expect(result!.entityHints).toBeNull();
    expect(result!.retrievalMeta.semanticTurnsRetrieved).toBe(0);
  });

  // ── Test 7: Decision boost ────────────────────────────────────────────────

  it('decision boost: turn with has_decision=true ranks higher than similar non-decision turn', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t7');
    const userId = await createUser('t7');
    companyIds.push(companyId);
    userIds.push(userId);

    const threadId = await createThread(companyId, userId);

    // Create 4 message rows (2 pairs)
    const userMsgDecision = await createUserMessage(companyId, threadId, 'decision-bearing turn');
    const asstDecision = await createAssistantMessage(
      companyId,
      threadId,
      'Decision: swap approved.',
    );
    const userMsgPlain = await createUserMessage(companyId, threadId, 'plain turn');
    const asstPlain = await createAssistantMessage(companyId, threadId, 'Just informational.');

    // Use the same base embedding for both so their raw similarity is equal.
    // The decision boost (1.15×) should make the decision turn rank first.
    const baseEmbed = randomEmbedding();

    await insertTurnEmbeddingDirect({
      companyId,
      supervisorId: userId,
      threadId,
      userMessageId: userMsgDecision,
      assistantMessageId: asstDecision,
      combinedText: 'User: decision-bearing turn\nAssistant: Decision: swap approved.',
      embedding: baseEmbed,
      tokenCount: 15,
      hasDecision: true,
    });
    await insertTurnEmbeddingDirect({
      companyId,
      supervisorId: userId,
      threadId,
      userMessageId: userMsgPlain,
      assistantMessageId: asstPlain,
      combinedText: 'User: plain turn\nAssistant: Just informational.',
      embedding: baseEmbed,
      tokenCount: 12,
      hasDecision: false,
    });

    // Query with topK=1 so we get only the top scorer
    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(
      similarEmbedding(baseEmbed, 0.001),
    );

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId,
        userMessage: 'boost test',
        topK: 1,
        queryTimeoutMs: 5000,
      });
    });

    // The one semantic turn retrieved should be the decision-bearing one
    expect(result.retrievalMeta.source).toBe('semantic');
    expect(result.retrievalMeta.semanticTurnsRetrieved).toBe(1);

    // The decision turn's user content should appear in priorMessages
    const hasDecisionContent = result.priorMessages.some(
      (m) => m.content.includes('decision-bearing turn') || m.content.includes('Decision: swap'),
    );
    expect(hasDecisionContent).toBe(true);

    await prismaRaw.chatMessage.deleteMany({
      where: { id: { in: [userMsgDecision, asstDecision, userMsgPlain, asstPlain] } },
    });
  });

  // ── Test 8: Entity hints extraction ──────────────────────────────────────

  it('entity hints: turn with tool_names=[find_workers] → entityHints non-null with worker reference', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t8');
    const userId = await createUser('t8');
    companyIds.push(companyId);
    userIds.push(userId);

    // Create an OLDER thread with the embedded turn (find_workers tool call).
    // The NEWER thread (created after) will be the "active" thread.
    // This ensures the embedded turn is NOT in the "last 2 IDs" exclusion list
    // (those IDs come from the newer active thread).
    const olderThreadId = await createThread(companyId, userId);
    const userMsgOld = await createUserMessage(companyId, olderThreadId, 'Find worker Mukesh');
    const asstMsgOld = await createAssistantMessage(
      companyId,
      olderThreadId,
      'Found Mukesh, worker ID abc123.',
    );

    const baseEmbed = randomEmbedding();
    await insertTurnEmbeddingDirect({
      companyId,
      supervisorId: userId,
      threadId: olderThreadId,
      userMessageId: userMsgOld,
      assistantMessageId: asstMsgOld,
      combinedText:
        'User: Find worker Mukesh\nAssistant: Found Mukesh.\n[Tools used: find_workers]',
      embedding: baseEmbed,
      tokenCount: 20,
      hasToolCall: true,
      toolNames: ['find_workers'],
    });

    // Create a newer active thread so the active thread resolution picks this one.
    // Set lastMessageAt on BOTH threads explicitly so DESC ordering works reliably:
    // NULL lastMessageAt is FIRST in DESC by Postgres default (nulls first), so we
    // must set explicit timestamps.
    await prismaRaw.$executeRawUnsafe(
      `UPDATE "axhy"."ChatThread" SET "lastMessageAt" = now() - interval '1 hour' WHERE id = $1::uuid`,
      olderThreadId,
    );

    const newerThreadId = await createThread(companyId, userId);
    await prismaRaw.$executeRawUnsafe(
      `UPDATE "axhy"."ChatThread" SET "lastMessageAt" = now() WHERE id = $1::uuid`,
      newerThreadId,
    );
    const userMsgNew = await createUserMessage(companyId, newerThreadId, 'something unrelated');

    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(
      similarEmbedding(baseEmbed, 0.001),
    );

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId: null, // resolves to newerThread; olderThread turn is not excluded
        userMessage: 'worker lookup query',
        topK: 5,
        queryTimeoutMs: 5000,
      });
    });

    expect(result.retrievalMeta.source).toBe('semantic');
    expect(result.entityHints).not.toBeNull();
    expect(result.entityHints!.toLowerCase()).toContain('worker');

    await prismaRaw.chatMessage.deleteMany({
      where: { id: { in: [userMsgOld, asstMsgOld, userMsgNew] } },
    });
  });

  // ── Test 9: Continuity turn always included ───────────────────────────────

  it('continuity turn: last thread message always in priorMessages even if not semantically matched', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t9');
    const userId = await createUser('t9');
    companyIds.push(companyId);
    userIds.push(userId);

    const threadId = await createThread(companyId, userId);

    // Plant an old turn with a very distinctive embedding far from the query
    const userMsgOld = await createUserMessage(companyId, threadId, 'old turn from weeks ago');
    const asstOld = await createAssistantMessage(companyId, threadId, 'Old response.');

    // The "last turn" — not embedded, so won't appear in semantic results
    const userMsgLast = await createUserMessage(companyId, threadId, 'just said this a moment ago');
    const asstLast = await createAssistantMessage(companyId, threadId, 'Yes I heard you.');

    const queryEmbed = randomEmbedding();
    // old turn gets a very different embedding (low similarity to query)
    const distantEmbed = Array.from(
      { length: 1536 },
      () => -queryEmbed[Math.random() > 0.5 ? 0 : 1]!,
    );

    await insertTurnEmbeddingDirect({
      companyId,
      supervisorId: userId,
      threadId,
      userMessageId: userMsgOld,
      assistantMessageId: asstOld,
      combinedText: 'User: old turn from weeks ago\nAssistant: Old response.',
      embedding: distantEmbed,
      tokenCount: 10,
    });
    // userMsgLast is NOT embedded (simulates a turn not yet processed)

    // embedText returns a vector close to queryEmbed (but distantEmbed has low similarity)
    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(queryEmbed);

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId,
        userMessage: 'continuity check',
        topK: 5,
        queryTimeoutMs: 5000,
      });
    });

    expect(result.retrievalMeta.source).toBe('semantic');
    // The last turn should be in priorMessages as the continuity guarantee
    const hasLastTurn = result.priorMessages.some(
      (m) => m.content === 'just said this a moment ago' || m.content === 'Yes I heard you.',
    );
    expect(hasLastTurn).toBe(true);
    expect(result.retrievalMeta.continuityTurnsAdded).toBeGreaterThanOrEqual(1);

    await prismaRaw.chatMessage.deleteMany({
      where: { id: { in: [userMsgOld, asstOld, userMsgLast, asstLast] } },
    });
  });

  // ── Test 10: configurable timeout → fallback ─────────────────────────────

  it('query timeout: slow pgvector mock exceeding timeout → falls back to blind window', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t10');
    const userId = await createUser('t10');
    companyIds.push(companyId);
    userIds.push(userId);

    // embedText succeeds; the slow $queryRawUnsafe stub takes 500ms.
    // queryTimeoutMs=100 means the Promise.race fires at 100ms, before the 500ms stub.
    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(randomEmbedding());

    const slowTx = new Proxy(
      prismaRaw as unknown as Parameters<typeof assembleSemanticContext>[0]['tx'],
      {
        get(target, prop) {
          if (prop === '$queryRawUnsafe') {
            return async <T>(..._args: unknown[]): Promise<T> => {
              await new Promise<void>((resolve) => setTimeout(resolve, 500));
              return [] as unknown as T;
            };
          }
          return (target as unknown as Record<string | symbol, unknown>)[prop];
        },
      },
    );

    let threw = false;
    let result: Awaited<ReturnType<typeof assembleSemanticContext>> | null = null;

    try {
      result = await assembleSemanticContext({
        tx: slowTx,
        companyId,
        supervisorId: userId,
        threadId: null,
        userMessage: 'timeout test',
        queryTimeoutMs: 100, // 100ms < 500ms mock → timeout fires first
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    expect(result!.retrievalMeta.source).toBe('fallback');
    expect(result!.retrievalMeta.semanticTurnsRetrieved).toBe(0);
  });

  // ── Test 11: metrics fields populated on semantic path ───────────────────

  it('metrics fields: latencies > 0, similarity scores in range, baselineWindowTokens >= 0', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t11');
    const userId = await createUser('t11');
    companyIds.push(companyId);
    userIds.push(userId);

    const threadId = await createThread(companyId, userId);
    const userMsg = await createUserMessage(companyId, threadId, 'metrics test message');
    const asstMsg = await createAssistantMessage(companyId, threadId, 'metrics test response');

    const baseEmbed = randomEmbedding();
    await insertTurnEmbeddingDirect({
      companyId,
      supervisorId: userId,
      threadId,
      userMessageId: userMsg,
      assistantMessageId: asstMsg,
      combinedText: 'User: metrics test message\nAssistant: metrics test response',
      embedding: similarEmbedding(baseEmbed, 0.005),
      tokenCount: 15,
    });

    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(
      similarEmbedding(baseEmbed, 0.001),
    );

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId,
        userMessage: 'metrics test query',
        topK: 5,
        queryTimeoutMs: 5000,
      });
    });

    expect(result.retrievalMeta.source).toBe('semantic');
    // Latencies must be positive numbers
    expect(result.retrievalMeta.retrievalLatencyMs).toBeGreaterThan(0);
    expect(result.retrievalMeta.queryEmbeddingLatencyMs).toBeGreaterThan(0);
    // retrievalTopK and retrievalUsedK are non-negative
    expect(result.retrievalMeta.retrievalTopK).toBe(5);
    expect(result.retrievalMeta.retrievalUsedK).toBeGreaterThanOrEqual(0);
    // Similarity score range check (if rows returned)
    if (result.retrievalMeta.maxSimilarityScore !== null) {
      expect(result.retrievalMeta.maxSimilarityScore).toBeGreaterThanOrEqual(0);
      expect(result.retrievalMeta.maxSimilarityScore).toBeLessThanOrEqual(1.5); // boosted scores can exceed 1
    }
    // Baseline tokens is non-negative
    expect(result.retrievalMeta.baselineWindowTokens).toBeGreaterThanOrEqual(0);

    await prismaRaw.chatMessage.deleteMany({ where: { id: { in: [userMsg, asstMsg] } } });
  });

  // ── Test 12: semanticMiss flag ────────────────────────────────────────────

  it('semanticMiss: flag set based on maxSimilarityScore vs threshold', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t12');
    const userId = await createUser('t12');
    companyIds.push(companyId);
    userIds.push(userId);

    // No turn embeddings — empty corpus → maxSimilarityScore will be null
    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(randomEmbedding());

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId: null,
        userMessage: 'completely unrelated query with no matching turns',
        topK: 5,
        queryTimeoutMs: 5000,
      });
    });

    // When no turns exist, maxSimilarityScore is null → semanticMiss is false (not a miss, just empty)
    expect(result.retrievalMeta.semanticTurnsRetrieved).toBe(0);
    expect(result.retrievalMeta.maxSimilarityScore).toBeNull();
    expect(result.retrievalMeta.semanticMiss).toBe(false);
    // semanticMiss is only true when there ARE results but they're all below threshold
    // The threshold guard is: semanticMiss = (max !== null && max < 0.65)
    if (result.retrievalMeta.maxSimilarityScore !== null) {
      const expectedMiss = result.retrievalMeta.maxSimilarityScore < 0.65;
      expect(result.retrievalMeta.semanticMiss).toBe(expectedMiss);
    }
  });

  // ── Test 13: shadow-mode cost delta computed ──────────────────────────────

  it('shadow mode: costDeltaVsBaseline is a number (not undefined) after semantic retrieval', async () => {
    delete process.env.SEMANTIC_CONTEXT_KILL_SWITCH;
    const { assembleSemanticContext } = await import('../src/lib/semantic-context.js');
    const embeddingsModule = await import('../src/lib/openai-embeddings.js');

    const companyId = await createCompany('t13');
    const userId = await createUser('t13');
    companyIds.push(companyId);
    userIds.push(userId);

    const threadId = await createThread(companyId, userId);
    const userMsg = await createUserMessage(companyId, threadId, 'shadow mode test message');
    const asstMsg = await createAssistantMessage(companyId, threadId, 'shadow mode test response');

    const baseEmbed = randomEmbedding();
    await insertTurnEmbeddingDirect({
      companyId,
      supervisorId: userId,
      threadId,
      userMessageId: userMsg,
      assistantMessageId: asstMsg,
      combinedText: 'User: shadow mode test message\nAssistant: shadow mode test response',
      embedding: similarEmbedding(baseEmbed, 0.005),
      tokenCount: 20,
    });

    vi.spyOn(embeddingsModule, 'embedText').mockResolvedValueOnce(
      similarEmbedding(baseEmbed, 0.001),
    );

    const result = await prismaRaw.$transaction(async (tx) => {
      return assembleSemanticContext({
        tx,
        companyId,
        supervisorId: userId,
        threadId,
        userMessage: 'shadow cost delta test',
        topK: 5,
        queryTimeoutMs: 5000,
      });
    });

    expect(result.retrievalMeta.source).toBe('semantic');
    // costDeltaVsBaseline must be a finite number (never undefined or NaN)
    expect(typeof result.retrievalMeta.costDeltaVsBaseline).toBe('number');
    expect(Number.isFinite(result.retrievalMeta.costDeltaVsBaseline)).toBe(true);
    // baselineWindowTokens must also be defined
    expect(typeof result.retrievalMeta.baselineWindowTokens).toBe('number');
    expect(result.retrievalMeta.baselineWindowTokens).toBeGreaterThanOrEqual(0);
    // Verify the math: costDelta = total - baseline
    expect(result.retrievalMeta.costDeltaVsBaseline).toBe(
      result.retrievalMeta.totalTokensEstimate - result.retrievalMeta.baselineWindowTokens,
    );

    await prismaRaw.chatMessage.deleteMany({ where: { id: { in: [userMsg, asstMsg] } } });
  });
});

// ─── extractEntityHints unit tests ───────────────────────────────────────────

describe('extractEntityHints', () => {
  it('returns null when no turns have relevant tool calls', async () => {
    const { extractEntityHints } = await import('../src/lib/semantic-context.js');
    const result = extractEntityHints([]);
    expect(result).toBeNull();
  });

  it('returns worker hint when find_workers tool was used', async () => {
    const { extractEntityHints } = await import('../src/lib/semantic-context.js');
    const turn = {
      user_message_id: crypto.randomUUID(),
      assistant_message_id: crypto.randomUUID(),
      combined_text: 'User: find worker\nAssistant: Found.',
      has_decision: false,
      tool_names: ['find_workers'],
      token_count: 10,
      created_at: new Date(),
      score: 0.8,
      raw_similarity: 0.8,
    };
    const result = extractEntityHints([turn]);
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain('worker');
  });

  it('returns site hint when find_sites tool was used', async () => {
    const { extractEntityHints } = await import('../src/lib/semantic-context.js');
    const turn = {
      user_message_id: crypto.randomUUID(),
      assistant_message_id: crypto.randomUUID(),
      combined_text: 'User: find site\nAssistant: Found.',
      has_decision: false,
      tool_names: ['find_sites'],
      token_count: 10,
      created_at: new Date(),
      score: 0.75,
      raw_similarity: 0.75,
    };
    const result = extractEntityHints([turn]);
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain('site');
  });

  it('returns both hints when both tools were used across turns', async () => {
    const { extractEntityHints } = await import('../src/lib/semantic-context.js');
    const turns = [
      {
        user_message_id: crypto.randomUUID(),
        assistant_message_id: crypto.randomUUID(),
        combined_text: 'turn 1',
        has_decision: false,
        tool_names: ['find_workers'],
        token_count: 10,
        created_at: new Date(),
        score: 0.9,
        raw_similarity: 0.9,
      },
      {
        user_message_id: crypto.randomUUID(),
        assistant_message_id: crypto.randomUUID(),
        combined_text: 'turn 2',
        has_decision: true,
        tool_names: ['find_sites', 'propose_mark_absent'],
        token_count: 15,
        created_at: new Date(),
        score: 0.85,
        raw_similarity: 0.85,
      },
    ];
    const result = extractEntityHints(turns);
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain('worker');
    expect(result!.toLowerCase()).toContain('site');
  });
});
