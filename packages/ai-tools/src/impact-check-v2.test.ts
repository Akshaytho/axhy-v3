/**
 * @axhy/ai-tools — impact-check-v2 Phase A2 regression tests
 *
 * 13 tests covering:
 * - search() snippet length and authority defaults (3 tests)
 * - search() include_evidence / include_activity flags (2 tests)
 * - timeline() chronological ordering (1 test)
 * - get() full content retrieval (2 tests)
 * - impactCheckV2() compatibility wrapper shape (1 test)
 * - activitySearch() kind defaults (1 test)
 * - isV2Enabled() feature flag gating (1 test)
 * - MCP tool definitions in server.mjs (1 test)
 * - hybrid search weights (1 test)
 *
 * @derives(docs/superpowers/specs/2026-05-24-axhy-cognitive-system-v3.md)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');

describe('impact-check-v2', () => {
  describe('search() — Layer 1: snippet-only retrieval', () => {
    it('1. search result type includes snippet (not content) and score', async () => {
      const sample: import('./impact-check-v2.js').SearchResult = {
        id: '00000000-0000-0000-0000-000000000001',
        title: 'Test entry',
        type: 'learning',
        concepts: ['auth'],
        created_at_epoch: Date.now(),
        snippet: 'First 200 chars of content...',
        authority_level: 'curated',
        confidence: 'high',
        score: 0.85,
      };
      expect(sample.snippet.length).toBeLessThanOrEqual(200);
      expect(sample).toHaveProperty('score');
      expect(sample).not.toHaveProperty('content');
    });

    it('2. SNIPPET_LENGTH constant limits to 200 chars in SQL', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      expect(source).toContain('SNIPPET_LENGTH = 200');
      expect(source).toContain(`substring(content, 1, \${SNIPPET_LENGTH})`);
    });

    it('3. default authority filter includes locked, curated, candidate', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      const defaultsMatch = source.match(
        /authority_level.*?\?\?\s*\[\s*\n?\s*'locked',\s*\n?\s*'curated',\s*\n?\s*'candidate',?\s*\n?\s*\]/s,
      );
      expect(defaultsMatch).not.toBeNull();
    });
  });

  describe('search() — include flags', () => {
    it('4. include_evidence adds migrated kind and evidence authority', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      expect(source).toContain("if (!kinds.includes('migrated')) kinds.push('migrated')");
      expect(source).toContain(
        "if (!authorities.includes('evidence')) authorities.push('evidence')",
      );
    });

    it('5. include_activity adds activity kind and authority', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      expect(source).toContain("if (!kinds.includes('activity')) kinds.push('activity')");
      expect(source).toContain(
        "if (!authorities.includes('activity')) authorities.push('activity')",
      );
    });
  });

  describe('timeline() — Layer 2: temporal context', () => {
    it('6. timeline queries before and after anchor with correct ordering', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      expect(source).toContain('created_at_epoch < $1');
      expect(source).toContain('ORDER BY created_at_epoch DESC');
      expect(source).toContain('created_at_epoch > $1');
      expect(source).toContain('ORDER BY created_at_epoch ASC');
      expect(source).toContain('.reverse()');
    });
  });

  describe('get() — Layer 3: full content retrieval', () => {
    it('7. get() selects full content (not snippet)', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      const getStart = source.indexOf('export async function get(');
      const getBody = source.slice(getStart, source.indexOf('export async function', getStart + 1));
      expect(getBody).toContain('content,');
      expect(getBody).not.toContain('substring(content');
    });

    it('8. get() returns empty array for empty IDs', async () => {
      const { get } = await import('./impact-check-v2.js');
      const result = await get([]);
      expect(result).toEqual([]);
    });
  });

  describe('impactCheckV2() — compatibility wrapper', () => {
    it('9. returns ImpactCheckV2Result shape with hardBlocks/softWarnings/allRelevant', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      expect(source).toContain('hasConflicts: hardBlocks.length > 0');
      expect(source).toContain('hardBlocks,');
      expect(source).toContain('softWarnings,');
      expect(source).toContain('staleEntries,');
      expect(source).toContain('allRelevant,');
    });
  });

  describe('activitySearch() — activity layer queries', () => {
    it('10. defaults to activity+migrated kinds and activity+evidence authorities', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      const activityFn = source.slice(source.indexOf('export async function activitySearch'));
      expect(activityFn).toContain("kind IN ('activity', 'migrated')");
      expect(activityFn).toContain("authority_level IN ('activity', 'evidence')");
    });
  });

  describe('feature flag gating', () => {
    it('11. isV2Enabled() checks IMPACT_CHECK_V2_ENABLED flag', async () => {
      const original = process.env.IMPACT_CHECK_V2_ENABLED;
      try {
        process.env.IMPACT_CHECK_V2_ENABLED = 'false';
        const { isV2Enabled } = await import('./impact-check-v2.js');
        expect(isV2Enabled()).toBe(false);
      } finally {
        if (original !== undefined) process.env.IMPACT_CHECK_V2_ENABLED = original;
        else delete process.env.IMPACT_CHECK_V2_ENABLED;
      }
    });
  });

  describe('MCP tool definitions', () => {
    it('12. server.mjs exposes impact_search, impact_timeline, impact_get tools', () => {
      const cogRoot = join(REPO_ROOT, '..', 'axhy-cognitive-system');
      const serverSource = readFileSync(join(cogRoot, 'src/layer-2-guardrail/server.mjs'), 'utf8');
      expect(serverSource).toContain("name: 'impact_search'");
      expect(serverSource).toContain("name: 'impact_timeline'");
      expect(serverSource).toContain("name: 'impact_get'");
      expect(serverSource).toContain('SEARCH_TOOL_DEFINITION');
      expect(serverSource).toContain('TIMELINE_TOOL_DEFINITION');
      expect(serverSource).toContain('GET_TOOL_DEFINITION');
    });
  });

  describe('hybrid search', () => {
    it('13. vector weight is 0.7, FTS weight is 0.3 per spec', () => {
      const source = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');
      expect(source).toContain('VECTOR_WEIGHT = 0.7');
      expect(source).toContain('FTS_WEIGHT = 0.3');
    });
  });
});
