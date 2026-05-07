/**
 * packages/knowledge-graph/src/extractors/prisma-fields.ts
 *
 * Stage 2a — Prisma model fields → field nodes.
 * Triple-slash @personal annotation → metadata.personal = true.
 * Uses line-by-line parsing (no external Prisma parser dep needed here).
 *
 * @derives(ADR-0002)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExtractorContext, ExtractorOutput, NodeRecord, EdgeRecord } from './index.js';

export async function extractPrismaFields(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const nodes: NodeRecord[] = [];
  const edges: EdgeRecord[] = [];
  const prismaFiles = ctx.files.filter((f) => f.endsWith('.prisma'));

  for (const relPath of prismaFiles) {
    const fullPath = join(ctx.repoRoot, relPath);
    const content = readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
      if (!modelMatch) continue;
      const modelName = modelMatch[1]!;

      let j = i + 1;
      let pendingPersonal = false;
      while (j < lines.length) {
        const fieldLine = lines[j];
        if (fieldLine === undefined) break;
        if (fieldLine.startsWith('}')) break;

        // Triple-slash annotation precedes field declaration.
        if (/^\s*\/\/\/\s*@personal/.test(fieldLine)) {
          pendingPersonal = true;
          j++;
          continue;
        }

        // Field declaration: indent + name + type (skip plain // comments)
        if (!/^\s*\/\//.test(fieldLine)) {
          const fieldMatch = fieldLine.match(/^\s+(\w+)\s+(\w+)/);
          if (fieldMatch) {
            const fieldName = fieldMatch[1]!;
            const fieldType = fieldMatch[2]!;
            const sourcePath = `${relPath}:${j + 1}`;
            const fullName = `${modelName}.${fieldName}`;
            const metadata: Record<string, unknown> = {
              model: modelName,
              prismaField: fieldName,
              type: fieldType,
            };
            if (pendingPersonal) metadata['personal'] = true;

            nodes.push({
              kind: 'field',
              name: fullName,
              sourcePath,
              metadata,
            });
            edges.push({
              kind: 'belongs_to',
              srcKey: { kind: 'field', name: fullName, sourcePath },
              dstKey: { kind: 'entity', name: modelName, sourcePath: relPath },
              metadata: {},
            });

            pendingPersonal = false;
          } else {
            // Non-field line (decorators like @@index etc.) — reset pendingPersonal
            pendingPersonal = false;
          }
        }

        j++;
      }
    }
  }

  return { nodes, edges };
}
