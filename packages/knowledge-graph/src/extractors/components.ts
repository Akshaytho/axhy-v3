/**
 * packages/knowledge-graph/src/extractors/components.ts
 *
 * Stage 2d — Feature-scoped UI component extraction.
 * Only paths under apps/APP/components/feature/ OR apps/APP/app/_components/.
 * packages/ui-web and packages/ui-native are EXPLICITLY EXCLUDED (panel Q4 lock).
 *
 * @derives(ADR-0002)
 */

import type { ExtractorContext, ExtractorOutput, NodeRecord } from './index.js';

const COMPONENT_RE = /^apps\/([^/]+)\/(?:components\/feature|app\/.*\/_components)\/(.+)\.tsx?$/;

export async function extractComponents(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const nodes: NodeRecord[] = [];

  for (const relPath of ctx.files) {
    const match = relPath.match(COMPONENT_RE);
    if (!match) continue;
    const app = match[1]!;
    const namePath = match[2]!;
    const fileName = namePath.split('/').pop() ?? namePath;
    nodes.push({
      kind: 'ui_component',
      name: fileName,
      sourcePath: `${relPath}:1`,
      metadata: { app },
    });
  }

  return { nodes, edges: [] };
}
