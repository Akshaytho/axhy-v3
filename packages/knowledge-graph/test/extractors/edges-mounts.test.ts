/**
 * @derives(ADR-0002)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { extractMounts } from '../../src/extractors/edges-mounts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('extractMounts', () => {
  it('emits mounts edge from screen → imported feature component', async () => {
    const componentRegistry = new Map([
      [
        'SampleComponent',
        {
          kind: 'ui_component' as const,
          name: 'SampleComponent',
          sourcePath: 'apps/x/components/feature/SampleComponent.tsx',
        },
      ],
    ]);
    const result = await extractMounts({
      repoRoot: FIXTURE_DIR,
      files: ['sample-screen.tsx'],
      fullExtraction: true,
      componentRegistry,
    });

    const mounts = result.edges.filter((e) => e.kind === 'mounts');
    expect(mounts.length).toBe(1);
    expect(mounts[0]!.dstKey).toMatchObject({ kind: 'ui_component', name: 'SampleComponent' });
  });
});
