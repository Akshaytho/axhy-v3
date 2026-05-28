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

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import pg from 'pg';

import { redact } from './redaction.js';
import { isEnabled, FEATURE_FLAGS } from './feature-flags.js';
import { autoClassify } from './auto-classifier.js';
import { splitIntoSections } from './field-fanout.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

// Brain stores ONLY constitutional docs — not code.
// Code changes every session; embedding it creates stale garbage.
// Code embedding is a future task for when the codebase is stable.
const SCAN_DIRS = ['docs'];
const SCAN_EXTS = new Set(['.md', '.prisma', '.mmd']);

// Sibling workspace: axhy-cognitive-system contains enterprise production
// standard (E1-E14), guardrail engine docs, core mind, and founder feedback
// rules. These must be in the brain for retrieval-based boot (Book Architecture).
const COG_ROOT = join(REPO_ROOT, '..', 'axhy-cognitive-system');
const COG_SCAN_DIRS = ['docs', join('memory', 'base'), join('memory', 'v3')];

// Auto-memory directory: Claude Code writes session memory and learnings here.
// Path is fixed by the harness (system prompt designates it). If unset (HOME
// unavailable) or directory missing, existsSync skips gracefully below.
const AUTO_MEMORY_DIR = process.env.HOME
  ? join(process.env.HOME, '.claude', 'projects', '-Users-thotaakshay-eclean-workspace', 'memory')
  : '';
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
    const redactedContent = isEnabled(FEATURE_FLAGS.REDACTION_STRICT_MODE)
      ? redact(content)
      : content;
    const vec = await embed(redactedContent.slice(0, 8000));
    await client.query(
      `INSERT INTO axhy_brain.chunks
       (source_path, start_line, end_line, content, content_hash, language,
        embedding, metadata, chunk_category, persona)
       VALUES ($1, 1, $2, $3, $4, $5, $6::vector, $7::jsonb, $8, $9)`,
      [
        sourcePath,
        lines.length,
        redactedContent,
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

// ─── v3: Upsert to brain_entries ────────────────────────────────────────────
//
// Uses autoClassify (type/authority/confidence/concepts with frontmatter override)
// and splitIntoSections (field-fanout behind FIELD_FANOUT_ENABLED flag).
// FTS is automatic via the content_search generated column in brain_entries.
// Supersedes old entries instead of deleting them (soft-versioning).

async function upsertEntries(
  files: string[],
): Promise<{ inserted: number; skipped: number; superseded: number; sections: number }> {
  let inserted = 0;
  let skipped = 0;
  let superseded = 0;
  let sections = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (!content.trim()) continue;
    const sourcePath = relative(REPO_ROOT, file);
    const contentHash = hashOf(content);

    // Skip if unchanged — same source_file + source_hash already active
    const existing = await client.query(
      `SELECT id FROM brain_entries WHERE source_file = $1 AND source_hash = $2 AND superseded_at_epoch IS NULL`,
      [sourcePath, contentHash],
    );
    if ((existing.rowCount ?? 0) > 0) {
      skipped++;
      continue;
    }

    // Supersede old entries for this source file (soft-version, don't delete)
    const supersedeResult = await client.query(
      `UPDATE brain_entries SET superseded_at_epoch = $1 WHERE source_file = $2 AND superseded_at_epoch IS NULL`,
      [Date.now(), sourcePath],
    );
    superseded += supersedeResult.rowCount ?? 0;

    // Classify using auto-classifier (path-based + frontmatter override)
    const classification = autoClassify(sourcePath, content);
    const redactedContent = isEnabled(FEATURE_FLAGS.REDACTION_STRICT_MODE)
      ? redact(content)
      : content;

    // Embed parent document
    const parentVec = await embed(redactedContent.slice(0, 8000));
    const parentResult = await client.query(
      `INSERT INTO brain_entries
       (kind, authority_level, confidence, type, concepts,
        source_file, source_hash, origin, title, content,
        field_type, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb,
               $6, $7, 'brain_build', $8, $9,
               'document', $10::vector, $11::jsonb)
       RETURNING id`,
      [
        classification.kind,
        classification.authority_level,
        classification.confidence,
        classification.type,
        JSON.stringify(classification.concepts),
        sourcePath,
        contentHash,
        classification.title,
        redactedContent,
        JSON.stringify(parentVec),
        '{}',
      ],
    );
    const parentId = parentResult.rows[0].id;
    inserted++;

    // Field-fanout: split into sections for more precise retrieval
    if (isEnabled(FEATURE_FLAGS.FIELD_FANOUT_ENABLED)) {
      const sectionList = splitIntoSections(redactedContent);
      // Only fanout if there are multiple sections (single-section docs are fully covered by parent)
      if (sectionList.length > 1) {
        for (const section of sectionList) {
          if (!section.content.trim()) continue;
          const sectionText = section.title
            ? `${section.title}\n\n${section.content}`
            : section.content;
          const sectionVec = await embed(sectionText.slice(0, 8000));
          await client.query(
            `INSERT INTO brain_entries
             (kind, authority_level, confidence, type, concepts,
              source_file, source_hash, origin, parent_entry_id,
              title, content, field_type, embedding, metadata)
             VALUES ($1, $2, $3, $4, $5::jsonb,
                     $6, $7, 'brain_build', $8,
                     $9, $10, 'section', $11::vector, $12::jsonb)`,
            [
              classification.kind,
              classification.authority_level,
              classification.confidence,
              classification.type,
              JSON.stringify(classification.concepts),
              sourcePath,
              contentHash,
              parentId,
              section.title,
              section.content,
              JSON.stringify(sectionVec),
              JSON.stringify({ start_line: section.startLine, end_line: section.endLine }),
            ],
          );
          sections++;
        }
      }
    }
  }

  return { inserted, skipped, superseded, sections };
}

// ─── Schema bootstrap ───────────────────────────────────────────────────────

async function ensureSchema(): Promise<void> {
  const migrationPath = join(REPO_ROOT, 'scripts/migrations/0003-brain-schema.sql');
  if (!existsSync(migrationPath)) {
    console.error('[brain] Missing 0003-brain-schema.sql — cannot bootstrap.');
    process.exit(1);
  }
  const schemaCheck = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'axhy_brain' AND table_name = 'chunks'`,
  );
  if ((schemaCheck.rowCount ?? 0) > 0) {
    console.log('[brain] Schema axhy_brain.chunks exists.');
    return;
  }
  console.log('[brain] Schema missing — bootstrapping from 0003-brain-schema.sql...');
  const sql = readFileSync(migrationPath, 'utf8');
  await client.query(sql);
  console.log('[brain] Schema created.');
}

async function ensureBrainEntriesSchema(): Promise<void> {
  const migrationPath = join(REPO_ROOT, 'scripts/migrations/0004-brain-entries-v3.sql');
  if (!existsSync(migrationPath)) {
    console.log(
      '[brain] No 0004-brain-entries-v3.sql found — brain_entries table not bootstrapped.',
    );
    return;
  }
  const check = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'brain_entries'`,
  );
  if ((check.rowCount ?? 0) > 0) {
    console.log('[brain] Table brain_entries exists.');
    return;
  }
  console.log('[brain] Bootstrapping brain_entries from 0004-brain-entries-v3.sql...');
  const sql = readFileSync(migrationPath, 'utf8');
  await client.query(sql);
  console.log('[brain] brain_entries table created.');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // ── Hard guard: prevent silent fake embeddings in production ────────────
  // Phase 0 discovery (2026-05-26): without OPENAI_API_KEY, embed() falls
  // back to PRNG vectors — random noise that makes retrieval useless.
  // This guard ensures brain:build NEVER runs with fake embeddings unless
  // explicitly opted in (e.g. unit tests via BRAIN_ALLOW_FAKE_EMBEDDINGS=true).
  if (!process.env.OPENAI_API_KEY && process.env.BRAIN_ALLOW_FAKE_EMBEDDINGS !== 'true') {
    console.error('\n[brain] ❌ FATAL: OPENAI_API_KEY is not set.');
    console.error('[brain] Without it, all embeddings will be PRNG fakes (random noise).');
    console.error('[brain] The brain will APPEAR to work but retrieval is useless.');
    console.error('[brain]');
    console.error('[brain] Correct command:');
    console.error('[brain]   export $(grep OPENAI_API_KEY apps/backend/.env.local) && \\');
    console.error('[brain]     FIELD_FANOUT_ENABLED=true railway run --service Postgres -- \\');
    console.error('[brain]     pnpm --filter @axhy/ai-tools brain:build');
    console.error('[brain]');
    console.error('[brain] To allow fake embeddings (tests only):');
    console.error('[brain]   BRAIN_ALLOW_FAKE_EMBEDDINGS=true pnpm ... brain:build\n');
    process.exit(1);
  }

  console.log('[brain] Starting brain build...');
  if (process.env.OPENAI_API_KEY) {
    console.log('[brain] ✓ OPENAI_API_KEY present — using real OpenAI embeddings');
  }
  await client.connect();
  await ensureSchema();
  await ensureBrainEntriesSchema();

  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    walk(join(REPO_ROOT, dir), allFiles);
  }

  // Include cognitive system docs if sibling workspace exists
  if (existsSync(COG_ROOT)) {
    const before = allFiles.length;
    for (const dir of COG_SCAN_DIRS) {
      const fullDir = join(COG_ROOT, dir);
      if (existsSync(fullDir)) {
        walk(fullDir, allFiles);
      }
    }
    const added = allFiles.length - before;
    if (added > 0) {
      console.log(`[brain] Found ${added} files from axhy-cognitive-system`);
    }
  }

  // Include auto-memory written by Claude Code (session feedback, learnings).
  // The path is fixed by the harness; existsSync skips gracefully when absent.
  if (AUTO_MEMORY_DIR && existsSync(AUTO_MEMORY_DIR)) {
    const before = allFiles.length;
    walk(AUTO_MEMORY_DIR, allFiles);
    const added = allFiles.length - before;
    if (added > 0) {
      console.log(`[brain] Found ${added} files from auto-memory (~/.claude/projects/...)`);
    }
  }

  console.log(`[brain] Found ${allFiles.length} indexable files`);

  // v3 path: write to brain_entries with autoClassify + field-fanout
  console.log('[brain] Step 1/3: embedding to brain_entries (v3)...');
  const v3 = await upsertEntries(allFiles);
  console.log(
    `[brain]   inserted ${v3.inserted}, unchanged ${v3.skipped}, superseded ${v3.superseded}, sections ${v3.sections}`,
  );

  // Legacy path: still write to axhy_brain.chunks for backward compat
  console.log('[brain] Step 2/3: embedding to axhy_brain.chunks (legacy)...');
  const { inserted, skipped, staled } = await upsertChunks(allFiles);
  console.log(`[brain]   inserted ${inserted}, unchanged ${skipped}, staled ${staled}`);

  console.log('[brain] Step 3/3: wiring @derives paths...');
  const wired = await wireDerivedFromPaths(allFiles);
  console.log(`[brain]   wired ${wired} derived-from relationships`);

  // brain_entries summary (v3)
  const v3Summary = await client.query(`
    SELECT
      type,
      authority_level,
      field_type,
      COUNT(*) FILTER (WHERE superseded_at_epoch IS NULL) AS active,
      COUNT(*) FILTER (WHERE superseded_at_epoch IS NOT NULL) AS superseded,
      COUNT(*) AS total
    FROM brain_entries
    GROUP BY type, authority_level, field_type
    ORDER BY type, authority_level
  `);
  console.log('\n[brain] brain_entries (v3):');
  console.log('  Type              Authority    FieldType   Active  Superseded  Total');
  for (const row of v3Summary.rows) {
    const t = (row.type as string).padEnd(18);
    const a = (row.authority_level as string).padEnd(12);
    const f = ((row.field_type as string) || '-').padEnd(10);
    console.log(
      `  ${t} ${a} ${f} ${String(row.active).padStart(6)}  ${String(row.superseded).padStart(10)}  ${String(row.total).padStart(5)}`,
    );
  }

  // Legacy chunks summary
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
  console.log('\n[brain] axhy_brain.chunks (legacy):');
  console.log('  Category             Locked  Unlocked  Stale  Total');
  for (const row of summary.rows) {
    const cat = (row.chunk_category as string).padEnd(20);
    console.log(
      `  ${cat} ${String(row.locked).padStart(6)}  ${String(row.unlocked).padStart(8)}  ${String(row.stale).padStart(5)}  ${String(row.total).padStart(5)}`,
    );
  }

  console.log('\n[brain] Done.');
  await client.end();
}

await main();
