/**
 * packages/knowledge-graph/src/extractors/edges-triggers.ts
 *
 * Phase 4 — triggers edges from fetch() calls.
 *   fetch_literal: bare fetch('/api/...').
 *   fetch_template: fetch(`${API_URL}/...`); extract literal tail from first span.
 *
 * Template extraction design (Phase 4 v1):
 *   For `${API_URL}/auth/otp/request`, getTemplateSpans() returns one span
 *   whose literal is '/auth/otp/request'. We take the FIRST span's literal text
 *   as metadata.parsedPrefix — this gives '/auth/otp/request' for the common
 *   `${API_URL}/path` pattern, which is more useful than the HEAD (empty string).
 *   For multi-interpolation like `${API_URL}/visits/${id}/photos`, the first span
 *   gives '/visits/' which becomes parsedPrefix='/visits/'. This is an intentional
 *   v1 simplification — Phase-N task: full static-segment reconstruction.
 *
 * No @axhy/api-client exists today (per Phase 1 discovery, ADR-0011 pending).
 * When @axhy/api-client lands, extend with apiClient.* AST traversal.
 * metadata.discoveredVia = 'api_client' will be added at that point.
 *
 * @derives(ADR-0002)
 */

import { join } from 'node:path';

import { Node, Project } from 'ts-morph';

import type { EdgeRecord, ExtractorContext, ExtractorOutput } from './index.js';

export async function extractTriggers(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const edges: EdgeRecord[] = [];
  const tsFiles = ctx.files.filter((f) => /\.tsx?$/.test(f));

  const project = new Project({ useInMemoryFileSystem: false, skipFileDependencyResolution: true });
  for (const relPath of tsFiles) {
    project.addSourceFileAtPath(join(ctx.repoRoot, relPath));
  }

  for (const sf of project.getSourceFiles()) {
    const relPath = sf.getFilePath().replace(ctx.repoRoot + '/', '');
    const srcKey = inferSourceNodeKey(relPath);
    if (!srcKey) continue;

    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const fn = node.getExpression();
      if (!Node.isIdentifier(fn) || fn.getText() !== 'fetch') return;

      const args = node.getArguments();
      if (args.length === 0) return;
      const urlArg = args[0];
      const initArg = args[1];

      const method = inferMethod(initArg);

      if (Node.isStringLiteral(urlArg)) {
        const url = urlArg.getLiteralText();
        edges.push(
          buildTrigger(srcKey, method, url, { discoveredVia: 'fetch_literal', kind: 'direct' }),
        );
      } else if (Node.isTemplateExpression(urlArg)) {
        const tail = extractFirstSpanLiteral(urlArg);
        if (tail) {
          edges.push(
            buildTrigger(srcKey, method, tail, {
              discoveredVia: 'fetch_template',
              kind: 'direct',
              parsedPrefix: tail,
            }),
          );
        }
      }
    });
  }

  return { nodes: [], edges };
}

function inferMethod(initArg: import('ts-morph').Node | undefined): string {
  if (!initArg || !Node.isObjectLiteralExpression(initArg)) return 'GET';
  const methodProp = initArg.getProperty('method');
  if (!methodProp || !Node.isPropertyAssignment(methodProp)) return 'GET';
  const init = methodProp.getInitializer();
  if (init && Node.isStringLiteral(init)) {
    return init.getLiteralText().toUpperCase();
  }
  return 'GET';
}

function extractFirstSpanLiteral(tmpl: import('ts-morph').TemplateExpression): string | null {
  // Phase-4 v1: take the FIRST span's literal text as the static tail/prefix.
  // For `${API_URL}/auth/otp/request`, the first span literal is '/auth/otp/request'.
  // For `${API_URL}/visits/${id}/photos`, the first span literal is '/visits/' —
  // becomes parsedPrefix='/visits/'. Intentional v1 simplification.
  // Phase-N task: switch to full multi-span reconstruction if needed.
  const spans = tmpl.getTemplateSpans();
  if (spans.length === 0) return null;
  const firstSpanLiteral = spans[0]!.getLiteral().getLiteralText();
  return firstSpanLiteral || null;
}

function buildTrigger(
  srcKey: EdgeRecord['srcKey'],
  method: string,
  pathLike: string,
  metadata: Record<string, unknown>,
): EdgeRecord {
  // Strip leading https://host prefix (from fully qualified URLs) if present.
  const normalized = pathLike.replace(/^https?:\/\/[^/]+/, '');
  return {
    kind: 'triggers',
    srcKey,
    dstKey: { kind: 'api_endpoint', name: `${method} ${normalized}`, sourcePath: null },
    metadata,
  };
}

function inferSourceNodeKey(relPath: string): EdgeRecord['srcKey'] | null {
  // Test fixtures: files matching *-trigger-screen.tsx treated as ui_screen.
  if (/(?:test[/\\]fixtures[/\\])?sample-trigger-screen\.tsx$/.test(relPath)) {
    return { kind: 'ui_screen', name: '/sample-trigger', sourcePath: relPath };
  }
  // Backend route files can trigger other routes (indirect_dispatch).
  if (/apps\/backend\/src\/routes\/.+\.ts$/.test(relPath)) {
    return { kind: 'api_endpoint', name: relPath, sourcePath: relPath };
  }
  if (/apps\/[^/]+\/app\/.+\/page\.tsx?$/.test(relPath)) {
    const m = relPath.match(/^apps\/[^/]+\/app\/(.*)page\.tsx?$/);
    const route = m && m[1] ? `/${m[1].replace(/\/$/, '')}` : '/';
    return { kind: 'ui_screen', name: route, sourcePath: relPath };
  }
  return null;
}
