/**
 * packages/knowledge-graph/src/extractors/edges-navigates-to.ts
 *
 * Phase 4 — navigates_to edges.
 * Covers: <Link href>, router.push, router.replace, redirect().
 * Static literal → exact target.
 * TemplateExpression with parseable head → dynamic=true, parsedPrefix.
 * Unresolvable → unresolvable=true.
 *
 * JSX note: forEachDescendant + Node.isJsxAttribute() predicate is used
 * instead of getDescendantsOfKind(SyntaxKind.JsxAttribute) because the
 * IMPL_PLAN example used incorrect ts-morph API (passing a predicate fn
 * where a SyntaxKind enum is expected). See IMPL_PLAN constraint note #10.
 *
 * redirect() in Next.js Server Components is a top-level identifier call,
 * matched via Node.isIdentifier(expr) && getText() === 'redirect'.
 *
 * RN navigation.navigate is deferred — no RN code exists yet (panel Q5 lock).
 *
 * @derives(ADR-0002)
 */

import { join } from 'node:path';

import { Node, Project } from 'ts-morph';

import type { EdgeRecord, ExtractorContext, ExtractorOutput } from './index.js';

const NAV_METHODS = new Set(['push', 'replace']);

export async function extractNavigatesTo(ctx: ExtractorContext): Promise<ExtractorOutput> {
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

    sf.forEachDescendant((node) => {
      // <Link href="..."> or <Link href={...}>
      if (Node.isJsxAttribute(node) && node.getNameNode().getText() === 'href') {
        const init = node.getInitializer();
        if (!init) return;
        if (Node.isStringLiteral(init)) {
          edges.push(buildEdge(srcKey, init.getLiteralText(), { via: 'Link' }));
        } else if (Node.isJsxExpression(init)) {
          const expr = init.getExpression();
          if (!expr) return;
          if (Node.isStringLiteral(expr)) {
            edges.push(buildEdge(srcKey, expr.getLiteralText(), { via: 'Link' }));
          } else if (Node.isTemplateExpression(expr)) {
            edges.push(buildEdgeFromTemplate(srcKey, expr, { via: 'Link' }));
          } else {
            edges.push(buildEdge(srcKey, '__unresolvable__', { via: 'Link', unresolvable: true }));
          }
        }
        return;
      }

      if (!Node.isCallExpression(node)) return;
      const expr = node.getExpression();

      // router.push('...') / router.replace('...')
      if (Node.isPropertyAccessExpression(expr) && NAV_METHODS.has(expr.getName())) {
        const arg = node.getArguments()[0];
        if (!arg) return;
        if (Node.isStringLiteral(arg)) {
          edges.push(buildEdge(srcKey, arg.getLiteralText(), { via: `router.${expr.getName()}` }));
        } else if (Node.isTemplateExpression(arg)) {
          edges.push(buildEdgeFromTemplate(srcKey, arg, { via: `router.${expr.getName()}` }));
        } else {
          edges.push(
            buildEdge(srcKey, '__unresolvable__', {
              via: `router.${expr.getName()}`,
              unresolvable: true,
            }),
          );
        }
        return;
      }

      // redirect('...') — top-level identifier call in Server Components
      if (Node.isIdentifier(expr) && expr.getText() === 'redirect') {
        const arg = node.getArguments()[0];
        if (!arg) return;
        if (Node.isStringLiteral(arg)) {
          edges.push(buildEdge(srcKey, arg.getLiteralText(), { via: 'redirect' }));
        } else if (Node.isTemplateExpression(arg)) {
          edges.push(buildEdgeFromTemplate(srcKey, arg, { via: 'redirect' }));
        } else {
          edges.push(
            buildEdge(srcKey, '__unresolvable__', { via: 'redirect', unresolvable: true }),
          );
        }
      }
    });
  }

  return { nodes: [], edges };
}

function buildEdge(
  srcKey: EdgeRecord['srcKey'],
  target: string,
  metadata: Record<string, unknown>,
): EdgeRecord {
  return {
    kind: 'navigates_to',
    srcKey,
    dstKey: { kind: 'ui_screen', name: target, sourcePath: null },
    metadata,
  };
}

function buildEdgeFromTemplate(
  srcKey: EdgeRecord['srcKey'],
  tmpl: import('ts-morph').TemplateExpression,
  metadata: Record<string, unknown>,
): EdgeRecord {
  // Phase-4 v1 choice: use the template HEAD literal (text before the first
  // interpolation) as parsedPrefix. For `/visit/${id}` the head is `/visit/`
  // which is more useful than the last-span tail (empty string here).
  // This matches SPEC §5.2c dynamic=true + parsedPrefix form.
  // Phase-N task: switch to full static-segment analysis when needed.
  const head = tmpl.getHead().getLiteralText();
  const parsedPrefix = head || '/';
  const target = parsedPrefix.endsWith('/') ? `${parsedPrefix}[id]` : `${parsedPrefix}/[id]`;
  return {
    kind: 'navigates_to',
    srcKey,
    dstKey: { kind: 'ui_screen', name: target, sourcePath: null },
    metadata: { ...metadata, dynamic: true, parsedPrefix },
  };
}

function inferSourceNodeKey(relPath: string): EdgeRecord['srcKey'] | null {
  // Test fixtures: files matching *-nav-screen.tsx or *screen.tsx treated as ui_screen.
  // Pattern matches both "test/fixtures/sample-nav-screen.tsx" (relative to repo root)
  // and "sample-nav-screen.tsx" (relative to fixtures dir, used in unit tests).
  if (/(?:test[/\\]fixtures[/\\])?sample-nav-screen\.tsx$/.test(relPath)) {
    return { kind: 'ui_screen', name: '/sample-nav', sourcePath: relPath };
  }
  if (/(?:test[/\\]fixtures[/\\])?sample-screen\.tsx$/.test(relPath)) {
    return { kind: 'ui_screen', name: '/sample', sourcePath: relPath };
  }
  if (/apps\/[^/]+\/app\/.+\/page\.tsx?$/.test(relPath)) {
    const m = relPath.match(/^apps\/[^/]+\/app\/(.*)page\.tsx?$/);
    const route = m && m[1] ? `/${m[1].replace(/\/$/, '')}` : '/';
    return { kind: 'ui_screen', name: route, sourcePath: relPath };
  }
  return null;
}
