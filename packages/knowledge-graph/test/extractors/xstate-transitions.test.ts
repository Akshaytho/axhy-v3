import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { extractXStateTransitions } from '../../src/extractors/xstate-transitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('extractXStateTransitions', () => {
  it('emits state node for machine root + each child state', async () => {
    const result = await extractXStateTransitions({
      repoRoot: FIXTURE_DIR,
      files: ['sample-machine.ts'],
      fullExtraction: true,
    });

    const stateNames = result.nodes
      .filter((n) => n.kind === 'state')
      .map((n) => n.name)
      .sort();
    expect(stateNames).toEqual([
      'visit',
      'visit.ABORTED',
      'visit.DISPATCHED',
      'visit.ENDED',
      'visit.STARTED',
    ]);
  });

  it('emits belongs_to edge from each child state to machine root', async () => {
    const result = await extractXStateTransitions({
      repoRoot: FIXTURE_DIR,
      files: ['sample-machine.ts'],
      fullExtraction: true,
    });

    const belongs = result.edges.filter(
      (e) => e.kind === 'belongs_to' && e.srcKey.name === 'visit.STARTED',
    );
    expect(belongs.length).toBe(1);
    expect(belongs[0]!.dstKey.name).toBe('visit');
  });

  it('emits transitions_to edge for each transition', async () => {
    const result = await extractXStateTransitions({
      repoRoot: FIXTURE_DIR,
      files: ['sample-machine.ts'],
      fullExtraction: true,
    });

    const transitions = result.edges.filter((e) => e.kind === 'transitions_to');
    const fromStarted = transitions.filter((e) => e.srcKey.name === 'visit.STARTED');
    expect(fromStarted.length).toBe(2);
    expect(fromStarted.map((e) => e.dstKey.name).sort()).toEqual(['visit.ABORTED', 'visit.ENDED']);
  });
});
