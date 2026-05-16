/**
 * tools/connectedness/src/build.ts
 *
 * Idx-2 — Connectedness MVP build orchestrator.
 *
 * Reads:
 *   - packages/shared-schema/prisma/schema.prisma  (via knowledge-graph prisma-fields extractor)
 *   - apps/backend/src/routes/**\/*.ts              (via knowledge-graph fastify-routes + reads-writes extractors)
 *   - packages/shared-schema/prisma/migrations/**\/migration.sql  (via local migrations extractor)
 *   - connectedness/features/*.yml                  (via local manifests extractor)
 *
 * Emits to connectedness/generated/:
 *   - nodes.json
 *   - edges.json
 *   - impact-index.json
 *   - manifest-coverage.json
 *   - extraction-log.json
 *
 * MVP scope (Idx-2 only): extraction + JSON emission. No CLI, no CI wiring.
 * Layer C (impact CLI) and Layer D (CI guard) land in Idx-3 / Idx-4.
 */

import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deep imports avoid the @axhy/knowledge-graph main barrel, which transitively
// pulls in audit.ts whose top-level code requires a DATABASE_URL. The type-only
// import below stays on the main barrel (types are erased; no side effect).
import { extractFastifyRoutes } from '@axhy/knowledge-graph/src/extractors/fastify-routes.js';
import { extractPrismaFields } from '@axhy/knowledge-graph/src/extractors/prisma-fields.js';
import { extractReadsWrites } from '@axhy/knowledge-graph/src/extractors/edges-reads-writes.js';
import type {
  EdgeRecord,
  ExtractorContext,
  ExtractorOutput,
  NodeRecord,
} from '@axhy/knowledge-graph';

import { extractMigrations } from './extractors/migrations.js';
import { extractManifests, type Manifest } from './extractors/manifests.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

const SCAN_DIRS = ['apps', 'packages'];
const SCAN_EXTS = new Set(['.ts', '.tsx', '.prisma']);
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

type ExtractorLog = {
  name: string;
  nodeCount: number;
  edgeCount: number;
  warnings: string[];
};

type ImpactRecord = {
  kind: string;
  sourcePath: string | null;
  owningFeature: string | null;
  provisionalOwner: string | null;
  // Route-only reads/writes — the default engineer view (Fastify route handlers).
  routeReads: string[];
  routeWrites: string[];
  // Non-route callers, kept queryable but out of the default route-first view.
  scriptReads: string[];
  scriptWrites: string[];
  testReads: string[];
  testWrites: string[];
  libraryReads: string[];
  libraryWrites: string[];
  // Anything else (UI components, package-internal helpers, etc.) — generic kind.
  otherReads: string[];
  otherWrites: string[];
  migrations: Array<{ name: string; op: string }>;
  affects: string[];
  externalReferences: string[];
};

type ManifestCoverage = {
  generatedAt: string;
  claimed: Record<string, { owner: string; provisional: boolean }>;
  orphans: string[];
  provisional: Array<{
    table: string;
    currentOwner: string;
    rightfulOwner: string;
    migrateWhen: string;
  }>;
};

