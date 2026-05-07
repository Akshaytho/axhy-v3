/**
 * @derives(ADR-0002)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { extractReadsWrites } from '../../src/extractors/edges-reads-writes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('extractReadsWrites', () => {
  it('emits reads edge for prisma.X.findMany', async () => {
    const result = await extractReadsWrites({
      repoRoot: FIXTURE_DIR,
      files: ['sample-handler.ts'],
      fullExtraction: true,
    });

    const reads = result.edges.filter((e) => e.kind === 'reads' && e.dstKey.name === 'Worker');
    expect(reads.length).toBeGreaterThan(0);
  });

  it('emits writes edge for prisma.X.create', async () => {
    const result = await extractReadsWrites({
      repoRoot: FIXTURE_DIR,
      files: ['sample-handler.ts'],
      fullExtraction: true,
    });

    const writes = result.edges.filter((e) => e.kind === 'writes' && e.dstKey.name === 'Worker');
    expect(writes.length).toBeGreaterThan(0);
  });

  it('emits writes edge for prisma.X.delete', async () => {
    const result = await extractReadsWrites({
      repoRoot: FIXTURE_DIR,
      files: ['sample-handler.ts'],
      fullExtraction: true,
    });

    const writes = result.edges.filter(
      (e) => e.kind === 'writes' && e.dstKey.name === 'Worker' && e.metadata.op === 'delete',
    );
    expect(writes.length).toBe(1);
  });

  it('emits field-level reads from select projection (tier-1)', async () => {
    const result = await extractReadsWrites({
      repoRoot: FIXTURE_DIR,
      files: ['sample-handler.ts'],
      fullExtraction: true,
    });

    const fieldReads = result.edges.filter(
      (e) => e.kind === 'reads' && e.dstKey.kind === 'field' && e.dstKey.name === 'Worker.phone',
    );
    expect(fieldReads.length).toBe(1);
  });
});
