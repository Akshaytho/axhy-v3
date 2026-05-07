import { describe, it, expect } from 'vitest';

import { extractComponents } from '../../src/extractors/components.js';

describe('extractComponents', () => {
  it('emits ui_component for files in apps/*/components/feature and apps/*/app/**/_components', async () => {
    const result = await extractComponents({
      repoRoot: '/repo',
      files: [
        'apps/admin-web/components/feature/PricingTable.tsx',
        'apps/admin-web/app/owner/operations/_components/AttendancePulse.tsx',
        'apps/supervisor-preview/components/feature/ChatComposer.tsx',
        // these should be EXCLUDED
        'packages/ui-web/src/Button.tsx',
        'packages/ui-native/src/Card.tsx',
        'apps/admin-web/components/Layout.tsx', // not under feature/
      ],
      fullExtraction: true,
    });

    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['AttendancePulse', 'ChatComposer', 'PricingTable']);
  });

  it('captures app metadata', async () => {
    const result = await extractComponents({
      repoRoot: '/repo',
      files: ['apps/supervisor-preview/components/feature/ChatComposer.tsx'],
      fullExtraction: true,
    });
    expect(result.nodes[0]!.metadata).toMatchObject({ app: 'supervisor-preview' });
  });
});
