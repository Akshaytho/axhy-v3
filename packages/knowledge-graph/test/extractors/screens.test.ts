import { describe, it, expect } from 'vitest';

import { extractScreens } from '../../src/extractors/screens.js';

describe('extractScreens', () => {
  it('emits ui_screen node per page.tsx with route path inferred from folder structure', async () => {
    const result = await extractScreens({
      repoRoot: '/repo',
      files: [
        'apps/admin-web/app/page.tsx',
        'apps/admin-web/app/pricing/page.tsx',
        'apps/admin-web/app/owner/operations/page.tsx',
        'apps/admin-web/app/hr/workers/[id]/page.tsx',
        'apps/admin-web/app/system/graph/page.tsx',
        'apps/supervisor-preview/app/today/page.tsx',
      ],
      fullExtraction: true,
    });

    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toEqual([
      '/',
      '/hr/workers/[id]',
      '/owner/operations',
      '/pricing',
      '/system/graph',
      '/today',
    ]);
  });

  it('captures app metadata', async () => {
    const result = await extractScreens({
      repoRoot: '/repo',
      files: ['apps/supervisor-preview/app/today/page.tsx'],
      fullExtraction: true,
    });
    expect(result.nodes[0]!.metadata).toMatchObject({ app: 'supervisor-preview' });
  });
});
