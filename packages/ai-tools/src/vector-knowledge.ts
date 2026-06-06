/**
 * @axhy/ai-tools — Vector Knowledge System (Living Brain)
 *
 * Semantic search + impact analysis over axhy_brain.chunks — standalone
 * vector DB (separate from axhy_graph knowledge graph), with:
 *   - is_locked: founder-locked decisions that resist code changes
 *   - is_stale: unlocked chunks whose source files changed since last embed
 *   - chunk_category: architecture_lock / security_constraint / feedback_rule / etc
 *   - persona: supervisor / worker / admin / super_admin / hr / all
 *   - derived_from_paths: which code files this doc chunk relates to
 *
 * Three public surfaces:
 *   1. `vectorSearch`    — query text → top-K relevant chunks
 *   2. `impactCheck`     — proposed change → conflicting locked constraints
 *   3. `markStaleByPath` — when a file changes, stale all unlocked chunks that derive from it
 *
 * All embedding via `modelFor('embed_general')` → text-embedding-3-small (ADR-0023).
 * Uses raw `pg` client, NOT Prisma — axhy_brain is a standalone schema
 * outside Prisma's managed schemas.
 *
 * Two-tier truth system (founder-locked 2026-05-19):
 *   - Locked docs override code. Code that contradicts a locked doc is a bug.
 *   - If the lock itself is wrong: update the doc first, re-lock, THEN change code.
 *   - Unlocked docs follow code. When code changes, unlocked chunks auto-stale.
 *
 * @derives(ADR-0022) — pgvector on Railway Postgres
 * @derives(ADR-0023) — embed_general surface
 * @derives(project_hierarchical_rule_system_architecture.md)
 */

import pg from 'pg';

import { modelFor } from './model-policy.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChunkCategory =
  | 'architecture_lock'
  | 'security_constraint'
  | 'feedback_rule'
  | 'spec'
  | 'adr'
  | 'schema_invariant'
  | 'code'
  | 'doc';

export type Persona = 'supervisor' | 'worker' | 'admin' | 'super_admin' | 'hr' | 'all';

export type VectorSearchInput = {
  query: string;
  categories?: ChunkCategory[];
  personas?: Persona[];
  lockedOnly?: boolean;
  excludeStale?: boolean;
  topK?: number;
  similarityThreshold?: number;
};

export type ChunkResult = {
  id: string;
  sourcePath: string;
  content: string;
  contentHash: string;
  language: string | null;
  isLocked: boolean;
  lockedReason: string | null;
  isStale: boolean;
  chunkCategory: string;
  persona: string;
  derivedFromPaths: string[];
  similarity: number;
  metadata: Record<string, unknown>;
};

export type ImpactCheckResult = {
  hasConflicts: boolean;
  hardBlocks: ChunkResult[];
  softWarnings: ChunkResult[];
  staleChunks: ChunkResult[];
  allRelevant: ChunkResult[];
};

// ─── DB connection (lazy) ────────────────────────────────────────────────────

let _client: pg.Client | null = null;

async function getClient(): Promise<pg.Client> {
  if (_client) return _client;
  const url =
    process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.AXHY_DB_URL;
  if (!url) throw new Error('DATABASE_URL required for vector knowledge system');
  _client = new pg.Client({ connectionString: url });
  // Self-heal: a dropped connection (e.g. Railway proxy idle-close over a long
  // session) emits 'error'; with NO listener pg treats it as uncaught and kills
  // the process, and the dead client would otherwise be reused forever. Null the
  // memo so the next getClient() transparently reconnects.
  _client.on('error', () => {
    _client = null;
  });
  await _client.connect();
  return _client;
}

/**
 * Allow callers to inject a pre-connected client (e.g. from graph:build or tests).
 */
export function setClient(client: pg.Client): void {
  _client = client;
}

