import { describe, it, expect } from 'vitest';

import { extractNextjsRoutes } from '../../src/extractors/nextjs-routes.js';

describe('extractNextjsRoutes', () => {
  it('derives endpoint name + path from Next.js App Router file path', async () => {
    const result = await extractNextjsRoutes({
      repoRoot: '/repo',
      files: [
        'apps/admin-web/app/api/graph/route.ts',
        'apps/admin-web/app/api/auth/otp/request/route.ts',
        'apps/admin-web/app/api/workers/[id]/route.ts',
      ],
      fullExtraction: true,
    });

    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['GET /api/auth/otp/request', 'GET /api/graph', 'GET /api/workers/[id]']);
  });

  it('marks app metadata as the parent app folder', async () => {
    const result = await extractNextjsRoutes({
      repoRoot: '/repo',
      files: ['apps/admin-web/app/api/graph/route.ts'],
      fullExtraction: true,
    });

    expect(result.nodes[0]!.metadata).toMatchObject({ app: 'admin-web', method: 'GET' });
  });
});
