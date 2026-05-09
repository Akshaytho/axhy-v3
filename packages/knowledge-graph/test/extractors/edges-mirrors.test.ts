/**
 * @derives(ADR-0002)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { extractMirrors } from '../../src/extractors/edges-mirrors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('extractMirrors', () => {
  it('emits mirrors edge from screen → state machine', async () => {
    const result = await extractMirrors({
      repoRoot: FIXTURE_DIR,
      files: ['sample-mirror-screen.tsx'],
      fullExtraction: true,
      machineRegistry: new Map([
        [
          'workerMachine',
          { name: 'worker', sourcePath: 'packages/state-machines/src/worker.ts:1' },
        ],
      ]),
    });

    const mirrors = result.edges.filter((e) => e.kind === 'mirrors');
    expect(mirrors.length).toBe(1);
    expect(mirrors[0]!.dstKey.name).toBe('worker');
  });

  it('captures relevantStates from state.matches() literals', async () => {
    const result = await extractMirrors({
      repoRoot: FIXTURE_DIR,
      files: ['sample-mirror-screen.tsx'],
      fullExtraction: true,
      machineRegistry: new Map([
        [
          'workerMachine',
          { name: 'worker', sourcePath: 'packages/state-machines/src/worker.ts:1' },
        ],
      ]),
    });

    const mirror = result.edges.find((e) => e.kind === 'mirrors');
    expect(mirror?.metadata.relevantStates).toEqual(['ACTIVE', 'INACTIVE']);
  });
});