async function main(): Promise<void> {
  const files = walkRepo(REPO_ROOT);
  const ctx: ExtractorContext = { repoRoot: REPO_ROOT, files, fullExtraction: true };

  const allNodes: NodeRecord[] = [];
  const allEdges: EdgeRecord[] = [];
  const log: ExtractorLog[] = [];

  // ── Extractor 1: Prisma schema → tables/fields ─────────────────────────────
  const prismaOut = await extractPrismaFields(ctx);
  const prismaEntityNodes = synthesizeEntityNodes(prismaOut);
  pushAll(allNodes, prismaEntityNodes);
  pushAll(allNodes, prismaOut.nodes);
  pushAll(allEdges, prismaOut.edges);
  log.push({
    name: 'prisma-fields',
    nodeCount: prismaOut.nodes.length + prismaEntityNodes.length,
    edgeCount: prismaOut.edges.length,
    warnings: [],
  });

  // ── Extractor 2: Backend Fastify routes ─────────────────────────────────────
  const routesOut = await extractFastifyRoutes(ctx);
  pushAll(allNodes, routesOut.nodes);
  pushAll(allEdges, routesOut.edges);
  log.push({
    name: 'fastify-routes',
    nodeCount: routesOut.nodes.length,
    edgeCount: routesOut.edges.length,
    warnings: [],
  });

  // ── Extractor 2b: Route reads/writes against Prisma tables ──────────────────
  const rwOut = await extractReadsWrites(ctx);
  pushAll(allEdges, rwOut.edges);
  log.push({
    name: 'edges-reads-writes',
    nodeCount: 0,
    edgeCount: rwOut.edges.length,
    warnings: [],
  });

  // ── Extractor 3: Migrations → tables changed ────────────────────────────────
  const migrationsOut = extractMigrations(REPO_ROOT);
  pushAll(allNodes, migrationsOut.nodes);
  pushAll(allEdges, migrationsOut.edges);
  log.push({
    name: 'migrations',
    nodeCount: migrationsOut.nodes.length,
    edgeCount: migrationsOut.edges.length,
    warnings: migrationsOut.warnings,
  });

  // ── Extractor 4: Manifests → feature ownership ──────────────────────────────
  const manifestsOut = extractManifests(REPO_ROOT);
  pushAll(allNodes, manifestsOut.nodes);
  pushAll(allEdges, manifestsOut.edges);
  log.push({
    name: 'manifests',
    nodeCount: manifestsOut.nodes.length,
    edgeCount: manifestsOut.edges.length,
    warnings: manifestsOut.warnings,
  });

  // ── Deduplicate + serialize ─────────────────────────────────────────────────
  const dedupedNodes = dedupeNodes(allNodes);
  const dedupedEdges = dedupeEdges(allEdges);

  const impactIndex = buildImpactIndex(dedupedNodes, dedupedEdges, manifestsOut.manifests);
  const coverage = buildManifestCoverage(dedupedNodes, manifestsOut.manifests);

  const outDir = join(REPO_ROOT, 'connectedness/generated');
  mkdirSync(outDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  writeJson(join(outDir, 'nodes.json'), { generatedAt, nodes: dedupedNodes });
  writeJson(join(outDir, 'edges.json'), { generatedAt, edges: dedupedEdges });
  writeJson(join(outDir, 'impact-index.json'), { generatedAt, impact: impactIndex });
  writeJson(join(outDir, 'manifest-coverage.json'), coverage);
  writeJson(join(outDir, 'extraction-log.json'), { generatedAt, extractors: log });

  const totalNodes = dedupedNodes.length;
  const totalEdges = dedupedEdges.length;
  const totalWarnings = log.reduce((n, l) => n + l.warnings.length, 0);
  console.log(
    `[connectedness] wrote 5 files to connectedness/generated/ — ` +
      `${totalNodes} nodes, ${totalEdges} edges, ${totalWarnings} warnings.`,
  );
  if (totalWarnings > 0) {
    for (const l of log) {
      for (const w of l.warnings) console.log(`[connectedness][${l.name}] ${w}`);
    }
  }
}

function walkRepo(root: string): string[] {
  const out: string[] = [];
  for (const top of SCAN_DIRS) {
    walk(join(root, top), root, out);
  }
  // Also pull schema.prisma explicitly even if outside SCAN_DIRS (it is in packages/, so it is included).
  return out;
}

function walk(dir: string, root: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, root, out);
    } else {
      const ext = entry.slice(entry.lastIndexOf('.'));
      if (SCAN_EXTS.has(ext)) out.push(relative(root, full));
    }
  }
}

function synthesizeEntityNodes(prismaOut: ExtractorOutput): NodeRecord[] {
  // The prisma-fields extractor emits 'field' nodes + 'belongs_to' edges pointing at entity nodes.
  // It does NOT emit standalone entity nodes — they are inferred dst targets. Synthesize them here so
  // every Prisma model surfaces as a node in our output.
  const seen = new Set<string>();
  const entities: NodeRecord[] = [];
  for (const edge of prismaOut.edges) {
    if (edge.kind !== 'belongs_to') continue;
    const { name, sourcePath } = edge.dstKey;
    if (seen.has(name)) continue;
    seen.add(name);
    entities.push({ kind: 'entity', name, sourcePath, metadata: {} });
  }
  return entities;
}

function pushAll<T>(target: T[], source: T[]): void {
  for (const item of source) target.push(item);
}

function nodeKey(n: NodeRecord): string {
  return `${n.kind}|${n.name}|${n.sourcePath ?? ''}`;
}

function edgeKey(e: EdgeRecord): string {
  return [
    e.kind,
    e.srcKey.kind,
    e.srcKey.name,
    e.srcKey.sourcePath ?? '',
    e.dstKey.kind,
    e.dstKey.name,
    e.dstKey.sourcePath ?? '',
  ].join('|');
}

function dedupeNodes(nodes: NodeRecord[]): NodeRecord[] {
  const map = new Map<string, NodeRecord>();
  for (const n of nodes) {
    const key = nodeKey(n);
    const existing = map.get(key);
    if (existing) {
      existing.metadata = { ...existing.metadata, ...n.metadata };
    } else {
      map.set(key, { ...n, metadata: { ...n.metadata } });
    }
  }
  return Array.from(map.values()).sort((a, b) => nodeKey(a).localeCompare(nodeKey(b)));
}

function dedupeEdges(edges: EdgeRecord[]): EdgeRecord[] {
  const map = new Map<string, EdgeRecord>();
  for (const e of edges) {
    const key = edgeKey(e);
    if (!map.has(key)) map.set(key, e);
  }
  return Array.from(map.values()).sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
}

