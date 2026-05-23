/**
 * @axhy/ai-tools — Auto-classifier tests
 *
 * Tests covering:
 * - Path-based classification for each pattern (6 tests)
 * - Frontmatter type: override (2 tests)
 * - Frontmatter authority_level: and confidence: overrides (2 tests)
 * - Invalid frontmatter values ignored (1 test)
 * - Concept extraction from path and frontmatter (2 tests)
 * - Title extraction (1 test)
 * - parseFrontmatter helper (2 tests)
 *
 * @derives(ADR-0022)
 */

import { describe, it, expect } from 'vitest';

import { autoClassify, parseFrontmatter } from './auto-classifier.js';

describe('auto-classifier', () => {
  describe('path-based classification (delegates to classifyByPath)', () => {
    it('1. docs/locked/ → locked_doc with locked authority', () => {
      const result = autoClassify('docs/locked/rules.md', '# Rules');
      expect(result.type).toBe('locked_doc');
      expect(result.authority_level).toBe('locked');
      expect(result.confidence).toBe('high');
    });

    it('2. docs/learnings/ → learning with curated authority', () => {
      const result = autoClassify('docs/learnings/lesson.md', '# Lesson');
      expect(result.type).toBe('learning');
      expect(result.authority_level).toBe('curated');
    });

    it('3. docs/retros/ → retro with candidate authority', () => {
      const result = autoClassify('docs/retros/sprint-1.md', '# Sprint 1 Retro');
      expect(result.type).toBe('retro');
      expect(result.authority_level).toBe('candidate');
    });

    it('4. docs/specs/ → spec with candidate authority', () => {
      const result = autoClassify('docs/specs/feature.md', '# Feature Spec');
      expect(result.type).toBe('spec');
      expect(result.authority_level).toBe('candidate');
    });

    it('5. docs/decisions/ → decision with curated authority', () => {
      const result = autoClassify('docs/decisions/0022-pgvector.md', '# ADR-0022');
      expect(result.type).toBe('decision');
      expect(result.authority_level).toBe('curated');
    });

    it('6. unknown path → discovery with candidate authority', () => {
      const result = autoClassify('docs/random/notes.md', '# Notes');
      expect(result.type).toBe('discovery');
      expect(result.authority_level).toBe('candidate');
    });
  });

  describe('frontmatter type: override', () => {
    it('7. frontmatter type: overrides path-based type', () => {
      const content = '---\ntype: learning\n---\n# Some Doc';
      const result = autoClassify('docs/random/notes.md', content);
      expect(result.type).toBe('learning');
      expect(result.authority_level).toBe('candidate');
    });

    it('8. frontmatter type: overrides even locked_doc path', () => {
      const content = '---\ntype: retro\n---\n# Retro in locked dir';
      const result = autoClassify('docs/locked/retro.md', content);
      expect(result.type).toBe('retro');
    });
  });

  describe('frontmatter authority_level: and confidence: overrides', () => {
    it('9. frontmatter authority_level: overrides path default', () => {
      const content = '---\nauthority_level: locked\nconfidence: high\n---\n# Important';
      const result = autoClassify('docs/specs/important.md', content);
      expect(result.authority_level).toBe('locked');
      expect(result.confidence).toBe('high');
    });

    it('10. frontmatter confidence: overrides independently', () => {
      const content = '---\nconfidence: low\n---\n# Uncertain';
      const result = autoClassify('docs/decisions/uncertain.md', content);
      expect(result.confidence).toBe('low');
      expect(result.authority_level).toBe('curated');
    });
  });

  describe('invalid frontmatter values', () => {
    it('11. invalid type: value is ignored, keeps path default', () => {
      const content = '---\ntype: not_a_real_type\nauthority_level: bogus\n---\n# Doc';
      const result = autoClassify('docs/specs/feature.md', content);
      expect(result.type).toBe('spec');
      expect(result.authority_level).toBe('candidate');
    });
  });

  describe('concept extraction', () => {
    it('12. extracts concepts from path patterns', () => {
      const result = autoClassify('docs/specs/auth-flow.md', '# Auth Flow');
      expect(result.concepts).toContain('auth');
    });

    it('13. extracts concepts from frontmatter concepts: field', () => {
      const content = '---\nconcepts: [auth, rate-limit, custom-tag]\n---\n# Doc';
      const result = autoClassify('docs/random/notes.md', content);
      expect(result.concepts).toContain('auth');
      expect(result.concepts).toContain('rate-limit');
      expect(result.concepts).toContain('custom-tag');
    });
  });

  describe('title extraction', () => {
    it('14. extracts title from first heading', () => {
      const result = autoClassify('docs/specs/feature.md', '# My Feature\n\nSome content');
      expect(result.title).toBe('My Feature');
    });
  });

  describe('parseFrontmatter helper', () => {
    it('15. parses key: value pairs from frontmatter', () => {
      const content = '---\ntype: learning\nconfidence: high\n---\n# Doc';
      const fm = parseFrontmatter(content);
      expect(fm.type).toBe('learning');
      expect(fm.confidence).toBe('high');
    });

    it('16. returns empty object for content without frontmatter', () => {
      const fm = parseFrontmatter('# Just a heading\nNo frontmatter here.');
      expect(Object.keys(fm)).toHaveLength(0);
    });
  });
});
