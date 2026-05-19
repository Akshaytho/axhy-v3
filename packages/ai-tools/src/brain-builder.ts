/**
 * @axhy/ai-tools — Brain Builder
 *
 * Standalone builder for axhy_brain — the vector DB that powers impactCheck,
 * vectorSearch, and the self-reasoning protocol. No dependency on the
 * knowledge graph (axhy_graph.nodes/edges).
 *
 * What it does:
 *   1. Walk repo files (.ts, .tsx, .md, .prisma, .sql, etc.)
 *   2. Hash content — skip unchanged files
 *   3. Embed changed files into axhy_brain.chunks
 *   4. Classify chunks by path (adr, spec, architecture_lock, etc.)
 *   5. Scan @derives() annotations — wire derived_from_paths
 *   6. Auto-stale unlocked doc chunks when derived code files change
 *
 * Usage:
 *   railway run -- pnpm --filter @axhy/ai-tools brain:build
 *
 * @derives(ADR-0022) — pgvector on Railway Postgres
 * @derives(ADR-0023) — embed_general surface
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

// Brain stores ONLY constitutional docs — not code.
// Code changes every session; embedding it creates stale garbage.
// Code embedding is a future task for when the codebase is stable.
const SCAN_DIRS = ['docs'];
const SCAN_EXTS = new Set(['.md', '.prisma', '.mmd']);
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '.expo',
  '.git',
  'generated',
  'fixtures',
]);

const DERIVES_RE = /@derives\(\s*([^)]+?)\s*\)/g;

// ─── DB ─────────────────────────────────────────────────────────────────────

const url =
  process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.AXHY_DB_URL ?? '';

if (!url) {
  console.error(
    '[brain] No DATABASE_URL set. Run via: railway run -- pnpm --filter @axhy/ai-tools brain:build',
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

// ─── File walking ───────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, out);
    } else {
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      if (SCAN_EXTS.has(ext)) out.push(p);
    }
  }
  return out;
}

// ─── Embedding ──────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 1536 }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]!.embedding;
  }
  // Deterministic fake — tests work without API key
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

function hashOf(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// ─── Classification ─────────────────────────────────────────────────────────

function classifyChunk(sourcePath: string): string {
  if (/docs\/learnings\//.test(sourcePath)) return 'feedback_rule';
  if (/docs\/decisions\//.test(sourcePath)) return 'adr';
  if (/docs\/specs\//.test(sourcePath)) return 'spec';
  if (/\.prisma$/.test(sourcePath)) return 'schema_invariant';
  if (/packages\/state-machines\//.test(sourcePath)) return 'schema_invariant';
  if (/feedback_/.test(sourcePath)) return 'feedback_rule';
  if (/security/.test(sourcePath)) return 'security_constraint';
  if (/docs\/protocols\//.test(sourcePath)) return 'architecture_lock';
  if (/docs\/invariants\//.test(sourcePath)) return 'architecture_lock';
  if (/\.md$/.test(sourcePath)) return 'doc';
  return 'code';
}

function classifyPersona(sourcePath: string, content?: string): string {
  // Learning files declare their own persona in frontmatter
  if (/docs\/learnings\//.test(sourcePath) && content) {
    const m = content.match(/^---[\s\S]*?persona:\s*(\S+)[\s\S]*?---/);
    if (m) {
      const p = m[1]!.trim();
      if (['supervisor', 'worker', 'admin', 'super_admin', 'hr', 'all'].includes(p)) return p;
    }
    return 'all';
  }

  // Supervisor surface: chat, sidebar, LivingDoc, decision cards
  if (/chat-behavior/.test(sourcePath)) return 'supervisor';
  if (/chat-sidebar/.test(sourcePath)) return 'supervisor';
  if (/chat-tools/.test(sourcePath)) return 'supervisor';
  if (/chat-error/.test(sourcePath)) return 'supervisor';
  if (/chat-abuse/.test(sourcePath)) return 'supervisor';
  if (/livingdoc/.test(sourcePath)) return 'supervisor';
  if (/supervisor/.test(sourcePath) && /specs|journeys|workflows/.test(sourcePath))
    return 'supervisor';

  // Worker surface
  if (/worker/.test(sourcePath) && /specs|journeys|workflows/.test(sourcePath)) return 'worker';

  // Admin surface
  if (
    /admin/.test(sourcePath) &&
    !/super.?admin/.test(sourcePath) &&
    /specs|journeys|workflows/.test(sourcePath)
  )
    return 'admin';

  // Super admin surface
  if (/super.?admin/.test(sourcePath) && /specs|journeys|workflows/.test(sourcePath))
    return 'super_admin';

  // HR surface
  if (/\bhr\b/.test(sourcePath) && /specs|journeys|workflows/.test(sourcePath)) return 'hr';

  // Everything else is cross-cutting: security, invariants, dev standards, panel, protocol, schema
  return 'all';
}

function inferLanguage(sourcePath: string): string {
  if (sourcePath.endsWith('.prisma')) return 'prisma';
  if (sourcePath.endsWith('.md')) return 'markdown';
  if (sourcePath.endsWith('.sql')) return 'sql';
  if (sourcePath.endsWith('.mmd')) return 'mermaid';
  return 'typescript';
}

// ─── Upsert chunks ─────────────────────────────────────────────────────────

async function upsertChunks(
  files: string[],
): Promise<{ inserted: number; skipped: number; staled: number }> {
  let inserted = 0;
  let skipped = 0;
  let staled = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (!content.trim()) continue;
    const sourcePath = relative(REPO_ROOT, file);
    const lines = content.split('\n');
    const contentHash = hashOf(content);

    const existing = await client.query(
      `SELECT id FROM axhy_brain.chunks WHERE source_path = $1 AND content_hash = $2`,
      [sourcePath, contentHash],
    );
    if ((existing.rowCount ?? 0) > 0) {
      skipped++;
      continue;
    }

    // File changed — stale all UNLOCKED doc chunks that derive from this file.
    // Locked chunks are never auto-staled; impactCheck surfaces the conflict instead.
    const staleResult = await client.query(
      `UPDATE axhy_brain.chunks
       SET is_stale = true, stale_since = now(), updated_at = now()
       WHERE $1 = ANY(derived_from_paths)
         AND is_locked = false
         AND is_stale = false`,
      [sourcePath],
    );
    staled += staleResult.rowCount ?? 0;

    // Remove older unlocked versions (locked chunks stay protected)
    await client.query(
      `DELETE FROM axhy_brain.chunks WHERE source_path = $1 AND is_locked = false`,
      [sourcePath],
    );

    const category = classifyChunk(sourcePath);
    const persona = classifyPersona(sourcePath, content);
    const language = inferLanguage(sourcePath);
    const vec = await embed(content.slice(0, 8000));
    await client.query(
      `INSERT INTO axhy_brain.chunks
       (source_path, start_line, end_line, content, content_hash, language,
        embedding, metadata, chunk_category, persona)
       VALUES ($1, 1, $2, $3, $4, $5, $6::vector, $7::jsonb, $8, $9)`,
      [
        sourcePath,
        lines.length,
        content,
        contentHash,
        language,
        JSON.stringify(vec),
        '{}',
        category,
        persona,
      ],
    );
    inserted++;
  }
  return { inserted, skipped, staled };
}

// ─── @derives wiring ────────────────────────────────────────────────────────

function normalizeDerivesTarget(raw: string): { kind: string; name: string } {
  const trimmed = raw.trim();
  if (/^ADR-\d{4}$/.test(trimmed)) return { kind: 'adr', name: trimmed };
  if (/^docs\/.+\.md$/.test(trimmed)) return { kind: 'doc', name: trimmed };
  if (/^invariant:/.test(trimmed))
    return { kind: 'doc', name: `docs/invariants/${trimmed.slice('invariant:'.length)}.md` };
  return { kind: 'doc', name: trimmed };
}

async function wireDerivedFromPaths(files: string[]): Promise<number> {
  const derivesMap = new Map<string, Set<string>>();

  for (const file of files) {
    const sourcePath = relative(REPO_ROOT, file);
    const content = readFileSync(file, 'utf8');
    const re = new RegExp(DERIVES_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const target = m[1]!.trim();
      if (!derivesMap.has(target)) derivesMap.set(target, new Set());
      derivesMap.get(target)!.add(sourcePath);
    }
  }

  let wired = 0;

  for (const [target, codePaths] of derivesMap) {
    const { kind, name } = normalizeDerivesTarget(target);
    const pathsArr = Array.from(codePaths);

    let docSourcePath: string | null = null;
    if (kind === 'adr') {
      const num = name.replace('ADR-', '');
      const match = await client.query(
        `SELECT source_path FROM axhy_brain.chunks WHERE source_path LIKE $1 LIMIT 1`,
        [`docs/decisions/${num}-%`],
      );
      if ((match.rowCount ?? 0) > 0) docSourcePath = match.rows[0].source_path;
    } else {
      docSourcePath = name;
    }

    if (docSourcePath) {
      const result = await client.query(
        `UPDATE axhy_brain.chunks
         SET derived_from_paths = $2::text[], updated_at = now()
         WHERE source_path = $1
           AND derived_from_paths != $2::text[]`,
        [docSourcePath, pathsArr],
      );
      wired += result.rowCount ?? 0;
    }
  }

  return wired;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[brain] Starting brain build...');
  await client.connect();

  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    walk(join(REPO_ROOT, dir), allFiles);
  }
  console.log(`[brain] Found ${allFiles.length} indexable files`);

  console.log('[brain] Step 1/2: embedding chunks...');
  const { inserted, skipped, staled } = await upsertChunks(allFiles);
  console.log(`[brain]   inserted ${inserted}, unchanged ${skipped}, staled ${staled}`);

  console.log('[brain] Step 2/2: wiring @derives paths...');
  const wired = await wireDerivedFromPaths(allFiles);
  console.log(`[brain]   wired ${wired} derived-from relationships`);

  const summary = await client.query(`
    SELECT
      chunk_category,
      COUNT(*) FILTER (WHERE is_locked) AS locked,
      COUNT(*) FILTER (WHERE NOT is_locked) AS unlocked,
      COUNT(*) FILTER (WHERE is_stale) AS stale,
      COUNT(*) AS total
    FROM axhy_brain.chunks
    GROUP BY chunk_category
    ORDER BY chunk_category
  `);
  console.log('\n[brain] By category:');
  console.log('  Category             Locked  Unlocked  Stale  Total');
  for (const row of summary.rows) {
    const cat = (row.chunk_category as string).padEnd(20);
    console.log(
      `  ${cat} ${String(row.locked).padStart(6)}  ${String(row.unlocked).padStart(8)}  ${String(row.stale).padStart(5)}  ${String(row.total).padStart(5)}`,
    );
  }

  const personaSummary = await client.query(`
    SELECT
      persona,
      COUNT(*) FILTER (WHERE is_locked) AS locked,
      COUNT(*) AS total
    FROM axhy_brain.chunks
    GROUP BY persona
    ORDER BY persona
  `);
  console.log('\n[brain] By persona:');
  console.log('  Persona        Locked  Total');
  for (const row of personaSummary.rows) {
    const p = (row.persona as string).padEnd(14);
    console.log(`  ${p} ${String(row.locked).padStart(6)}  ${String(row.total).padStart(5)}`);
  }

  console.log('\n[brain] Done.');
  await client.end();
}

await main();
