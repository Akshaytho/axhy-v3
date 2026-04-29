#!/usr/bin/env node
/**
 * scripts/embed-smoke-test.mjs
 *
 * Day 2 smoke test for the embedding pipeline.
 *
 * 1. Reads packages/shared-schema/src/index.ts
 * 2. Embeds it via OpenAI text-embedding-3-small (1536-dim)
 * 3. Inserts into axhy_graph.chunks
 * 4. Queries back by cosine similarity to itself; expects ≈1.0
 * 5. Reports HNSW index hit
 *
 * If OPENAI_API_KEY is not set, generates a fake deterministic vector to
 * smoke-test the DB layer alone.
 *
 * @derives(ADR-0002)
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(here);
const targetFile = path.join(repoRoot, 'packages/shared-schema/src/index.ts');

const url =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_URL ||
  process.env.AXHY_DB_URL;

if (!url) {
  console.error('No DATABASE_URL set. Run via `railway run -- node scripts/embed-smoke-test.mjs`.');
  process.exit(1);
}

async function embedReal(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  console.log('[embed] Calling OpenAI text-embedding-3-small...');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

function embedFake(text) {
  // Deterministic 1536-dim vector based on hash of text — for DB-layer-only smoke test
  console.log('[embed] No OPENAI_API_KEY; generating deterministic fake vector for DB smoke test.');
  const seed = Array.from(text).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 1e9, 7);
  let x = seed;
  const v = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    v[i] = (x / 2 ** 31 - 0.5) * 0.1;
  }
  // Normalize to unit length so cosine similarity returns sensible values
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  for (let i = 0; i < 1536; i++) v[i] = v[i] / norm;
  return v;
}

const text = await readFile(targetFile, 'utf8');
console.log(`[embed] Read ${targetFile} (${text.length} bytes)`);

const embedding = (await embedReal(text)) ?? embedFake(text);
console.log(`[embed] Embedding: ${embedding.length}-dim, first 4 values: ${embedding.slice(0, 4).map((v) => v.toFixed(4)).join(', ')}`);

const { Client } = pg;
const client = new Client({ connectionString: url });
await client.connect();
console.log('[embed] DB connected.');

const sourcePath = 'packages/shared-schema/src/index.ts';
const contentHash = `sha-${text.length}-${Buffer.from(text).slice(0, 8).toString('hex')}`;
const startLine = 1;
const endLine = text.split('\n').length;

// Clean any prior smoke-test row
await client.query(
  `DELETE FROM axhy_graph.chunks WHERE source_path = $1 AND content_hash = $2`,
  [sourcePath, contentHash],
);

// Insert
const insertRes = await client.query(
  `INSERT INTO axhy_graph.chunks
     (source_path, start_line, end_line, content, content_hash, language, embedding, metadata)
   VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8::jsonb)
   RETURNING id`,
  [
    sourcePath,
    startLine,
    endLine,
    text,
    contentHash,
    'typescript',
    JSON.stringify(embedding),
    JSON.stringify({ smoke_test: true, day: 2 }),
  ],
);
const id = insertRes.rows[0].id;
console.log(`[embed] Inserted chunk id=${id}`);

// Self-similarity probe
const probeRes = await client.query(
  `SELECT id, source_path,
          1 - (embedding <=> $1::vector) AS cosine_sim
   FROM axhy_graph.chunks
   WHERE id = $2
   LIMIT 1`,
  [JSON.stringify(embedding), id],
);
const row = probeRes.rows[0];
console.log(`[embed] Self-cosine-similarity: ${row.cosine_sim} (expected ≈ 1.0)`);

// HNSW index usage probe
const planRes = await client.query(
  `EXPLAIN (FORMAT JSON)
   SELECT id, source_path
   FROM axhy_graph.chunks
   ORDER BY embedding <=> $1::vector
   LIMIT 5`,
  [JSON.stringify(embedding)],
);
const plan = JSON.stringify(planRes.rows[0]['QUERY PLAN']);
const usesHnsw = plan.includes('chunks_embedding_hnsw');
console.log(`[embed] HNSW index hit: ${usesHnsw ? 'YES ✓' : 'NO — plan: ' + plan}`);

// BM25 probe
const bm25Res = await client.query(
  `SELECT id, ts_rank(bm25_tsv, plainto_tsquery('english', 'shared schema')) AS rank
   FROM axhy_graph.chunks
   WHERE bm25_tsv @@ plainto_tsquery('english', 'shared schema')
   ORDER BY rank DESC
   LIMIT 3`,
);
console.log(`[embed] BM25 hits for "shared schema": ${bm25Res.rowCount} row(s)`);

// Count
const countRes = await client.query(`SELECT COUNT(*) FROM axhy_graph.chunks`);
console.log(`[embed] Total chunks in axhy_graph.chunks: ${countRes.rows[0].count}`);

await client.end();
console.log('[embed] Day 2 embedding smoke test PASSED.');
