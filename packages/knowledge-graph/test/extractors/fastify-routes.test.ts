import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { extractFastifyRoutes } from '../../src/extractors/fastify-routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

// Phase-3 fold-in fix: extractor now gates to apps/backend/src/routes/ only.
// Test fixture path uses the real backend-routes pattern so the scoping filter passes.
const ROUTE_PATH = 'apps/backend/src/routes/sample-route.ts';

describe('extractFastifyRoutes', () => {
  it('emits api_endpoint node per Fastify route declaration', async () => {
    const result = await extractFastifyRoutes({
      repoRoot: FIXTURE_DIR,
      files: [ROUTE_PATH],
      fullExtraction: true,
    });

    const endpoints = result.nodes.filter((n) => n.kind === 'api_endpoint');
    expect(endpoints.map((n) => n.name).sort()).toEqual([
      'GET /workers',
      'PATCH /workers/:id',
      'POST /workers',
    ]);
  });

  it('captures method + path in metadata', async () => {
    const result = await extractFastifyRoutes({
      repoRoot: FIXTURE_DIR,
      files: [ROUTE_PATH],
      fullExtraction: true,
    });

    const post = result.nodes.find((n) => n.name === 'POST /workers');
    expect(post?.metadata).toMatchObject({ method: 'POST', path: '/workers' });
  });

  it('records source_path with line number', async () => {
    const result = await extractFastifyRoutes({
      repoRoot: FIXTURE_DIR,
      files: [ROUTE_PATH],
      fullExtraction: true,
    });

    const get = result.nodes.find((n) => n.name === 'GET /workers');
    expect(get?.sourcePath).toMatch(/sample-route\.ts:\d+$/);
  });
});
