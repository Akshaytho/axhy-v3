/**
 * @axhy/ai-tools — brain_entries Phase A1 regression tests
 *
 * 10 tests covering:
 * - Authority mapping for all doc categories (6 tests)
 * - Title extraction (2 tests)
 * - Concept extraction (1 test)
 * - Feature flag defaults (1 test)
 *
 * Plus 3 SQL migration integrity checks (bonus).
 *
 * @derives(docs/superpowers/specs/2026-05-24-axhy-cognitive-system-v3.md)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  classifyByPath,
  extractTitle,
  extractConcepts,
  type AuthorityMapping,
} from './brain-schema.js';
import { isEnabled } from './feature-flags.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');
const MIGRATION_SQL = readFileSync(
  join(REPO_ROOT, 'scripts/migrations/0004-brain-entries-v3.sql'),
  'utf8',
);

// ─── 1-6: Authority mapping ────────────────────────────────────────────────

describe('classifyByPath — authority mapping', () => {
  it('1. locked docs → authority=locked, confidence=high', () => {
    const result = classifyByPath('docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md');
    expect(result).toEqual<AuthorityMapping>({
      kind: 'curated',
      authority_level: 'locked',
      confidence: 'high',
      type: 'locked_doc',
    });
  });

  it('2. learnings → authority=curated, confidence=high', () => {
    const result = classifyByPath(
      'docs/learnings/2026-05-19-all-brain-build-requires-schema-migration.md',
    );
    expect(result).toEqual<AuthorityMapping>({
      kind: 'curated',
      authority_level: 'curated',
      confidence: 'high',
      type: 'learning',
    });
  });

  it('3. retros → authority=candidate, confidence=medium', () => {
    const result = classifyByPath('docs/retros/2026-05-22-1918.md');
    expect(result).toEqual<AuthorityMapping>({
      kind: 'curated',
      authority_level: 'candidate',
      confidence: 'medium',
      type: 'retro',
    });
  });

  it('4. specs → authority=candidate, confidence=medium', () => {
    const result = classifyByPath('docs/specs/2026-05-09-phase-c-assignment-design.md');
    expect(result).toEqual<AuthorityMapping>({
      kind: 'curated',
      authority_level: 'candidate',
      confidence: 'medium',
      type: 'spec',
    });
  });

  it('5. decisions → authority=curated, confidence=high, type=decision', () => {
    const result = classifyByPath('docs/decisions/0022-pgvector-railway.md');
    expect(result).toEqual<AuthorityMapping>({
      kind: 'curated',
      authority_level: 'curated',
      confidence: 'high',
      type: 'decision',
    });
  });

  it('6. unknown path → kind=curated, authority=candidate', () => {
    const result = classifyByPath('docs/protocols/self-reasoning.md');
    expect(result.kind).toBe('curated');
    expect(result.authority_level).toBe('candidate');
    expect(result.confidence).toBe('medium');
  });
});

// ─── 7-8: Title extraction ─────────────────────────────────────────────────

describe('extractTitle', () => {
  it('7. extracts markdown H1 heading', () => {
    const content = '# CORE MIND\n\nYou are a reasoning system.';
    expect(extractTitle(content)).toBe('CORE MIND');
  });

  it('8. returns null when no heading exists', () => {
    const content = 'Just some plain text without any heading.';
    expect(extractTitle(content)).toBeNull();
  });
});

// ─── 9: Concept extraction ─────────────────────────────────────────────────

describe('extractConcepts', () => {
  it('9. extracts path-based concepts', () => {
    const concepts = extractConcepts('docs/specs/auth-rate-limit.md', '# Auth Rate Limiting');
    expect(concepts).toContain('auth');
    expect(concepts).toContain('rate-limit');
  });
});

// ─── 10: Feature flag defaults ──────────────────────────────────────────────

describe('feature flags', () => {
  it('10. IMPACT_CHECK_V2_ENABLED defaults to false', () => {
    delete process.env.IMPACT_CHECK_V2_ENABLED;
    expect(isEnabled('IMPACT_CHECK_V2_ENABLED')).toBe(false);
  });
});

// ─── SQL migration integrity (bonus) ────────────────────────────────────────

describe('migration SQL integrity', () => {
  it('creates brain_entries table with all required columns', () => {
    expect(MIGRATION_SQL).toContain('CREATE TABLE IF NOT EXISTS brain_entries');
    for (const col of [
      'kind',
      'authority_level',
      'confidence',
      'concepts',
      'source_file',
      'source_hash',
      'embedding',
      'content_search',
      'created_at_epoch',
      'superseded_at_epoch',
      'read_count',
      'parent_entry_id',
    ]) {
      expect(MIGRATION_SQL).toContain(col);
    }
  });

  it('includes domain constraints for kind, authority, confidence, origin', () => {
    expect(MIGRATION_SQL).toContain('brain_entries_kind_check');
    expect(MIGRATION_SQL).toContain('brain_entries_authority_check');
    expect(MIGRATION_SQL).toContain('brain_entries_confidence_check');
    expect(MIGRATION_SQL).toContain('brain_entries_origin_check');
  });

  it('does NOT drop or modify axhy_brain.chunks', () => {
    expect(MIGRATION_SQL).not.toContain('DROP TABLE');
    expect(MIGRATION_SQL).not.toMatch(/ALTER TABLE\s+axhy_brain/);
    expect(MIGRATION_SQL).not.toMatch(/DELETE FROM\s+axhy_brain/);
    expect(MIGRATION_SQL).not.toMatch(/UPDATE\s+axhy_brain/);
  });
});
