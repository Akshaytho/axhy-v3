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
const HTTP_METHODS_LOWER = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export async function extractReadsWrites(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const edges: EdgeRecord[] = [];
  const tsFiles = ctx.files.filter((f) => /\.tsx?$/.test(f));

  const project = new Project({ useInMemoryFileSystem: false, skipFileDependencyResolution: true });
  for (const relPath of tsFiles) {
    project.addSourceFileAtPath(join(ctx.repoRoot, relPath));
  }

  for (const sf of project.getSourceFiles()) {
    const relPath = sf.getFilePath().replace(ctx.repoRoot + '/', '');
    const fallbackSourceKey = inferSourceNodeKey(relPath);
    if (!fallbackSourceKey) continue;
    const isRouteFile = /apps\/backend\/src\/routes\/.+\.ts$/.test(relPath);

    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const expr = node.getExpression();
      if (!Node.isPropertyAccessExpression(expr)) return;

      const op = expr.getName();
      const modelExpr = expr.getExpression();
      if (!Node.isPropertyAccessExpression(modelExpr)) return;

      const modelLowercase = modelExpr.getName();
      const root = modelExpr.getExpression().getText();
      // Accept both `prisma.<model>.<op>()` and `tx.<model>.<op>()` because the
      // backend convention is `withTenantContext(prisma, companyId, async (tx) => ...)` —
      // route handlers call through `tx`, not the outer `prisma` client. Without
      // this, route reads/writes for any tenant-scoped table go uncaptured.
      if (root !== 'prisma' && root !== 'tx') return;

      const modelName = modelLowercase[0]!.toUpperCase() + modelLowercase.slice(1);

      let edgeKind: 'reads' | 'writes' | null = null;
      if (READ_OPS.has(op)) edgeKind = 'reads';
      else if (WRITE_OPS.has(op)) edgeKind = 'writes';
      if (!edgeKind) return;

      // For backend route files, walk up the AST to find the enclosing
      // `app.METHOD('/path', ...)` call. If found, the Prisma call belongs to
      // that specific route handler — emit srcKey as 'api_endpoint' with the
      // resolved "METHOD /path" name. Otherwise fall back to file-path srcKey.
      let sourceKey = fallbackSourceKey;
      if (isRouteFile) {
        const routeName = findEnclosingRouteName(node);
        if (routeName) {
          sourceKey = { kind: 'api_endpoint', name: routeName, sourcePath: relPath };
        }
      }

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

/**
 * Walks up from `node` looking for an ancestor CallExpression of the form
 * `<receiver>.METHOD('/path', ...)` where METHOD is a Fastify HTTP verb and
 * the first argument is a string literal. Returns "METHOD /path" if found,
 * otherwise null.
 *
 * Handles both `app.post('/path', ...)` and `app.post<{ Params: { id: string } }>('/path', ...)`
 * (ts-morph treats type args as siblings of args; args[0] is still the string literal).
 *
 * Returns null for template-literal paths and for Prisma calls outside any route
 * handler (file-level initialization, exported helpers).
 */
function findEnclosingRouteName(node: Node): string | null {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    if (Node.isCallExpression(cur)) {
      const expr = cur.getExpression();
      if (Node.isPropertyAccessExpression(expr)) {
        const methodLower = expr.getName().toLowerCase();
        if (HTTP_METHODS_LOWER.has(methodLower)) {
          const args = cur.getArguments();
          const pathArg = args[0];
          if (pathArg && Node.isStringLiteral(pathArg)) {
            return `${methodLower.toUpperCase()} ${pathArg.getLiteralText()}`;
          }
          // Found an HTTP-method call but path isn't a string literal (template
          // literal with substitutions, variable, etc.) — give up rather than
          // emitting a noisy raw text. Fall back to file path via caller.
          return null;
        }
      }
    }
    cur = cur.getParent();
  }
  return null;
}

function inferSourceNodeKey(relPath: string): EdgeRecord['srcKey'] | null {
  if (!/\.tsx?$/.test(relPath)) return null;

  // Tests come first so test files under apps/backend/test/ aren't accidentally
  // re-classified as scripts/libraries by a more permissive prefix below.
  if (/(^|\/)test\//.test(relPath) || /\.test\.tsx?$/.test(relPath)) {
    return { kind: 'test', name: relPath, sourcePath: relPath };
  }

  if (/apps\/backend\/src\/routes\/.+\.ts$/.test(relPath)) {
    // For backend routes, source is the api_endpoint node corresponding to this file.
    // Best-effort: use file path as identifier; full route name resolution happens
    // when downstream tooling cross-references with extractFastifyRoutes output.
    return { kind: 'api_endpoint', name: relPath, sourcePath: relPath };
  }

  // Scripts: one-shot CLIs / migration helpers / seed runners under any
  // apps/*/scripts/ directory.
  if (/apps\/[^/]+\/scripts\/.+\.ts$/.test(relPath)) {
    return { kind: 'script', name: relPath, sourcePath: relPath };
  }

  // Backend libraries / middleware / dispatcher / background jobs — long-lived
  // server-side modules that aren't direct request handlers.
  if (/apps\/backend\/src\/(lib|middleware|dispatcher|jobs)\//.test(relPath)) {
    return { kind: 'library', name: relPath, sourcePath: relPath };
  }

  if (/apps\/[^/]+\/app\/.+\/page\.tsx?$/.test(relPath)) {
    const m = relPath.match(/^apps\/[^/]+\/app\/(.*)page\.tsx?$/);
    const route = m && m[1] ? `/${m[1].replace(/\/$/, '')}` : '/';
    return { kind: 'ui_screen', name: route, sourcePath: relPath };
  }

  // Fallback: any other .ts/.tsx file (UI components, package-internal helpers,
  // etc.) is treated as a generic doc-kind source. Edges still emit so reads/writes
  // are not lost, but the caller is no longer falsely labeled as a route.
  return { kind: 'doc', name: relPath, sourcePath: relPath };
}
