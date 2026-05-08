/**
 * @axhy/knowledge-graph — minimal builder
 *
 * Walks the repo, populates axhy_graph in Postgres:
 *   1. SEMANTIC graph: every .ts/.tsx/.md/.prisma file → chunked → embedded → axhy_graph.chunks
 *   2. STRUCTURAL graph: extract entities from Prisma + state-machine names from XState files → axhy_graph.nodes/edges
 *   3. PROVENANCE graph: extract @derives(ADR-NNNN) annotations → axhy_graph.edges (DERIVES_FROM)
 *
 * Idempotent — running twice produces same state. Only re-embeds chunks whose
 * content_hash changed since last run.
 *
 * Real OpenAI embedding when OPENAI_API_KEY is set; deterministic fake vector
 * otherwise (so DB schema + indices stay tested without ongoing API spend).
 *
 * @derives(ADR-0002)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import pg from 'pg';

import { extractComponents } from './extractors/components.js';
import { extractFastifyRoutes } from './extractors/fastify-routes.js';
import { extractNextjsRoutes } from './extractors/nextjs-routes.js';
import { extractPrismaFields } from './extractors/prisma-fields.js';
import { extractScreens } from './extractors/screens.js';
import { extractXStateTransitions } from './extractors/xstate-transitions.js';
import { extractReadsWrites } from './extractors/edges-reads-writes.js';
import { extractMounts } from './extractors/edges-mounts.js';
import { extractMirrors } from './extractors/edges-mirrors.js';
import { extractNavigatesTo } from './extractors/edges-navigates-to.js';
import { extractTriggers } from './extractors/edges-triggers.js';
import type { EdgeRecord, ExtractorOutput, NodeRecord } from './extractors/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

const SCAN_DIRS = ['apps', 'packages', 'docs', 'scripts', 'tools', 'tests'];
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.md', '.prisma', '.sql', '.mmd']);
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '.expo',
  '.git',
  'generated',
  // Phase-3 fold-in fix: exclude test fixture files from structural graph extraction.
  // They are synthetic stubs and pollute the graph with false api_endpoint/entity/state nodes.
  'fixtures',
]);

const DERIVES_RE = /@derives\(\s*([^)]+?)\s*\)/g;
const PRISMA_MODEL_RE = /^model\s+(\w+)\s*\{/gm;
const XSTATE_MACHINE_RE = /createMachine\s*\(\s*\{[\s\S]*?id:\s*['"](\w+)['"]/g;

// Ceiling guards (panel-locked Q12).
const NODE_CEILING = 5000;
const EDGE_CEILING = 15000;

// Phase-2 task: tighten return types to NodeKind from ./extractors/index.js once that barrel exists.

type DerivesTarget = { kind: string; name: string };

function normalizeDerivesTarget(raw: string): DerivesTarget {
  const trimmed = raw.trim();
  if (/^ADR-\d{4}$/.test(trimmed)) return { kind: 'adr', name: trimmed };
  if (/^master-plan §/.test(trimmed)) return { kind: 'master_plan_section', name: trimmed };
  if (/^docs\/.+\.md$/.test(trimmed)) return { kind: 'doc', name: trimmed };
  if (/^panel-\d{4}-\d{2}-\d{2}/.test(trimmed)) return { kind: 'panel_debate', name: trimmed };
  if (/^invariant:/.test(trimmed))
    return { kind: 'doc', name: `docs/invariants/${trimmed.slice('invariant:'.length)}.md` };
  return { kind: 'doc', name: trimmed }; // fallback
}

function inferSourceKind(path: string): string {
  if (path.endsWith('.prisma')) return 'entity';
  if (path.endsWith('.md')) return 'doc';
  if (/packages\/state-machines\//.test(path)) return 'state';
  if (/apps\/backend\/src\/routes\//.test(path)) return 'api_endpoint';
  if (/apps\/[^/]+\/app\/.+\/page\.tsx?$/.test(path)) return 'ui_screen';
  if (/apps\/[^/]+\/(components\/feature|app\/.*\/_components)\//.test(path)) return 'ui_component';
  if (/\.test\.tsx?$/.test(path)) return 'test';
  return 'doc';
}

// ─── DB connection ───────────────────────────────────────────────────────────

const url =
  process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.AXHY_DB_URL ?? '';

if (!url) {
  console.error(
    '[graph] No DATABASE_URL set. Run via `railway run -- pnpm --filter @axhy/knowledge-graph graph:build`.',
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

// ─── File walking ─────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
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
      const lower = name.toLowerCase();
      const ext = lower.slice(lower.lastIndexOf('.'));
      if (SCAN_EXTS.has(ext)) out.push(p);
    }
  }
  return out;
}

// ─── Embedding (real or fake) ────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]!.embedding;
  }
  // Deterministic fake — same text → same vector. Lets DB layer stay tested.
  const seed = Array.from(text).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 1e9, 7);
  let x = seed;
  const v = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    v[i] = (x / 2 ** 31 - 0.5) * 0.1;
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  for (let i = 0; i < 1536; i++) v[i] = v[i] / norm;
  return v;
}

function hashOf(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// ─── 1. Semantic graph: chunks ───────────────────────────────────────────────

async function upsertChunks(files: string[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (!content.trim()) continue;
    const sourcePath = relative(REPO_ROOT, file);
    const lines = content.split('\n');
    const language = sourcePath.endsWith('.prisma')
      ? 'prisma'
      : sourcePath.endsWith('.md')
        ? 'markdown'
        : sourcePath.endsWith('.sql')
          ? 'sql'
          : sourcePath.endsWith('.mmd')
            ? 'mermaid'
            : 'typescript';

    // For now: 1 chunk per file (whole file as one chunk).
    // Day 7 MCP work upgrades to tree-sitter-aware chunking.
    const contentHash = hashOf(content);

    const existing = await client.query(
      `SELECT id FROM axhy_graph.chunks WHERE source_path = $1 AND content_hash = $2`,
      [sourcePath, contentHash],
    );
    if ((existing.rowCount ?? 0) > 0) {
      skipped++;
      continue;
    }

    // Remove any older versions of this file
    await client.query(`DELETE FROM axhy_graph.chunks WHERE source_path = $1`, [sourcePath]);

    const vec = await embed(content.slice(0, 8000)); // cap input length
    await client.query(
      `INSERT INTO axhy_graph.chunks
       (source_path, start_line, end_line, content, content_hash, language, embedding, metadata)
       VALUES ($1, 1, $2, $3, $4, $5, $6::vector, $7::jsonb)`,
      [
        sourcePath,
        lines.length,
        content,
        contentHash,
        language,
        JSON.stringify(vec),
        JSON.stringify({}),
      ],
    );
    inserted++;
  }
  return { inserted, skipped };
}

// ─── 2. Structural graph: nodes + edges ──────────────────────────────────────

async function upsertNode(
  kind: string,
  name: string,
  sourcePath: string | null,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const res = await client.query(
    `INSERT INTO axhy_graph.nodes (kind, name, source_path, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (kind, name, source_path) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()
     RETURNING id`,
    [kind, name, sourcePath, JSON.stringify(metadata)],
  );
  return res.rows[0].id;
}

// Resolve a node by (kind, name) — preferring existing rows with a real
// source_path over creating duplicates with NULL source_path.
//
// Why: edge extractors emit endpoints with null sourcePath when they don't
// know the canonical source. Without this lookup, every edge to "User"
// creates a new entity row with source_path=NULL, multiplying duplicates
// across builds. We prefer the canonical (kind, name) row from the
// structural pass (which has a real source_path).
//
// In-memory cache: resolutions are stable within a single build run, so
// every (kind, name) pair hits the DB at most once. Without this, a 2K-edge
// build issued ~4K SELECTs over the network — minutes of latency.
const nodeResolutionCache = new Map<string, string>();

async function resolveOrCreateNode(
  kind: string,
  name: string,
  sourcePath: string | null,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const cacheKey = `${kind}::${name}`;
  const cached = nodeResolutionCache.get(cacheKey);
  if (cached) return cached;

  const found = await client.query(
    `SELECT id FROM axhy_graph.nodes
     WHERE kind = $1 AND name = $2
     ORDER BY (source_path IS NULL), source_path
     LIMIT 1`,
    [kind, name],
  );
  if ((found.rowCount ?? 0) > 0) {
    nodeResolutionCache.set(cacheKey, found.rows[0].id);
    return found.rows[0].id;
  }
  const id = await upsertNode(kind, name, sourcePath, metadata);
  nodeResolutionCache.set(cacheKey, id);
  return id;
}

async function upsertEdge(
  kind: string,
  srcId: string,
  dstId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO axhy_graph.edges (kind, src_id, dst_id, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (kind, src_id, dst_id) DO NOTHING`,
    [kind, srcId, dstId, JSON.stringify(metadata)],
  );
}

async function extractStructural(files: string[]): Promise<number> {
  let added = 0;
  for (const file of files) {
    const sourcePath = relative(REPO_ROOT, file);
    const content = readFileSync(file, 'utf8');

    if (sourcePath.endsWith('.prisma')) {
      // Prisma models become entity nodes
      let m: RegExpExecArray | null;
      const re = new RegExp(PRISMA_MODEL_RE.source, 'gm');
      while ((m = re.exec(content)) !== null) {
        await upsertNode('entity', m[1]!, sourcePath, { source: 'prisma' });
        added++;
      }
    }

    // XState createMachine({ id: '...' }) blocks become state-machine nodes.
    // Gate to .ts/.tsx only — regex matches code blocks inside .md files (false positives).
    if (/\.tsx?$/.test(sourcePath)) {
      let mm: RegExpExecArray | null;
      const sre = new RegExp(XSTATE_MACHINE_RE.source, 'g');
      while ((mm = sre.exec(content)) !== null) {
        await upsertNode('state', mm[1]!, sourcePath, { source: 'xstate' });
        added++;
      }
    }
  }
  return added;
}

// ─── 3. Provenance: DERIVES_FROM edges ───────────────────────────────────────

async function extractProvenance(files: string[]): Promise<number> {
  // First pass: index every ADR file as an `adr` node
  const adrPattern = /^docs\/decisions\/(\d{4})-([\w-]+)\.md$/;
  for (const file of files) {
    const sourcePath = relative(REPO_ROOT, file);
    const m = sourcePath.match(adrPattern);
    if (m) {
      await upsertNode('adr', `ADR-${m[1]}`, sourcePath, { slug: m[2] });
    }
  }

  // Second pass: scan @derives(ADR-NNNN) refs in every file → DERIVES_FROM edges
  let edges = 0;
  for (const file of files) {
    const sourcePath = relative(REPO_ROOT, file);
    const content = readFileSync(file, 'utf8');
    const re = new RegExp(DERIVES_RE.source, 'g');
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = re.exec(content)) !== null) {
      const target = m[1]!;
      if (seen.has(target)) continue;
      seen.add(target);

      // Source node: this file — kind inferred from path (replaces hardcoded 'ui_component' catch-all).
      const srcKind = inferSourceKind(sourcePath);
      const srcId = await upsertNode(srcKind, sourcePath, sourcePath, {});

      // Target node: normalize raw @derives() ref to kind + canonical name.
      const { kind: targetKind, name: targetName } = normalizeDerivesTarget(target);
      const dstId = await upsertNode(targetKind, targetName, null, {});

      await upsertEdge('derives_from', srcId, dstId, {});
      edges++;
    }
  }
  return edges;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const fullExtraction = process.argv.includes('--full');
  console.log(`[graph:build] mode=${fullExtraction ? 'full' : 'incremental'}`);
  console.log('[graph] Starting graph build...');
  await client.connect();

  // Phase-3 fold-in fix: one-time cleanup of stale state nodes sourced from .md files.
  // Phase 1 regex extraction created these; Phase 2 added the .tsx-only gate so no new ones
  // are created, but ON CONFLICT DO UPDATE keeps old rows alive. Safe to delete: no domain data.
  // Panel-approved: Hari + Maya + Vinod (schema cleanup).
  const mdStateCleanup = await client.query(
    `DELETE FROM axhy_graph.nodes WHERE kind = 'state' AND source_path LIKE '%.md' RETURNING id`,
  );
  if ((mdStateCleanup.rowCount ?? 0) > 0) {
    console.log(`[graph] Cleaned up ${mdStateCleanup.rowCount} stale .md-sourced state nodes`);
  }

  // Phase-3 fold-in fix: delete stale fixture-sourced nodes (from before IGNORE_DIRS 'fixtures' fix).
  // These were created in Phase 2 before the exclusion was added. ON CONFLICT DO UPDATE kept them alive.
  const fixtureCleanup = await client.query(
    `DELETE FROM axhy_graph.nodes WHERE source_path LIKE '%/test/fixtures/%' RETURNING id`,
  );
  if ((fixtureCleanup.rowCount ?? 0) > 0) {
    console.log(`[graph] Cleaned up ${fixtureCleanup.rowCount} stale fixture-sourced nodes`);
  }

  // Phase-3 fold-in fix: delete stale api_endpoint nodes from non-backend files.
  // Caused by extractFastifyRoutes previously running over all .ts/.tsx files.
  const staleEndpointCleanup = await client.query(
    `DELETE FROM axhy_graph.nodes
     WHERE kind = 'api_endpoint'
       AND source_path IS NOT NULL
       AND source_path NOT LIKE 'apps/backend/src/routes/%'
       AND source_path NOT LIKE 'apps/%/app/api/%/route.ts%'
     RETURNING id`,
  );
  if ((staleEndpointCleanup.rowCount ?? 0) > 0) {
    console.log(
      `[graph] Cleaned up ${staleEndpointCleanup.rowCount} stale non-backend api_endpoint nodes`,
    );
  }

  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    walk(join(REPO_ROOT, dir), allFiles);
  }
  console.log(`[graph] Found ${allFiles.length} indexable files`);

  // Relative paths (from REPO_ROOT) for extractor context.
  const relFiles = allFiles.map((f) => relative(REPO_ROOT, f));

  console.log('[graph] Step 1/3: semantic chunks...');
  const { inserted, skipped } = await upsertChunks(allFiles);
  console.log(`[graph]   inserted ${inserted}, unchanged ${skipped}`);

  console.log('[graph] Step 2/3: structural nodes (Prisma + XState)...');
  const struct = await extractStructural(allFiles);
  console.log(`[graph]   ${struct} entity/state nodes upserted`);

  console.log('[graph] Step 2b/3: Phase 2 extractors (fields, routes, screens, components)...');
  const ctx = { repoRoot: REPO_ROOT, files: relFiles, fullExtraction };
  const extractorOutputs: ExtractorOutput[] = await Promise.all([
    extractPrismaFields(ctx),
    extractXStateTransitions(ctx),
    extractFastifyRoutes(ctx),
    extractNextjsRoutes(ctx),
    extractScreens(ctx),
    extractComponents(ctx),
  ]);

  const allNodes: NodeRecord[] = extractorOutputs.flatMap((o) => o.nodes);
  const allEdges: EdgeRecord[] = extractorOutputs.flatMap((o) => o.edges);

  // Ceiling guards (panel-locked Q12).
  if (allNodes.length > NODE_CEILING) {
    throw new Error(`[graph:build] node ceiling exceeded: ${allNodes.length} > ${NODE_CEILING}`);
  }
  if (allEdges.length > EDGE_CEILING) {
    throw new Error(`[graph:build] edge ceiling exceeded: ${allEdges.length} > ${EDGE_CEILING}`);
  }

  // Upsert Phase 2 nodes + edges in batch.
  const nodeIdMap = new Map<string, string>();
  for (const n of allNodes) {
    const id = await upsertNode(n.kind, n.name, n.sourcePath, n.metadata);
    nodeIdMap.set(`${n.kind}::${n.name}`, id);
  }
  for (const e of allEdges) {
    const srcKey = `${e.srcKey.kind}::${e.srcKey.name}`;
    const dstKey = `${e.dstKey.kind}::${e.dstKey.name}`;
    const srcId =
      nodeIdMap.get(srcKey) ??
      (await resolveOrCreateNode(e.srcKey.kind, e.srcKey.name, e.srcKey.sourcePath, {}));
    const dstId =
      nodeIdMap.get(dstKey) ??
      (await resolveOrCreateNode(e.dstKey.kind, e.dstKey.name, e.dstKey.sourcePath, {}));
    await upsertEdge(e.kind, srcId, dstId, e.metadata);
  }
  console.log(`[graph:build] phase 2 — ${allNodes.length} nodes, ${allEdges.length} edges`);

  console.log('[graph] Step 2c/3: Phase 3 edge extractors (reads, writes, mounts, mirrors)...');

  // Build registries for edge extractors that need cross-reference.
  // Component registry: keyed by component name.
  const componentRegistry = new Map<
    string,
    { kind: 'ui_component'; name: string; sourcePath: string }
  >();
  for (const n of allNodes) {
    if (n.kind === 'ui_component') {
      componentRegistry.set(n.name, {
        kind: 'ui_component',
        name: n.name,
        sourcePath: n.sourcePath ?? '',
      });
    }
  }

  // Machine registry: keyed by conventional variable name (${id}Machine) per IMPL_PLAN §3.4 step 1.
  const machineRegistry = new Map<string, { name: string; sourcePath: string }>();
  for (const n of allNodes) {
    if (n.kind === 'state' && n.metadata.isRoot) {
      // Convention: workerMachine → machine root with id 'worker'.
      machineRegistry.set(`${n.name}Machine`, {
        name: n.name,
        sourcePath: n.sourcePath ?? '',
      });
    }
  }

  const edgeOutputs = await Promise.all([
    extractReadsWrites({ ...ctx }),
    extractMounts({ ...ctx, componentRegistry }),
    extractMirrors({ ...ctx, machineRegistry }),
  ]);
  const edgesPhase3 = edgeOutputs.flatMap((o) => o.edges);

  if (edgesPhase3.length + allEdges.length > EDGE_CEILING) {
    throw new Error(
      `[graph:build] edge ceiling exceeded after Phase 3: ${edgesPhase3.length + allEdges.length} > ${EDGE_CEILING}`,
    );
  }

  // Upsert phase 3 edges.
  for (const e of edgesPhase3) {
    const srcMapKey = `${e.srcKey.kind}::${e.srcKey.name}`;
    const dstMapKey = `${e.dstKey.kind}::${e.dstKey.name}`;
    const srcId =
      nodeIdMap.get(srcMapKey) ??
      (await resolveOrCreateNode(e.srcKey.kind, e.srcKey.name, e.srcKey.sourcePath, {}));
    const dstId =
      nodeIdMap.get(dstMapKey) ??
      (await resolveOrCreateNode(e.dstKey.kind, e.dstKey.name, e.dstKey.sourcePath, {}));
    await upsertEdge(e.kind, srcId, dstId, e.metadata);
  }
  console.log(`[graph:build] phase 3 — ${edgesPhase3.length} edges`);

  console.log('[graph] Step 2d/3: Phase 4 edge extractors (navigates_to, triggers)...');
  const phase4Outputs = await Promise.all([extractNavigatesTo(ctx), extractTriggers(ctx)]);
  const edgesPhase4 = phase4Outputs.flatMap((o) => o.edges);

  if (edgesPhase4.length + edgesPhase3.length + allEdges.length > EDGE_CEILING) {
    throw new Error(
      `[graph:build] edge ceiling exceeded after Phase 4: ${edgesPhase4.length + edgesPhase3.length + allEdges.length} > ${EDGE_CEILING}`,
    );
  }

  // Upsert phase 4 edges.
  for (const e of edgesPhase4) {
    const srcMapKey = `${e.srcKey.kind}::${e.srcKey.name}`;
    const dstMapKey = `${e.dstKey.kind}::${e.dstKey.name}`;
    const srcId =
      nodeIdMap.get(srcMapKey) ??
      (await resolveOrCreateNode(e.srcKey.kind, e.srcKey.name, e.srcKey.sourcePath, {}));
    const dstId =
      nodeIdMap.get(dstMapKey) ??
      (await resolveOrCreateNode(e.dstKey.kind, e.dstKey.name, e.dstKey.sourcePath, {}));
    await upsertEdge(e.kind, srcId, dstId, e.metadata);
  }
  console.log(`[graph:build] phase 4 — ${edgesPhase4.length} edges`);

  console.log('[graph] Step 3/3: provenance edges (@derives)...');
  const prov = await extractProvenance(allFiles);
  console.log(`[graph]   ${prov} derives_from edges upserted`);

  // Summary
  const summary = await client.query(`
    SELECT 'nodes' AS table, COUNT(*)::int AS count FROM axhy_graph.nodes
    UNION ALL
    SELECT 'edges', COUNT(*) FROM axhy_graph.edges
    UNION ALL
    SELECT 'chunks', COUNT(*) FROM axhy_graph.chunks
  `);
  console.log('');
  console.log('[graph] Final state:');
  for (const r of summary.rows) console.log(`  ${r.table}: ${r.count}`);

  await client.end();
  console.log('[graph] Done.');
}

await main();
