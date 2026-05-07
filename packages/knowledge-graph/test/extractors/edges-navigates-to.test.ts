/**
 * @derives(SPEC.md §5.2c)
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { extractNavigatesTo } from '../../src/extractors/edges-navigates-to.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('extractNavigatesTo', () => {
  it('emits navigates_to from <Link href> string literal', async () => {
    const result = await extractNavigatesTo({
      repoRoot: FIXTURE_DIR,
      files: ['sample-nav-screen.tsx'],
      fullExtraction: true,
    });

    const links = result.edges.filter(
      (e) => e.kind === 'navigates_to' && e.dstKey.name === '/pricing',
    );
    expect(links.length).toBe(1);
    expect(links[0]!.metadata.via).toBe('Link');
  });

  it('emits navigates_to from router.push string literal', async () => {
    const result = await extractNavigatesTo({
      repoRoot: FIXTURE_DIR,
      files: ['sample-nav-screen.tsx'],
      fullExtraction: true,
    });

    const pushes = result.edges.filter(
      (e) => e.kind === 'navigates_to' && e.dstKey.name === '/login',
    );
    expect(pushes.length).toBe(1);
    expect(pushes[0]!.metadata.via).toBe('router.push');
  });

  it('emits navigates_to with metadata.dynamic=true for template literals', async () => {
    const result = await extractNavigatesTo({
      repoRoot: FIXTURE_DIR,
      files: ['sample-nav-screen.tsx'],
      fullExtraction: true,
    });

    const dynamic = result.edges.find(
      (e) => e.kind === 'navigates_to' && e.metadata.dynamic === true,
    );
    expect(dynamic?.metadata.parsedPrefix).toBe('/visit/');
  });

  it('marks unresolvable hrefs with metadata.unresolvable=true', async () => {
    const result = await extractNavigatesTo({
      repoRoot: FIXTURE_DIR,
      files: ['sample-nav-screen.tsx'],
      fullExtraction: true,
    });

    const unresolvable = result.edges.find(
      (e) => e.kind === 'navigates_to' && e.metadata.unresolvable === true,
    );
    expect(unresolvable).toBeDefined();
  });
});
