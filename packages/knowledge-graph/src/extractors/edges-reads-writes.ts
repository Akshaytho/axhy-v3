/**
 * packages/knowledge-graph/src/extractors/edges-reads-writes.ts
 *
 * Phase 3 — emit reads/writes edges from Prisma client calls.
 * Table-level always. Field-level via select/data projections (tier-1).
 *
 * // Phase-2-tier-2: destructuring-based field reads deferred (best-effort, low confidence)
 *
 * @derives(ADR-0002)
 */

import { join } from 'node:path';

import { Node, Project } from 'ts-morph';

import type { EdgeRecord, ExtractorContext, ExtractorOutput } from './index.js';

const READ_OPS = new Set(['findMany', 'findFirst', 'findUnique', 'count', 'aggregate']);
const WRITE_OPS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

export async function extractReadsWrites(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const edges: EdgeRecord[] = [];
  const tsFiles = ctx.files.filter((f) => /\.tsx?$/.test(f));

  const project = new Project({ useInMemoryFileSystem: false, skipFileDependencyResolution: true });
  for (const relPath of tsFiles) {
    project.addSourceFileAtPath(join(ctx.repoRoot, relPath));
  }

  for (const sf of project.getSourceFiles()) {
    const relPath = sf.getFilePath().replace(ctx.repoRoot + '/', '');
    const sourceKey = inferSourceNodeKey(relPath);
    if (!sourceKey) continue;

    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const expr = node.getExpression();
      if (!Node.isPropertyAccessExpression(expr)) return;

      const op = expr.getName();
      const modelExpr = expr.getExpression();
      if (!Node.isPropertyAccessExpression(modelExpr)) return;

      const modelLowercase = modelExpr.getName();
      const root = modelExpr.getExpression().getText();
      if (root !== 'prisma') return;

      const modelName = modelLowercase[0]!.toUpperCase() + modelLowercase.slice(1);

      let edgeKind: 'reads' | 'writes' | null = null;
      if (READ_OPS.has(op)) edgeKind = 'reads';
      else if (WRITE_OPS.has(op)) edgeKind = 'writes';
      if (!edgeKind) return;

      // Table-level edge.
      edges.push({
        kind: edgeKind,
        srcKey: sourceKey,
        dstKey: { kind: 'entity', name: modelName, sourcePath: null },
        metadata: { op, granularity: 'table' },
      });

      // Field-level edges from select / data projection (tier-1).
      const args = node.getArguments()[0];
      if (args && Node.isObjectLiteralExpression(args)) {
        const projKey = edgeKind === 'reads' ? 'select' : 'data';
        const projProp = args.getProperty(projKey);
        if (projProp && Node.isPropertyAssignment(projProp)) {
          const projObj = projProp.getInitializer();
          if (projObj && Node.isObjectLiteralExpression(projObj)) {
            for (const fieldProp of projObj.getProperties()) {
              if (!Node.isPropertyAssignment(fieldProp)) continue;
              const fieldName = fieldProp.getNameNode().getText().replace(/['"]/g, '');
              edges.push({
                kind: edgeKind,
                srcKey: sourceKey,
                dstKey: { kind: 'field', name: `${modelName}.${fieldName}`, sourcePath: null },
                metadata: { op, granularity: 'field', tier: 'tier1' },
              });
            }
          }
        }
      }
    });
  }

  return { nodes: [], edges };
}

function inferSourceNodeKey(relPath: string): EdgeRecord['srcKey'] | null {
  if (!/\.tsx?$/.test(relPath)) return null;

  if (/apps\/backend\/src\/routes\/.+\.ts$/.test(relPath)) {
    // For backend routes, source is the api_endpoint node corresponding to this file.
    // Best-effort: use file path as identifier; full route name resolution happens
    // when builder cross-references with extractFastifyRoutes output.
    return { kind: 'api_endpoint', name: relPath, sourcePath: relPath };
  }
  if (/apps\/[^/]+\/app\/.+\/page\.tsx?$/.test(relPath)) {
    const m = relPath.match(/^apps\/[^/]+\/app\/(.*)page\.tsx?$/);
    const route = m && m[1] ? `/${m[1].replace(/\/$/, '')}` : '/';
    return { kind: 'ui_screen', name: route, sourcePath: relPath };
  }
  // Fallback: any other .ts/.tsx file (including test fixtures and service helpers)
  // is treated as a generic api_endpoint source so reads/writes are still captured.
  return { kind: 'api_endpoint', name: relPath, sourcePath: relPath };
}
