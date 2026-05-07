/**
 * packages/knowledge-graph/src/extractors/fastify-routes.ts
 *
 * Stage 2b — Fastify route declarations → api_endpoint nodes.
 * Uses ts-morph AST traversal to detect fastify.METHOD('/path', ...) calls.
 *
 * @derives(ADR-0002)
 */

import { join } from 'node:path';

import { Node, Project } from 'ts-morph';

import type { ExtractorContext, ExtractorOutput, NodeRecord } from './index.js';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export async function extractFastifyRoutes(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const nodes: NodeRecord[] = [];

  // Phase-3 fold-in fix: gate to backend route files only.
  // Previously ran over all .ts/.tsx files, causing false-positive api_endpoint nodes
  // from non-backend files (e.g. apps/supervisor-preview/app/page.tsx).
  const tsFiles = ctx.files.filter(
    (f) => /\.tsx?$/.test(f) && /^apps\/backend\/src\/routes\//.test(f),
  );
  const project = new Project({ useInMemoryFileSystem: false, skipFileDependencyResolution: true });
  for (const relPath of tsFiles) {
    project.addSourceFileAtPath(join(ctx.repoRoot, relPath));
  }

  for (const sf of project.getSourceFiles()) {
    const relPath = sf.getFilePath().replace(ctx.repoRoot + '/', '');

    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const expr = node.getExpression();
      if (!Node.isPropertyAccessExpression(expr)) return;
      const methodName = expr.getName().toLowerCase();
      if (!HTTP_METHODS.has(methodName)) return;

      const args = node.getArguments();
      if (args.length === 0) return;
      const pathArg = args[0];
      if (!pathArg || !Node.isStringLiteral(pathArg)) return;
      const path = pathArg.getLiteralText();

      const method = methodName.toUpperCase();
      const lineNum = node.getStartLineNumber();
      nodes.push({
        kind: 'api_endpoint',
        name: `${method} ${path}`,
        sourcePath: `${relPath}:${lineNum}`,
        metadata: { method, path, app: 'backend' },
      });
    });
  }

  return { nodes, edges: [] };
}