// ─── Embedding ───────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const policy = modelFor('embed_general');

  if (apiKey) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: policy.model, input: text, dimensions: 1536 }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]!.embedding;
  }

  // Live MCP use MUST have real embeddings. Fake PRNG embeddings produce
  // random cosine similarity (~0.08) which makes retrieval useless.
  // Only allow fake embeddings in explicit test mode.
  if (process.env.BRAIN_ALLOW_FAKE_EMBEDDINGS === 'true') {
    // Test mode: PRNG fake fallback — valid 1536-dim vectors but NO semantic meaning.
    const seed = Array.from(text).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 1e9, 7);
    let x = seed;
    const v = new Array(1536);
    for (let i = 0; i < 1536; i++) {
      x = (x * 1103515245 + 12345) % 2 ** 31;
      v[i] = (x / 2 ** 31 - 0.5) * 0.1;
    }
    const norm = Math.sqrt(v.reduce((a: number, b: number) => a + b * b, 0));
    for (let i = 0; i < 1536; i++) v[i] = v[i] / norm;
    return v;
  }

  throw new Error(
    '[vector-knowledge] OPENAI_API_KEY required for real embeddings. ' +
      'Set BRAIN_ALLOW_FAKE_EMBEDDINGS=true only for tests.',
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Semantic search over axhy_brain.chunks. Embeds the query, runs cosine
 * similarity with optional filters (category, locked-only, exclude-stale).
 */
export async function vectorSearch(input: VectorSearchInput): Promise<ChunkResult[]> {
  const client = await getClient();
  const topK = input.topK ?? 10;
  const threshold = input.similarityThreshold ?? 0.3;

  const queryVec = await embed(input.query);
  const vecLiteral = `[${queryVec.join(',')}]`;

  let whereClause = `WHERE 1 - (embedding <=> $1::vector) >= $2`;
  const params: unknown[] = [vecLiteral, threshold];
  let paramIdx = 3;

  if (input.lockedOnly) {
    whereClause += ` AND is_locked = true`;
  }

  if (input.excludeStale) {
    whereClause += ` AND is_stale = false`;
  }

  if (input.categories && input.categories.length > 0) {
    whereClause += ` AND chunk_category = ANY($${paramIdx}::text[])`;
    params.push(input.categories);
    paramIdx++;
  }

  if (input.personas && input.personas.length > 0) {
    whereClause += ` AND (persona = ANY($${paramIdx}::text[]) OR persona = 'all')`;
    params.push(input.personas);
    paramIdx++;
  }

  const sql = `
    SELECT
      id::text,
      source_path AS "sourcePath",
      content,
      content_hash AS "contentHash",
      language,
      is_locked AS "isLocked",
      locked_reason AS "lockedReason",
      is_stale AS "isStale",
      chunk_category AS "chunkCategory",
      persona,
      derived_from_paths AS "derivedFromPaths",
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM axhy_brain.chunks
    ${whereClause}
    ORDER BY embedding <=> $1::vector ASC
    LIMIT $${paramIdx}
  `;
  params.push(topK);

  const result = await client.query(sql, params);
  return result.rows as ChunkResult[];
}

// ─── Impact Check ────────────────────────────────────────────────────────────

const HARD_BLOCK_CATEGORIES = new Set<string>([
  'architecture_lock',
  'security_constraint',
  'feedback_rule',
  'schema_invariant',
]);

const SOFT_WARN_CATEGORIES = new Set<string>(['adr', 'spec']);

/**
 * Impact analysis: given a proposed change description, find all constraints
 * it might violate.
 *
 * Two-tier truth:
 *   - LOCKED chunks in hard-block categories (similarity >= 0.5) → HARD BLOCK.
 *     Code must not contradict these. If the lock is wrong, update the doc first.
 *   - Unlocked chunks in soft-warn categories (similarity >= 0.4) → SOFT WARN.
 *     Informational — the change may need these docs updated.
 *   - Stale chunks → flagged separately so the developer knows they exist but
 *     shouldn't be trusted until re-embedded.
 */
export async function impactCheck(
  changeDescription: string,
  persona?: Persona,
): Promise<ImpactCheckResult> {
  const allRelevant = await vectorSearch({
    query: changeDescription,
    topK: 20,
    similarityThreshold: 0.3,
    personas: persona ? [persona] : undefined,
  });

  const hardBlocks = allRelevant.filter(
    (r) => r.isLocked && HARD_BLOCK_CATEGORIES.has(r.chunkCategory) && r.similarity >= 0.5,
  );

  const softWarnings = allRelevant.filter(
    (r) => !r.isLocked && SOFT_WARN_CATEGORIES.has(r.chunkCategory) && r.similarity >= 0.4,
  );

  const staleChunks = allRelevant.filter((r) => r.isStale);

  return {
    hasConflicts: hardBlocks.length > 0,
    hardBlocks,
    softWarnings,
    staleChunks,
    allRelevant,
  };
}

// ─── Staleness Management ────────────────────────────────────────────────────

/**
 * When a code file changes, mark all UNLOCKED chunks that derive from it
 * as stale. Locked chunks are NEVER auto-staled — if code drifts from a
 * locked doc, that's a code bug to surface via impactCheck.
 *
 * Called by graph:build after detecting file content_hash changes.
 */
export async function markStaleByPath(filePath: string): Promise<number> {
  const client = await getClient();
  const result = await client.query(
    `UPDATE axhy_brain.chunks
     SET is_stale = true, stale_since = now(), updated_at = now()
     WHERE $1 = ANY(derived_from_paths)
       AND is_locked = false
       AND is_stale = false`,
    [filePath],
  );
  return result.rowCount ?? 0;
}

/**
 * Clear stale flag after a chunk is re-embedded with fresh content.
 */
export async function clearStale(chunkId: string): Promise<void> {
  const client = await getClient();
  await client.query(
    `UPDATE axhy_brain.chunks
     SET is_stale = false, stale_since = NULL, updated_at = now()
     WHERE id = $1::uuid`,
    [chunkId],
  );
}

// ─── Lock Management ─────────────────────────────────────────────────────────

/**
 * Lock a chunk. Locked chunks resist code changes — they're constitutional.
 */
export async function lockChunk(
  chunkId: string,
  reason: string,
  category: ChunkCategory,
): Promise<void> {
  const client = await getClient();
  await client.query(
    `UPDATE axhy_brain.chunks
     SET is_locked = true, locked_at = now(), locked_reason = $2,
         chunk_category = $3, updated_at = now()
     WHERE id = $1::uuid`,
    [chunkId, reason, category],
  );
}

/**
 * Unlock a chunk so it can be updated. After updating, re-lock with new reason.
 */
export async function unlockChunk(chunkId: string): Promise<void> {
  const client = await getClient();
  await client.query(
    `UPDATE axhy_brain.chunks
     SET is_locked = false, locked_at = NULL, locked_reason = NULL, updated_at = now()
     WHERE id = $1::uuid`,
    [chunkId],
  );
}

// ─── Derived-from Wiring ─────────────────────────────────────────────────────

/**
 * Set the derived_from_paths for a chunk. Called during graph:build when
 * provenance edges are extracted — if a doc chunk has @derives(route X),
 * the file path of route X goes into derived_from_paths.
 */
export async function setDerivedPaths(chunkId: string, paths: string[]): Promise<void> {
  const client = await getClient();
  await client.query(
    `UPDATE axhy_brain.chunks
     SET derived_from_paths = $2::text[], updated_at = now()
     WHERE id = $1::uuid`,
    [chunkId, paths],
  );
}

/**
 * Bulk-set derived_from_paths for chunks by source_path. Used during
 * graph:build provenance pass — given a doc file and the code files it
 * derives from, wire up the reverse relationship on the chunk.
 */
export async function setDerivedPathsBySource(
  docSourcePath: string,
  derivedCodePaths: string[],
): Promise<number> {
  const client = await getClient();
  const result = await client.query(
    `UPDATE axhy_brain.chunks
     SET derived_from_paths = $2::text[], updated_at = now()
     WHERE source_path = $1`,
    [docSourcePath, derivedCodePaths],
  );
  return result.rowCount ?? 0;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export async function disconnect(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = null;
  }
}
