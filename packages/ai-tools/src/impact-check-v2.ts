/**
 * @axhy/ai-tools — 3-layer impactCheck v2
 *
 * Replaces the monolithic impactCheck (vector-knowledge.ts) with a
 * token-efficient 3-layer API reading from the brain_entries table:
 *
 *   Layer 1: search()   — snippet-only results (≤200 chars), authority-filtered
 *   Layer 2: timeline() — time-ordered entries around an anchor
 *   Layer 3: get()      — full content by IDs (explicit opt-in)
 *
 * Also: activitySearch() for activity/migrated entry queries.
 *
 * Gated behind IMPACT_CHECK_V2_ENABLED feature flag.
 *
 * @derives(ADR-0022)
 */

import pg from 'pg';

import { isEnabled, FEATURE_FLAGS } from './feature-flags.js';
import { modelFor } from './model-policy.js';
import type { AuthorityLevel, BrainEntryKind, EntryType } from './brain-schema.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SearchInput = {
  query: string;
  kind?: BrainEntryKind[];
  authority_level?: AuthorityLevel[];
  include_evidence?: boolean;
  include_activity?: boolean;
  include_history?: boolean;
  type?: EntryType[];
  concepts?: string[];
  date_start?: number;
  date_end?: number;
  limit?: number;
  order_by?: 'relevance' | 'recency';
};

export type SearchResult = {
  id: string;
  title: string | null;
  type: string;
  concepts: string[];
  created_at_epoch: number;
  snippet: string;
  authority_level: string;
  confidence: string;
  score: number;
};

export type TimelineInput = {
  anchor_id: string;
  depth_before?: number;
  depth_after?: number;
  concepts?: string[];
};

export type TimelineResult = {
  id: string;
  title: string | null;
  type: string;
  concepts: string[];
  created_at_epoch: number;
  snippet: string;
  authority_level: string;
  confidence: string;
};

export type GetResult = {
  id: string;
  kind: string;
  authority_level: string;
  confidence: string;
  type: string;
  concepts: string[];
  source_file: string | null;
  source_session_id: string | null;
  origin: string;
  title: string | null;
  content: string;
  field_type: string | null;
  created_at_epoch: number;
  superseded_at_epoch: number | null;
  read_count: number;
  metadata: Record<string, unknown>;
};

export type ActivitySearchInput = {
  query: string;
  session_id?: string;
  tool_name?: string;
  date_start?: number;
  date_end?: number;
  limit?: number;
};

export type ImpactCheckV2Result = {
  hasConflicts: boolean;
  hardBlocks: SearchResult[];
  softWarnings: SearchResult[];
  staleEntries: SearchResult[];
  allRelevant: SearchResult[];
};

// ─── DB connection (lazy) ───────────────────────────────────────────────────

let _client: pg.Client | null = null;

async function getClient(): Promise<pg.Client> {
  if (_client) return _client;
  const url =
    process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.AXHY_DB_URL;
  if (!url) throw new Error('DATABASE_URL required for impact-check-v2');
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

export function setClient(client: pg.Client): void {
  _client = client;
}

// ─── Embedding ──────────────────────────────────────────────────────────────

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
    '[impact-check-v2] OPENAI_API_KEY required for real embeddings. ' +
      'Set BRAIN_ALLOW_FAKE_EMBEDDINGS=true only for tests.',
  );
}

/**
 * Report whether embeddings are real (OpenAI) or fake (PRNG test mode).
 * Surfaced in MCP responses so Claude can verify retrieval quality.
 */
export function embeddingMode(): 'real' | 'fake' {
  if (process.env.OPENAI_API_KEY) return 'real';
  if (process.env.BRAIN_ALLOW_FAKE_EMBEDDINGS === 'true') return 'fake';
  return 'fake'; // would throw on actual use, but report mode for introspection
}

// ─── Layer 1: search() ─────────────────────────────────────────────────────

const SNIPPET_LENGTH = 200;
const DEFAULT_LIMIT = 20;
const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;

