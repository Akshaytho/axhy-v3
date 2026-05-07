/**
 * packages/knowledge-graph/src/extractors/nextjs-routes.ts
 *
 * Stage 2b (Next.js half) — derives endpoint nodes from app/api/ route.ts paths.
 * v1 emits "GET path" per route file; method-level discrimination via AST inspection
 * of exported HTTP function names is a Phase 2 follow-up.
 *
 * @derives(ADR-0002)
 */

import type { ExtractorContext, ExtractorOutput, NodeRecord } from './index.js';

const ROUTE_RE = /^apps\/([^/]+)\/app\/api\/(.+)\/route\.tsx?$/;

export async function extractNextjsRoutes(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const nodes: NodeRecord[] = [];

  for (const relPath of ctx.files) {
    const match = relPath.match(ROUTE_RE);
    if (!match) continue;
    const app = match[1]!;
    const routeSegments = match[2]!;
    const apiPath = `/api/${routeSegments}`;
    const name = `GET ${apiPath}`;
    nodes.push({
      kind: 'api_endpoint',
      name,
      sourcePath: `${relPath}:1`,
      metadata: { app, method: 'GET', path: apiPath },
    });
  }

  return { nodes, edges: [] };
}
