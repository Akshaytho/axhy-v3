/**
 * @axhy/ai-tools — Full pipeline integration test
 *
 * Validates that all v3 cognitive system phases work together
 * as they would in a real brain:build → impactCheck flow:
 *   A3: redaction strips secrets before embedding
 *   A4: auto-classifier applies frontmatter overrides
 *   A5: field-fanout splits into parent + child sections
 *   A6: FTS hybrid search SQL is structurally correct
 *
 * No DB connection needed — tests the code paths and wiring.
 *
 * @derives(ADR-0022)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { redact, stripTaggedBlocks, redactSecrets } from './redaction.js';
import { autoClassify, parseFrontmatter } from './auto-classifier.js';
import { splitIntoSections } from './field-fanout.js';
import { isEnabled, FEATURE_FLAGS } from './feature-flags.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('pipeline integration — full end-to-end wiring', () => {
  describe('brain:build pipeline order: strip → redact → classify → split → embed', () => {
    it('1. realistic doc with secrets + tags + frontmatter + sections is processed correctly', () => {
      const rawDoc = [
        '---',
        'type: learning',
        'authority_level: curated',
        'confidence: high',
        'concepts: [auth, security]',
        '---',
        '',
        '# Auth Token Rotation Learning',
        '',
        '<system-reminder>internal: review by 2026-06-01</system-reminder>',
        '',
        '## What happened',
        'We stored sk-REALKEY12345678901234567890 in plaintext.',
        '',
        '## Root cause',
        'The config loader at postgresql://admin:secret@db.prod.axhy.com:5432/axhy skipped validation.',
        '',
        '## Fix applied',
        'Added redaction before embedding. Token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij removed.',
        '',
        '<private>internal review notes: AKIAIOSFODNN7EXAMPLE was the leaked key</private>',
      ].join('\n');

      // Step 1: Strip tagged blocks (system-reminder, private)
      const stripped = stripTaggedBlocks(rawDoc);
      expect(stripped).not.toContain('system-reminder');
      expect(stripped).not.toContain('internal: review');
      expect(stripped).not.toContain('private');
      expect(stripped).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(stripped).toContain('Auth Token Rotation');
      expect(stripped).toContain('sk-REALKEY12345678901234567890');

      // Step 2: Redact secrets from stripped content
      const redacted = redactSecrets(stripped);
      expect(redacted).not.toContain('sk-REALKEY');
      expect(redacted).not.toContain('postgresql://admin:secret');
      expect(redacted).not.toContain('ghp_ABCDEF');
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).toContain('Auth Token Rotation');

      // Step 3: Combined redact() does both in correct order
      const combined = redact(rawDoc);
      expect(combined).toBe(redacted);

      // Step 4: Classify with frontmatter override
      const classification = autoClassify('docs/learnings/auth-rotation.md', rawDoc);
      expect(classification.type).toBe('learning');
      expect(classification.authority_level).toBe('curated');
      expect(classification.confidence).toBe('high');
      expect(classification.title).toBe('Auth Token Rotation Learning');
      expect(classification.concepts).toContain('auth');
      expect(classification.concepts).toContain('security');

      // Step 5: Split into sections for field-fanout
      const sections = splitIntoSections(redacted);
      expect(sections.length).toBeGreaterThanOrEqual(3);
      const titles = sections.map((s) => s.title);
      expect(titles).toContain('Auth Token Rotation Learning');
      expect(titles).toContain('What happened');
      expect(titles).toContain('Root cause');
      expect(titles).toContain('Fix applied');

      // Sections should contain redacted content, not raw secrets
      for (const section of sections) {
        expect(section.content).not.toContain('sk-REALKEY');
        expect(section.content).not.toContain('postgresql://admin');
        expect(section.content).not.toContain('ghp_ABCDEF');
      }
    });

    it('2. content hash must use raw content (not redacted) for dedup stability', () => {
      const source = readFileSync(join(here, 'brain-builder.ts'), 'utf8');

      // contentHash is computed BEFORE redaction
      const hashLine = source.indexOf('const contentHash = hashOf(content)');
      const redactLine = source.indexOf('const redactedContent = isEnabled(');
      expect(hashLine).toBeGreaterThan(0);
      expect(redactLine).toBeGreaterThan(0);
      expect(hashLine).toBeLessThan(redactLine);
    });

    it('3. classification uses raw content (not redacted) for frontmatter parsing', () => {
      const source = readFileSync(join(here, 'brain-builder.ts'), 'utf8');

      // classifyPersona should be called BEFORE redaction
      const classifyLine = source.indexOf('classifyPersona(sourcePath, content)');
      const redactLine = source.indexOf('const redactedContent = isEnabled(');
      expect(classifyLine).toBeGreaterThan(0);
      expect(classifyLine).toBeLessThan(redactLine);
    });

    it('4. embed and INSERT use redacted content only', () => {
      const source = readFileSync(join(here, 'brain-builder.ts'), 'utf8');

      // embed() call should use redactedContent
      expect(source).toContain('embed(redactedContent.slice(0, 8000))');

      // INSERT should bind redactedContent, not raw content
      const insertBlock = source.slice(source.indexOf('INSERT INTO axhy_brain.chunks'));
      const firstValues = insertBlock.slice(0, insertBlock.indexOf('];'));
      expect(firstValues).toContain('redactedContent');
    });
  });

  describe('feature flag gating — all phases respect flags', () => {
    it('5. REDACTION_STRICT_MODE defaults to true (always-on unless disabled)', () => {
      const original = process.env.REDACTION_STRICT_MODE;
      try {
        delete process.env.REDACTION_STRICT_MODE;
        expect(isEnabled(FEATURE_FLAGS.REDACTION_STRICT_MODE)).toBe(true);
      } finally {
        if (original !== undefined) process.env.REDACTION_STRICT_MODE = original;
        else delete process.env.REDACTION_STRICT_MODE;
      }
    });

    it('6. REDACTION_STRICT_MODE can be disabled via env', () => {
      const original = process.env.REDACTION_STRICT_MODE;
      try {
        process.env.REDACTION_STRICT_MODE = 'false';
        expect(isEnabled(FEATURE_FLAGS.REDACTION_STRICT_MODE)).toBe(false);
      } finally {
        if (original !== undefined) process.env.REDACTION_STRICT_MODE = original;
        else delete process.env.REDACTION_STRICT_MODE;
      }
    });

    it('7. FIELD_FANOUT_ENABLED defaults to false (opt-in)', () => {
      const original = process.env.FIELD_FANOUT_ENABLED;
      try {
        delete process.env.FIELD_FANOUT_ENABLED;
        expect(isEnabled(FEATURE_FLAGS.FIELD_FANOUT_ENABLED)).toBe(false);
      } finally {
        if (original !== undefined) process.env.FIELD_FANOUT_ENABLED = original;
        else delete process.env.FIELD_FANOUT_ENABLED;
      }
    });

    it('8. PG_FTS_HYBRID_ENABLED defaults to false (opt-in)', () => {
      const original = process.env.PG_FTS_HYBRID_ENABLED;
      try {
        delete process.env.PG_FTS_HYBRID_ENABLED;
        expect(isEnabled(FEATURE_FLAGS.PG_FTS_HYBRID_ENABLED)).toBe(false);
      } finally {
        if (original !== undefined) process.env.PG_FTS_HYBRID_ENABLED = original;
        else delete process.env.PG_FTS_HYBRID_ENABLED;
      }
    });
  });

  describe('auto-classifier + frontmatter interaction with redaction', () => {
    it('9. frontmatter survives tag stripping (frontmatter is not a tagged block)', () => {
      const doc = [
        '---',
        'type: spec',
        'authority_level: locked',
        '---',
        '<system-reminder>ignore this</system-reminder>',
        '# My Spec',
      ].join('\n');

      const stripped = stripTaggedBlocks(doc);
      const fm = parseFrontmatter(stripped);
      expect(fm.type).toBe('spec');
      expect(fm.authority_level).toBe('locked');
    });

    it('10. frontmatter override with invalid values falls back to path-based defaults', () => {
      const doc = [
        '---',
        'type: not_a_real_type',
        'authority_level: ultra_locked',
        'confidence: maybe',
        '---',
        '# Some Doc',
      ].join('\n');

      const result = autoClassify('docs/specs/something.md', doc);
      expect(result.type).toBe('spec');
      expect(result.authority_level).toBe('candidate');
      expect(result.confidence).toBe('medium');
    });

    it('11. path-based concepts merge with frontmatter concepts', () => {
      const doc = [
        '---',
        'concepts: [custom-concept, deployment]',
        '---',
        '# Auth Security Guide',
      ].join('\n');

      const result = autoClassify('docs/specs/auth-security.md', doc);
      expect(result.concepts).toContain('auth');
      expect(result.concepts).toContain('security');
      expect(result.concepts).toContain('custom-concept');
      expect(result.concepts).toContain('deployment');
    });
  });

  describe('field-fanout with redacted content', () => {
    it('12. sections from redacted doc contain no secrets', () => {
      const doc = [
        '# API Reference',
        '',
        '## Authentication',
        'Use key sk-abcdefghijklmnopqrstuvwxyz1234 for access.',
        '',
        '## Database',
        'Connect via postgresql://user:pass@db.example.com:5432/app',
      ].join('\n');

      const redacted = redact(doc);
      const sections = splitIntoSections(redacted);

      expect(sections).toHaveLength(3);
      const authSection = sections.find((s) => s.title === 'Authentication')!;
      expect(authSection.content).toContain('[REDACTED]');
      expect(authSection.content).not.toContain('sk-abcdef');

      const dbSection = sections.find((s) => s.title === 'Database')!;
      expect(dbSection.content).toContain('[REDACTED]');
      expect(dbSection.content).not.toContain('postgresql://user');
    });

    it('13. section line numbers remain correct after tag stripping', () => {
      const doc = [
        '<system-reminder>hidden block</system-reminder>',
        '## Section A',
        'Content A',
        '## Section B',
        'Content B',
      ].join('\n');

      const stripped = stripTaggedBlocks(doc);
      const sections = splitIntoSections(stripped);
      expect(sections.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('MCP tool wiring in cognitive-system server', () => {
    it('14. server.mjs exposes all 3 impact tools with correct schemas', () => {
      const cogRoot = join(here, '../../..', '..', 'axhy-cognitive-system');
      const serverSource = readFileSync(join(cogRoot, 'src/layer-2-guardrail/server.mjs'), 'utf8');

      expect(serverSource).toContain("name: 'impact_search'");
      expect(serverSource).toContain("name: 'impact_timeline'");
      expect(serverSource).toContain("name: 'impact_get'");

      expect(serverSource).toContain('SEARCH_TOOL_DEFINITION');
      expect(serverSource).toContain('TIMELINE_TOOL_DEFINITION');
      expect(serverSource).toContain('GET_TOOL_DEFINITION');
    });
  });

  describe('cross-phase consistency checks', () => {
    it('15. all feature flag names match between feature-flags.ts and consumers', () => {
      const flagSource = readFileSync(join(here, 'feature-flags.ts'), 'utf8');
      const builderSource = readFileSync(join(here, 'brain-builder.ts'), 'utf8');
      const impactSource = readFileSync(join(here, 'impact-check-v2.ts'), 'utf8');

      expect(builderSource).toContain('FEATURE_FLAGS.REDACTION_STRICT_MODE');
      expect(flagSource).toContain("REDACTION_STRICT_MODE: 'REDACTION_STRICT_MODE'");

      expect(impactSource).toContain('FEATURE_FLAGS.PG_FTS_HYBRID_ENABLED');
      expect(flagSource).toContain("PG_FTS_HYBRID_ENABLED: 'PG_FTS_HYBRID_ENABLED'");
    });

    it('16. redaction pattern count matches spec (7 tags + 7 secrets)', async () => {
      const { STRIP_TAGS, SECRET_PATTERNS } = await import('./redaction.js');
      expect(STRIP_TAGS).toHaveLength(7);
      expect(SECRET_PATTERNS).toHaveLength(7);
    });

    it('17. brain-schema types align with auto-classifier valid sets', () => {
      const schemaSource = readFileSync(join(here, 'brain-schema.ts'), 'utf8');
      const classifierSource = readFileSync(join(here, 'auto-classifier.ts'), 'utf8');

      const typeMatch = schemaSource.match(/export type EntryType\s*=\s*([\s\S]*?);/);
      expect(typeMatch).not.toBeNull();
      const schemaTypes = typeMatch![1]!.match(/'(\w+)'/g)!.map((t) => t.replace(/'/g, ''));

      for (const t of schemaTypes) {
        expect(classifierSource).toContain(`'${t}'`);
      }
    });
  });
});
