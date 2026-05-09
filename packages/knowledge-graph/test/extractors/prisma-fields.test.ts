import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { extractPrismaFields } from '../../src/extractors/prisma-fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('extractPrismaFields', () => {
  it('emits one field node per Prisma field with belongs_to edge to entity', async () => {
    const result = await extractPrismaFields({
      repoRoot: FIXTURE_DIR,
      files: ['sample-schema.prisma'],
      fullExtraction: true,
    });

    const fieldNodes = result.nodes.filter((n) => n.kind === 'field');
    expect(fieldNodes.map((n) => n.name).sort()).toEqual([
      'Site.companyId',
      'Site.id',
      'Site.name',
      'Worker.baseSalary',
      'Worker.companyId',
      'Worker.createdAt',
      'Worker.id',
      'Worker.name',
      'Worker.phone',
    ]);
  });

  it('marks @personal fields with metadata.personal=true', async () => {
    const result = await extractPrismaFields({
      repoRoot: FIXTURE_DIR,
      files: ['sample-schema.prisma'],
      fullExtraction: true,
    });

    const phone = result.nodes.find((n) => n.name === 'Worker.phone');
    const name = result.nodes.find((n) => n.name === 'Worker.name');
    const id = result.nodes.find((n) => n.name === 'Worker.id');

    expect(phone?.metadata.personal).toBe(true);
    expect(name?.metadata.personal).toBe(true);
    expect(id?.metadata.personal).toBeUndefined();
  });

  it('emits belongs_to edge from each field to its parent entity', async () => {
    const result = await extractPrismaFields({
      repoRoot: FIXTURE_DIR,
      files: ['sample-schema.prisma'],
      fullExtraction: true,
    });

    const phoneEdges = result.edges.filter(
      (e) => e.srcKey.name === 'Worker.phone' && e.kind === 'belongs_to',
    );
    expect(phoneEdges.length).toBe(1);
    expect(phoneEdges[0]!.dstKey).toMatchObject({
      kind: 'entity',
      name: 'Worker',
    });
  });

  it('records source_path with line number for each field', async () => {
    const result = await extractPrismaFields({
      repoRoot: FIXTURE_DIR,
      files: ['sample-schema.prisma'],
      fullExtraction: true,
    });

    const phone = result.nodes.find((n) => n.name === 'Worker.phone');
    expect(phone?.sourcePath).toMatch(/sample-schema\.prisma:\d+$/);
  });
});