function buildImpactIndex(
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  manifests: Manifest[],
): Record<string, ImpactRecord> {
  const index: Record<string, ImpactRecord> = {};

  for (const node of nodes) {
    if (node.kind === 'field') continue; // fields are subordinate; skip
    const key = node.name;
    index[key] = {
      kind: node.kind,
      sourcePath: node.sourcePath,
      owningFeature: null,
      provisionalOwner: null,
      routeReads: [],
      routeWrites: [],
      scriptReads: [],
      scriptWrites: [],
      testReads: [],
      testWrites: [],
      libraryReads: [],
      libraryWrites: [],
      otherReads: [],
      otherWrites: [],
      migrations: [],
      affects: [],
      externalReferences: [],
    };
  }

  for (const m of manifests) {
    for (const table of m.owns.tables) {
      const rec = index[table];
      if (rec) rec.owningFeature = m.feature;
    }
    if (m.provisional_owns) {
      for (const p of m.provisional_owns.tables) {
        const rec = index[p.name];
        if (rec) {
          rec.owningFeature = m.feature;
          rec.provisionalOwner = m.feature;
        }
      }
    }
    const featRec = index[m.feature];
    if (featRec) {
      featRec.affects = [...m.affects];
      featRec.externalReferences = m.external_references.map((e) => e.name);
    }
  }

  for (const edge of edges) {
    if (edge.kind === 'reads' || edge.kind === 'writes') {
      const tableRec = index[edge.dstKey.name];
      if (!tableRec) continue;
      pushCallerByKind(tableRec, edge);
    } else if (
      edge.kind === 'derives_from' &&
      edge.srcKey.kind === 'doc' &&
      edge.dstKey.kind === 'entity'
    ) {
      // Only migration docs (prefixed "migration:") contribute to migration history.
      // Other 'doc'-kind callers (UI components, etc.) emit reads/writes edges
      // via the reads-writes extractor and are handled in the branch above.
      const m = edge.srcKey.name.match(/^migration:(.+)$/);
      if (!m) continue;
      const tableRec = index[edge.dstKey.name];
      if (!tableRec) continue;
      const op = String((edge.metadata as Record<string, unknown>)['op'] ?? '');
      tableRec.migrations.push({ name: m[1] ?? '', op });
    }
  }

  for (const rec of Object.values(index)) {
    rec.routeReads = unique(rec.routeReads).sort();
    rec.routeWrites = unique(rec.routeWrites).sort();
    rec.scriptReads = unique(rec.scriptReads).sort();
    rec.scriptWrites = unique(rec.scriptWrites).sort();
    rec.testReads = unique(rec.testReads).sort();
    rec.testWrites = unique(rec.testWrites).sort();
    rec.libraryReads = unique(rec.libraryReads).sort();
    rec.libraryWrites = unique(rec.libraryWrites).sort();
    rec.otherReads = unique(rec.otherReads).sort();
    rec.otherWrites = unique(rec.otherWrites).sort();
  }

  return index;
}

function pushCallerByKind(rec: ImpactRecord, edge: EdgeRecord): void {
  const label = edge.srcKey.name;
  const isRead = edge.kind === 'reads';
  switch (edge.srcKey.kind) {
    case 'api_endpoint':
      (isRead ? rec.routeReads : rec.routeWrites).push(label);
      break;
    case 'script':
      (isRead ? rec.scriptReads : rec.scriptWrites).push(label);
      break;
    case 'test':
      (isRead ? rec.testReads : rec.testWrites).push(label);
      break;
    case 'library':
      (isRead ? rec.libraryReads : rec.libraryWrites).push(label);
      break;
    default:
      (isRead ? rec.otherReads : rec.otherWrites).push(label);
  }
}

function buildManifestCoverage(nodes: NodeRecord[], manifests: Manifest[]): ManifestCoverage {
  const claimed: Record<string, { owner: string; provisional: boolean }> = {};
  const provisional: ManifestCoverage['provisional'] = [];

  for (const m of manifests) {
    for (const t of m.owns.tables) {
      claimed[t] = { owner: m.feature, provisional: false };
    }
    if (m.provisional_owns) {
      for (const p of m.provisional_owns.tables) {
        claimed[p.name] = { owner: m.feature, provisional: true };
        provisional.push({
          table: p.name,
          currentOwner: m.feature,
          rightfulOwner: p.rightful_owner,
          migrateWhen: p.migrate_when,
        });
      }
    }
  }

  const orphans: string[] = [];
  for (const node of nodes) {
    if (node.kind !== 'entity') continue;
    if (!claimed[node.name]) orphans.push(node.name);
  }
  orphans.sort();

  return {
    generatedAt: new Date().toISOString(),
    claimed,
    orphans,
    provisional,
  };
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[connectedness] build failed:', err);
  process.exit(1);
});
