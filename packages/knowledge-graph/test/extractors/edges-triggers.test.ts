/**
 * @derives(ADR-0002)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { extractTriggers } from '../../src/extractors/edges-triggers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('extractTriggers', () => {
  it('emits triggers edge from fetch literal', async () => {
    const result = await extractTriggers({
      repoRoot: FIXTURE_DIR,
      files: ['sample-trigger-screen.tsx'],
      fullExtraction: true,
    });

    const literal = result.edges.find(
      (e) => e.kind === 'triggers' && e.dstKey.name === 'GET /api/health',
    );
    expect(literal?.metadata.discoveredVia).toBe('fetch_literal');
  });

  it('emits triggers edge from fetch template, extracting static tail', async () => {
    const result = await extractTriggers({
      repoRoot: FIXTURE_DIR,
      files: ['sample-trigger-screen.tsx'],
      fullExtraction: true,
    });

    const template = result.edges.find(
      (e) => e.kind === 'triggers' && e.dstKey.name === 'POST /auth/otp/request',
    );
    expect(template?.metadata.discoveredVia).toBe('fetch_template');
  });
});
