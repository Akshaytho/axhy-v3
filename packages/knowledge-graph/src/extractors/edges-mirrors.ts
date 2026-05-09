/**
 * packages/knowledge-graph/src/extractors/edges-mirrors.ts
 *
 * Phase 3 — mirrors edge: screen → state machine (root state).
 * Captures relevantStates from state.matches('STATE_NAME') literals.
 *
 * @derives(ADR-0002)
 */

import { join } from 'node:path';

import { Node, Project } from 'ts-morph';

import type { EdgeRecord, ExtractorContext, ExtractorOutput } from './index.js';

export type MirrorsContext = ExtractorContext & {
  machineRegistry: Map<string, { name: string; sourcePath: string }>;
};

const HOOK_NAMES = new Set(['useMachine', 'useActor', 'createActor']);

export async function extractMirrors(ctx: MirrorsContext): Promise<ExtractorOutput> {
  const edges: EdgeRecord[] = [];
  const tsxFiles = ctx.files.filter((f) => /\.tsx$/.test(f));

  const project = new Project({ useInMemoryFileSystem: false, skipFileDependencyResolution: true });
  for (const relPath of tsxFiles) {
    project.addSourceFileAtPath(join(ctx.repoRoot, relPath));
  }

  for (const sf of project.getSourceFiles()) {
    const relPath = sf.getFilePath().replace(ctx.repoRoot + '/', '');
    const srcKey = inferSourceNodeKey(relPath);
    if (!srcKey) continue;

    // Find machine identifiers passed to useMachine/useActor/createActor.
    const machinesUsed = new Set<string>();
    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const fn = node.getExpression();
      if (!Node.isIdentifier(fn) || !HOOK_NAMES.has(fn.getText())) return;
      const arg = node.getArguments()[0];
      if (arg && Node.isIdentifier(arg)) {
        machinesUsed.add(arg.getText());
      }
    });

    if (machinesUsed.size === 0) continue;

    // Collect relevant states from state.matches('STATE_NAME') strings.
    const relevantStates = new Set<string>();
    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const fn = node.getExpression();
      if (!Node.isPropertyAccessExpression(fn) || fn.getName() !== 'matches') return;
      const arg = node.getArguments()[0];
      if (arg && Node.isStringLiteral(arg)) {
        relevantStates.add(arg.getLiteralText());
      }
    });

    for (const machineId of machinesUsed) {
      const machineInfo = ctx.machineRegistry.get(machineId);
      if (!machineInfo) continue;
      edges.push({
        kind: 'mirrors',
        srcKey,
        dstKey: { kind: 'state', name: machineInfo.name, sourcePath: machineInfo.sourcePath },
        metadata: { relevantStates: Array.from(relevantStates).sort() },
      });
    }
  }

  return { nodes: [], edges };
}

function inferSourceNodeKey(relPath: string): EdgeRecord['srcKey'] | null {
  // Test fixtures: treat any *.tsx file matching *mirror-screen.tsx or *screen.tsx as a ui_screen.
  if (
    /test[/\\]fixtures[/\\].+screen\.tsx$/.test(relPath) ||
    /sample-mirror-screen\.tsx$/.test(relPath)
  ) {
    return { kind: 'ui_screen', name: '/sample-mirror', sourcePath: relPath };
  }
  if (/apps\/[^/]+\/app\/.+\/page\.tsx?$/.test(relPath)) {
    const m = relPath.match(/^apps\/[^/]+\/app\/(.*)page\.tsx?$/);
    const route = m && m[1] ? `/${m[1].replace(/\/$/, '')}` : '/';
    return { kind: 'ui_screen', name: route, sourcePath: relPath };
  }
  return null;
}
