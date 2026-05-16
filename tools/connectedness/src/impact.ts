/**
 * tools/connectedness/src/impact.ts
 *
 * Idx-3 — `pnpm connectedness:impact <entity>` CLI.
 *
 * Reads connectedness/generated/impact-index.json and prints a route-first
 * impact report for the requested entity / feature / table / route / file.
 *
 * Lookup precedence:
 *   1. Exact match against impact-index keys (entity names, feature names)
 *   2. `feature:<name>` prefix strip
 *   3. Case-insensitive exact match
 *   4. Case-insensitive substring suggestions if no match
 *
 * Output sections (route-first by design):
 *   - Routes (read / write) — actual METHOD /path strings via the AST-resolved srcKey
 *   - Scripts / Tests / Libraries / Other — separate buckets, queryable but not mixed in
 *   - Migrations that touched the table
 *   - Downstream features (mapped, per manifest affects:)
 *   - External referenced domains (unmapped in MVP)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

type ImpactRecord = {
  kind: string;
  sourcePath: string | null;
  owningFeature: string | null;
  provisionalOwner: string | null;
  routeReads: string[];
  routeWrites: string[];
  scriptReads: string[];
  scriptWrites: string[];
  testReads: string[];
  testWrites: string[];
  libraryReads: string[];
  libraryWrites: string[];
  otherReads: string[];
  otherWrites: string[];
  migrations: Array<{ name: string; op: string }>;
  affects: string[];
  externalReferences: string[];
};

type ImpactIndexFile = {
  generatedAt: string;
  impact: Record<string, ImpactRecord>;
};

function main(): void {
  const query = process.argv[2];
  if (!query) {
    printUsage();
    process.exit(1);
  }

  const indexPath = join(REPO_ROOT, 'connectedness/generated/impact-index.json');
  let data: ImpactIndexFile;
  try {
    data = JSON.parse(readFileSync(indexPath, 'utf8')) as ImpactIndexFile;
  } catch (err) {
    console.error(`Could not read ${indexPath}: ${(err as Error).message}`);
    console.error('Run `pnpm connectedness:build` first.');
    process.exit(1);
  }

  const record = resolve(query, data.impact);
  if (!record) {
    console.error(`No impact data for: ${query}`);
    const suggestions = suggest(query, Object.keys(data.impact));
    if (suggestions.length > 0) {
      console.error('Did you mean:');
      for (const s of suggestions.slice(0, 10)) console.error(`  - ${s}`);
    }
    process.exit(1);
  }

  print(record.name, record.value, data.generatedAt);
}

function resolve(
  query: string,
  index: Record<string, ImpactRecord>,
): { name: string; value: ImpactRecord } | null {
  // Strip "feature:" prefix if present (e.g. "feature:decisions" → "decisions")
  const stripped = query.startsWith('feature:') ? query.slice('feature:'.length) : query;

  // 1. Exact match
  if (index[stripped]) return { name: stripped, value: index[stripped] };

  // 2. Case-insensitive exact match
  const lowerStripped = stripped.toLowerCase();
  for (const key of Object.keys(index)) {
    if (key.toLowerCase() === lowerStripped) {
      const v = index[key];
      if (v) return { name: key, value: v };
    }
  }

  return null;
}

function suggest(query: string, keys: string[]): string[] {
  const stripped = query.startsWith('feature:') ? query.slice('feature:'.length) : query;
  const lower = stripped.toLowerCase();
  return keys.filter((k) => k.toLowerCase().includes(lower)).sort();
}

function print(name: string, rec: ImpactRecord, generatedAt: string): void {
  const lines: string[] = [];
  lines.push(`╭─ ${name} (${rec.kind})`);
  if (rec.owningFeature) {
    const marker = rec.provisionalOwner ? ' [PROVISIONAL ownership]' : '';
    lines.push(`│  Owned by feature: ${rec.owningFeature}${marker}`);
  }
  if (rec.sourcePath) {
    lines.push(`│  Defined: ${rec.sourcePath}`);
  }

  section(lines, 'Routes that READ this entity', rec.routeReads);
  section(lines, 'Routes that WRITE this entity', rec.routeWrites);
  section(lines, 'Scripts (read)', rec.scriptReads);
  section(lines, 'Scripts (write)', rec.scriptWrites);
  section(lines, 'Tests (read)', rec.testReads);
  section(lines, 'Tests (write)', rec.testWrites);
  section(lines, 'Library callers (read)', rec.libraryReads);
  section(lines, 'Library callers (write)', rec.libraryWrites);
  section(lines, 'Other callers (read)', rec.otherReads);
  section(lines, 'Other callers (write)', rec.otherWrites);

  if (rec.migrations.length > 0) {
    lines.push('│');
    lines.push('├─ Migrations that touched this table');
    for (const m of rec.migrations) {
      lines.push(`│    ${m.op.padEnd(7)} ${m.name}`);
    }
  }

  if (rec.affects.length > 0) {
    lines.push('│');
    lines.push('├─ Downstream features (mapped, per manifest affects:)');
    for (const a of rec.affects) lines.push(`│    ${a}`);
  }

  if (rec.externalReferences.length > 0) {
    lines.push('│');
    lines.push('├─ External referenced domains (unmapped in MVP)');
    for (const e of rec.externalReferences) lines.push(`│    ${e}`);
  }

  lines.push('│');
  lines.push(`╰─ Last regenerated: ${generatedAt}`);
  console.log(lines.join('\n'));
}

function section(out: string[], title: string, items: string[]): void {
  if (items.length === 0) return;
  out.push('│');
  out.push(`├─ ${title}`);
  for (const item of items) out.push(`│    ${item}`);
}

function printUsage(): void {
  console.error('Usage: pnpm connectedness:impact <entity-or-feature>');
  console.error('');
  console.error('Examples:');
  console.error('  pnpm connectedness:impact Assignment');
  console.error('  pnpm connectedness:impact CalendarEntry');
  console.error('  pnpm connectedness:impact feature:decisions');
  console.error('  pnpm connectedness:impact "POST /calendar"');
}

main();