export async function search(input: SearchInput): Promise<SearchResult[]> {
  const client = await getClient();
  const limit = input.limit ?? DEFAULT_LIMIT;
  const orderBy = input.order_by ?? 'relevance';

  const queryVec = await embed(input.query);
  const vecLiteral = `[${queryVec.join(',')}]`;

  const kinds: BrainEntryKind[] = input.kind ?? ['curated'];
  const authorities: AuthorityLevel[] = input.authority_level ?? ['locked', 'curated', 'candidate'];

  if (input.include_evidence) {
    if (!kinds.includes('migrated')) kinds.push('migrated');
    if (!authorities.includes('evidence')) authorities.push('evidence');
  }
  if (input.include_activity) {
    if (!kinds.includes('activity')) kinds.push('activity');
    if (!authorities.includes('activity')) authorities.push('activity');
  }

  const conditions: string[] = [];
  const params: unknown[] = [vecLiteral];
  let paramIdx = 2;

  conditions.push(`kind = ANY($${paramIdx}::text[])`);
  params.push(kinds);
  paramIdx++;

  conditions.push(`authority_level = ANY($${paramIdx}::text[])`);
  params.push(authorities);
  paramIdx++;

  if (!input.include_history) {
    conditions.push('superseded_at_epoch IS NULL');
  }

  if (input.type && input.type.length > 0) {
    conditions.push(`type = ANY($${paramIdx}::text[])`);
    params.push(input.type);
    paramIdx++;
  }

  if (input.concepts && input.concepts.length > 0) {
    conditions.push(`concepts ?| $${paramIdx}::text[]`);
    params.push(input.concepts);
    paramIdx++;
  }

  if (input.date_start != null) {
    conditions.push(`created_at_epoch >= $${paramIdx}`);
    params.push(input.date_start);
    paramIdx++;
  }

  if (input.date_end != null) {
    conditions.push(`created_at_epoch <= $${paramIdx}`);
    params.push(input.date_end);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const useHybrid = isEnabled(FEATURE_FLAGS.PG_FTS_HYBRID_ENABLED);

  let sql: string;
  if (useHybrid) {
    sql = `
      WITH scored AS (
        SELECT
          id, title, type, concepts, created_at_epoch,
          substring(content, 1, ${SNIPPET_LENGTH}) AS snippet,
          authority_level, confidence,
          (1 - (embedding <=> $1::vector)) * ${VECTOR_WEIGHT}
            + COALESCE(ts_rank(content_search, plainto_tsquery('english', $${paramIdx})), 0) * ${FTS_WEIGHT}
            AS combined_score
        FROM brain_entries
        ${whereClause}
      )
      SELECT *, combined_score AS score
      FROM scored
      ORDER BY ${orderBy === 'recency' ? 'created_at_epoch DESC' : 'combined_score DESC'}
      LIMIT $${paramIdx + 1}
    `;
    params.push(input.query);
    paramIdx++;
    params.push(limit);
  } else {
    sql = `
      SELECT
        id, title, type, concepts, created_at_epoch,
        substring(content, 1, ${SNIPPET_LENGTH}) AS snippet,
        authority_level, confidence,
        1 - (embedding <=> $1::vector) AS score
      FROM brain_entries
      ${whereClause}
      ORDER BY ${orderBy === 'recency' ? 'created_at_epoch DESC' : 'embedding <=> $1::vector ASC'}
      LIMIT $${paramIdx}
    `;
    params.push(limit);
  }

  const result = await client.query(sql, params);

  await client.query(
    `UPDATE brain_entries SET read_count = read_count + 1 WHERE id = ANY($1::uuid[])`,
    [result.rows.map((r: { id: string }) => r.id)],
  );

  return result.rows as SearchResult[];
}

// ─── Layer 2: timeline() ───────────────────────────────────────────────────

export async function timeline(input: TimelineInput): Promise<TimelineResult[]> {
  const client = await getClient();
  const depthBefore = input.depth_before ?? 5;
  const depthAfter = input.depth_after ?? 5;

  const anchorResult = await client.query(
    `SELECT created_at_epoch, concepts FROM brain_entries WHERE id = $1`,
    [input.anchor_id],
  );

  if (anchorResult.rows.length === 0) return [];

  const anchor = anchorResult.rows[0] as {
    created_at_epoch: number;
    concepts: string[];
  };

  const conceptFilter =
    input.concepts && input.concepts.length > 0 ? input.concepts : anchor.concepts;

  const params: unknown[] = [anchor.created_at_epoch, input.anchor_id];
  let paramIdx = 3;

  let conceptClause = '';
  if (conceptFilter && conceptFilter.length > 0) {
    conceptClause = `AND concepts ?| $${paramIdx}::text[]`;
    params.push(conceptFilter);
    paramIdx++;
  }

  const beforeSql = `
    SELECT id, title, type, concepts, created_at_epoch,
           substring(content, 1, ${SNIPPET_LENGTH}) AS snippet,
           authority_level, confidence
    FROM brain_entries
    WHERE created_at_epoch < $1
      AND superseded_at_epoch IS NULL
      AND id != $2
      ${conceptClause}
    ORDER BY created_at_epoch DESC
    LIMIT $${paramIdx}
  `;
  params.push(depthBefore);
  paramIdx++;

  const beforeResult = await client.query(beforeSql, params);

  const afterParams: unknown[] = [anchor.created_at_epoch, input.anchor_id];
  let afterParamIdx = 3;

  let afterConceptClause = '';
  if (conceptFilter && conceptFilter.length > 0) {
    afterConceptClause = `AND concepts ?| $${afterParamIdx}::text[]`;
    afterParams.push(conceptFilter);
    afterParamIdx++;
  }

  const afterSql = `
    SELECT id, title, type, concepts, created_at_epoch,
           substring(content, 1, ${SNIPPET_LENGTH}) AS snippet,
           authority_level, confidence
    FROM brain_entries
    WHERE created_at_epoch > $1
      AND superseded_at_epoch IS NULL
      AND id != $2
      ${afterConceptClause}
    ORDER BY created_at_epoch ASC
    LIMIT $${afterParamIdx}
  `;
  afterParams.push(depthAfter);

  const afterResult = await client.query(afterSql, afterParams);

  const combined = [
    ...(beforeResult.rows as TimelineResult[]).reverse(),
    ...(afterResult.rows as TimelineResult[]),
  ];

  return combined;
}

// ─── Layer 3: get() ─────────────────────────────────────────────────────────

export async function get(ids: string[]): Promise<GetResult[]> {
  if (ids.length === 0) return [];

  const client = await getClient();

  const result = await client.query(
    `SELECT
       id, kind, authority_level, confidence, type, concepts,
       source_file, source_session_id, origin, title, content,
       field_type, created_at_epoch, superseded_at_epoch,
       read_count, metadata
     FROM brain_entries
     WHERE id = ANY($1::uuid[])`,
    [ids],
  );

  await client.query(
    `UPDATE brain_entries SET read_count = read_count + 1 WHERE id = ANY($1::uuid[])`,
    [ids],
  );

  return result.rows as GetResult[];
}

// ─── Activity search ────────────────────────────────────────────────────────

export async function activitySearch(input: ActivitySearchInput): Promise<SearchResult[]> {
  const client = await getClient();
  const limit = input.limit ?? DEFAULT_LIMIT;

  const queryVec = await embed(input.query);
  const vecLiteral = `[${queryVec.join(',')}]`;

  const conditions: string[] = [
    `kind IN ('activity', 'migrated')`,
    `authority_level IN ('activity', 'evidence')`,
    'superseded_at_epoch IS NULL',
  ];
  const params: unknown[] = [vecLiteral];
  let paramIdx = 2;

  if (input.session_id) {
    conditions.push(`source_session_id = $${paramIdx}`);
    params.push(input.session_id);
    paramIdx++;
  }

  if (input.date_start != null) {
    conditions.push(`created_at_epoch >= $${paramIdx}`);
    params.push(input.date_start);
    paramIdx++;
  }

  if (input.date_end != null) {
    conditions.push(`created_at_epoch <= $${paramIdx}`);
    params.push(input.date_end);
    paramIdx++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const sql = `
    SELECT
      id, title, type, concepts, created_at_epoch,
      substring(content, 1, ${SNIPPET_LENGTH}) AS snippet,
      authority_level, confidence,
      1 - (embedding <=> $1::vector) AS score
    FROM brain_entries
    ${whereClause}
    ORDER BY embedding <=> $1::vector ASC
    LIMIT $${paramIdx}
  `;
  params.push(limit);

  const result = await client.query(sql, params);
  return result.rows as SearchResult[];
}

// ─── Compatibility wrapper ──────────────────────────────────────────────────

const HARD_BLOCK_AUTHORITIES = new Set<string>(['locked']);
const SOFT_WARN_AUTHORITIES = new Set<string>(['curated', 'candidate']);
const HARD_BLOCK_THRESHOLD = 0.5;
const SOFT_WARN_THRESHOLD = 0.4;

export async function impactCheckV2(changeDescription: string): Promise<ImpactCheckV2Result> {
  const allRelevant = await search({
    query: changeDescription,
    limit: 20,
  });

  const hardBlocks = allRelevant.filter(
    (r) => HARD_BLOCK_AUTHORITIES.has(r.authority_level) && r.score >= HARD_BLOCK_THRESHOLD,
  );

  const softWarnings = allRelevant.filter(
    (r) =>
      SOFT_WARN_AUTHORITIES.has(r.authority_level) &&
      !HARD_BLOCK_AUTHORITIES.has(r.authority_level) &&
      r.score >= SOFT_WARN_THRESHOLD,
  );

  const staleEntries: SearchResult[] = [];

  return {
    hasConflicts: hardBlocks.length > 0,
    hardBlocks,
    softWarnings,
    staleEntries,
    allRelevant,
  };
}

// ─── Feature flag gate ──────────────────────────────────────────────────────

export function isV2Enabled(): boolean {
  return isEnabled(FEATURE_FLAGS.IMPACT_CHECK_V2_ENABLED);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

export async function disconnect(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = null;
  }
}
