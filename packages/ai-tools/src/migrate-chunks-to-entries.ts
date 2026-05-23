/**
 * @axhy/ai-tools — Migrate axhy_brain.chunks → brain_entries
 *
 * One-time migration of curated doc embeddings from the old brain table
 * to the new authority-aware brain_entries table.
 *
 * Usage:
 *   railway run --service Postgres -- pnpm --filter @axhy/ai-tools brain:migrate
 *
 * Supports --dry-run (default) and --execute modes.
 * Old table is NEVER touched — no deletes, no drops.
 *
 * @derives(docs/superpowers/specs/2026-05-24-axhy-cognitive-system-v3.md)
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { classifyByPath, extractTitle, extractConcepts } from './brain-schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

const url =
  process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.AXHY_DB_URL ?? '';

if (!url) {
  console.error('[migrate] No DATABASE_URL set.');
  process.exit(1);
}

const isDryRun = !process.argv.includes('--execute');

async function ensureBrainEntriesTable(client: pg.Client): Promise<void> {
  const check = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brain_entries'`,
  );
  if ((check.rowCount ?? 0) > 0) {
    console.log('[migrate] brain_entries table exists.');
    return;
  }

  const migrationPath = join(REPO_ROOT, 'scripts/migrations/0004-brain-entries-v3.sql');
  if (!existsSync(migrationPath)) {
    console.error('[migrate] Missing 0004-brain-entries-v3.sql');
    process.exit(1);
  }
  console.log('[migrate] Creating brain_entries table...');
  const sql = readFileSync(migrationPath, 'utf8');
  await client.query(sql);
  console.log('[migrate] brain_entries table created.');
}

type OldChunk = {
  id: string;
  source_path: string;
  content: string;
  content_hash: string;
  language: string | null;
  embedding: string;
  is_locked: boolean;
  locked_reason: string | null;
  chunk_category: string;
  persona: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

function mapChunkToEntry(chunk: OldChunk) {
  const classification = classifyByPath(chunk.source_path);

  if (chunk.is_locked) {
    classification.authority_level = 'locked';
    classification.confidence = 'high';
  }

  const title = extractTitle(chunk.content);
  const concepts = extractConcepts(chunk.source_path, chunk.content);

  return {
    kind: classification.kind,
    authority_level: classification.authority_level,
    confidence: classification.confidence,
    type: classification.type,
    concepts: JSON.stringify(concepts),
    source_file: chunk.source_path,
    source_hash: chunk.content_hash,
    origin: 'brain_build' as const,
    title,
    content: chunk.content,
    field_type: 'document' as const,
    embedding: chunk.embedding,
    created_at_epoch: chunk.created_at.getTime(),
    metadata: JSON.stringify({
      migrated_from: 'axhy_brain.chunks',
      old_chunk_id: chunk.id,
      old_category: chunk.chunk_category,
      old_persona: chunk.persona,
      old_language: chunk.language,
      old_locked_reason: chunk.locked_reason,
      ...(typeof chunk.metadata === 'object' ? chunk.metadata : {}),
    }),
  };
}

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  console.log(`[migrate] Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);

  const oldCountResult = await client.query(`SELECT COUNT(*) AS cnt FROM axhy_brain.chunks`);
  const oldCount = parseInt(oldCountResult.rows[0].cnt, 10);
  console.log(`[migrate] Old table axhy_brain.chunks: ${oldCount} rows`);

  if (oldCount === 0) {
    console.log('[migrate] Nothing to migrate.');
    await client.end();
    return;
  }

  await ensureBrainEntriesTable(client);

  const existingResult = await client.query(
    `SELECT COUNT(*) AS cnt FROM brain_entries WHERE metadata->>'migrated_from' = 'axhy_brain.chunks'`,
  );
  const existingMigrated = parseInt(existingResult.rows[0].cnt, 10);
  if (existingMigrated > 0) {
    console.log(
      `[migrate] Found ${existingMigrated} already-migrated rows. Skipping to avoid duplicates.`,
    );
    console.log(
      `[migrate] To re-run: DELETE FROM brain_entries WHERE metadata->>'migrated_from' = 'axhy_brain.chunks';`,
    );
    await client.end();
    return;
  }

  const chunks = await client.query<OldChunk>(
    `SELECT id::text, source_path, content, content_hash, language,
            embedding::text, is_locked, locked_reason, chunk_category, persona,
            metadata, created_at
     FROM axhy_brain.chunks
     ORDER BY created_at`,
  );

  console.log(`[migrate] Processing ${chunks.rows.length} chunks...`);

  const entries = chunks.rows.map(mapChunkToEntry);

  const byAuthority: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const e of entries) {
    byAuthority[e.authority_level] = (byAuthority[e.authority_level] ?? 0) + 1;
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }

  console.log('\n[migrate] Authority distribution:');
  for (const [k, v] of Object.entries(byAuthority).sort()) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }

  console.log('\n[migrate] Type distribution:');
  for (const [k, v] of Object.entries(byType).sort()) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }

  console.log(`\n[migrate] Sample entries (first 3):`);
  for (const e of entries.slice(0, 3)) {
    console.log(
      `  ${e.source_file} → kind=${e.kind} authority=${e.authority_level} type=${e.type} concepts=${e.concepts}`,
    );
  }

  if (isDryRun) {
    console.log(`\n[migrate] DRY RUN complete. ${entries.length} entries would be inserted.`);
    console.log('[migrate] Run with --execute to perform the migration.');
    await client.end();
    return;
  }

  console.log(`\n[migrate] Inserting ${entries.length} entries...`);
  let inserted = 0;

  for (const e of entries) {
    await client.query(
      `INSERT INTO brain_entries
       (kind, authority_level, confidence, type, concepts, source_file,
        source_hash, origin, title, content, field_type, embedding,
        created_at_epoch, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11,
               $12::vector, $13, $14::jsonb)`,
      [
        e.kind,
        e.authority_level,
        e.confidence,
        e.type,
        e.concepts,
        e.source_file,
        e.source_hash,
        e.origin,
        e.title,
        e.content,
        e.field_type,
        e.embedding,
        e.created_at_epoch,
        e.metadata,
      ],
    );
    inserted++;
  }

  const newCountResult = await client.query(`SELECT COUNT(*) AS cnt FROM brain_entries`);
  const newCount = parseInt(newCountResult.rows[0].cnt, 10);

  console.log(`\n[migrate] Inserted: ${inserted}`);
  console.log(`[migrate] brain_entries total: ${newCount}`);
  console.log(`[migrate] axhy_brain.chunks (unchanged): ${oldCount}`);

  if (inserted !== oldCount) {
    console.warn(`[migrate] WARNING: inserted (${inserted}) != old count (${oldCount})`);
  } else {
    console.log('[migrate] Row count matches. Migration successful.');
  }

  console.log('\n[migrate] Old table axhy_brain.chunks preserved (7-day rollback window).');
  console.log(
    "[migrate] Rollback: DELETE FROM brain_entries WHERE metadata->>'migrated_from' = 'axhy_brain.chunks';",
  );

  await client.end();
}

await main();
