/**
 * packages/knowledge-graph/src/extractors/screens.ts
 *
 * Stage 2c — Surface (UI screen) extraction by file path.
 * Path-only — AST traversal for mounts/triggers/mirrors/navigates_to is in
 * the Phase 3/4 edge extractors.
 *
 * @derives(ADR-0002)
 */

import type { ExtractorContext, ExtractorOutput, NodeRecord } from './index.js';

const SCREEN_RE = /^apps\/([^/]+)\/app\/(.*)page\.tsx?$/;

export async function extractScreens(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const nodes: NodeRecord[] = [];

  for (const relPath of ctx.files) {
    const match = relPath.match(SCREEN_RE);
    if (!match) continue;
    if (relPath.includes('/api/')) continue; // api routes handled by nextjs-routes
    const app = match[1]!;
    const segmentsRaw = match[2]!;
    const segments = segmentsRaw.replace(/\/$/, '');
    const routePath = segments ? `/${segments}` : '/';
    nodes.push({
      kind: 'ui_screen',
      name: routePath,
      sourcePath: `${relPath}:1`,
      metadata: { app },
    });
  }

  return { nodes, edges: [] };
}
