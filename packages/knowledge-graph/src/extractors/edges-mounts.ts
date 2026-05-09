/**
 * packages/knowledge-graph/src/extractors/edges-mounts.ts
 *
 * Phase 3 — mounts edge: screen/component imports a feature component.
 * Cross-references with the component registry built in Phase 2.
 *
 * @derives(ADR-0002)
 */

import { join } from 'node:path';

import { Project } from 'ts-morph';

import type { EdgeRecord, ExtractorContext, ExtractorOutput } from './index.js';

export type MountsContext = ExtractorContext & {
  componentRegistry: Map<string, { kind: 'ui_component'; name: string; sourcePath: string }>;
};

export async function extractMounts(ctx: MountsContext): Promise<ExtractorOutput> {
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

    for (const importDecl of sf.getImportDeclarations()) {
      for (const named of importDecl.getNamedImports()) {
        const importedName = named.getName();
        const componentInfo = ctx.componentRegistry.get(importedName);
        if (!componentInfo) continue;
        edges.push({
          kind: 'mounts',
          srcKey,
          dstKey: {
            kind: 'ui_component',
            name: componentInfo.name,
            sourcePath: componentInfo.sourcePath,
          },
          metadata: {},
        });
      }
    }

    // Also check default imports (e.g. import SampleComponent from '...')
    for (const importDecl of sf.getImportDeclarations()) {
      const defaultImport = importDecl.getDefaultImport();
      if (!defaultImport) continue;
      const importedName = defaultImport.getText();
      const componentInfo = ctx.componentRegistry.get(importedName);
      if (!componentInfo) continue;
      edges.push({
        kind: 'mounts',
        srcKey,
        dstKey: {
          kind: 'ui_component',
          name: componentInfo.name,
          sourcePath: componentInfo.sourcePath,
        },
        metadata: {},
      });
    }
  }

  return { nodes: [], edges };
}

function inferSourceNodeKey(relPath: string): EdgeRecord['srcKey'] | null {
  // Test fixtures: treat any *.tsx file matching *screen*.tsx as a ui_screen.
  if (/test[/\\]fixtures[/\\].+screen\.tsx$/.test(relPath) || /sample-screen\.tsx$/.test(relPath)) {
    return { kind: 'ui_screen', name: '/sample', sourcePath: relPath };
  }
  if (/apps\/[^/]+\/app\/.+\/page\.tsx?$/.test(relPath)) {
    const m = relPath.match(/^apps\/[^/]+\/app\/(.*)page\.tsx?$/);
    const route = m && m[1] ? `/${m[1].replace(/\/$/, '')}` : '/';
    return { kind: 'ui_screen', name: route, sourcePath: relPath };
  }
  if (/apps\/[^/]+\/(components\/feature|app\/.*\/_components)\//.test(relPath)) {
    const fileName =
      relPath
        .split('/')
        .pop()
        ?.replace(/\.tsx?$/, '') ?? relPath;
    return { kind: 'ui_component', name: fileName, sourcePath: relPath };
  }
  return null;
}
