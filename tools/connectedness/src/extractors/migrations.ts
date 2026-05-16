/**
 * tools/connectedness/src/extractors/migrations.ts
 *
 * Idx-2 extractor — Prisma migrations → tables changed.
 *
 * Walks packages/shared-schema/prisma/migrations/<name>/migration.sql,
 * parses each for CREATE TABLE / ALTER TABLE / DROP TABLE statements,
 * emits one node per migration + one edge per (migration, table, op) tuple.
 *
 * Strictly regex-based; the SQL we generate is auto-emitted by Prisma so
 * the shape is predictable. Schema-qualified names like `axhy."TableName"`
 * are normalized to bare table names for matching with Prisma model nodes.
 *
 * @derives(ADR-0002) — graph/connectedness substrate; consumer of NodeRecord/EdgeRecord types
 * @derives(panel-2026-05-13) — Connectedness MVP scope (Idx-1..Idx-4)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { EdgeRecord, NodeRecord } from '@axhy/knowledge-graph';

export type MigrationOp = 'CREATE' | 'ALTER' | 'DROP';

const CREATE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?\w+"?\.)?"?(\w+)"?/gi;
const ALTER_RE = /ALTER\s+TABLE\s+(?:"?\w+"?\.)?"?(\w+)"?/gi;
const DROP_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?\w+"?\.)?"?(\w+)"?/gi;

export type MigrationExtractorResult = {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  warnings: string[];
};

export function extractMigrations(repoRoot: string): MigrationExtractorResult {
  const nodes: NodeRecord[] = [];
  const edges: EdgeRecord[] = [];
  const warnings: string[] = [];

  const migrationsDir = join(repoRoot, 'packages/shared-schema/prisma/migrations');
  let entries: string[];
  try {
    entries = readdirSync(migrationsDir);
  } catch {
    warnings.push(`Migrations dir not readable: ${migrationsDir}`);
    return { nodes, edges, warnings };
  }

  for (const entry of entries) {
    const fullPath = join(migrationsDir, entry);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    const sqlPath = join(fullPath, 'migration.sql');
    let sql: string;
    try {
      sql = readFileSync(sqlPath, 'utf8');
    } catch {
      warnings.push(`Missing migration.sql in ${entry}`);
      continue;
    }

    const relPath = `packages/shared-schema/prisma/migrations/${entry}/migration.sql`;
    const migrationName = entry;

    nodes.push({
      kind: 'doc',
      name: `migration:${migrationName}`,
      sourcePath: relPath,
      metadata: {
        connectednessKind: 'migration',
        migrationName,
      },
    });

    const seen = new Set<string>();
    for (const [re, op] of [
      [CREATE_RE, 'CREATE'],
      [ALTER_RE, 'ALTER'],
      [DROP_RE, 'DROP'],
    ] as const) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql)) !== null) {
        const tableName = m[1];
        if (!tableName) continue;
        const key = `${op}|${tableName}`;
        if (seen.has(key)) continue;
        seen.add(key);

        edges.push({
          kind: 'derives_from',
          srcKey: { kind: 'doc', name: `migration:${migrationName}`, sourcePath: relPath },
          dstKey: { kind: 'entity', name: tableName, sourcePath: null },
          metadata: { op },
        });
      }
    }
  }

  return { nodes, edges, warnings };
}
