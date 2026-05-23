/**
 * @axhy/ai-tools — Redaction pipeline tests
 *
 * Tests covering:
 * - stripTaggedBlocks() for all 7 tag types (7 tests)
 * - redactSecrets() for all 7 secret patterns (7 tests)
 * - Edge cases: nested, multiple, empty, no-match (5 tests)
 * - Combined redact() pipeline order (1 test)
 * - Exports validation (2 tests)
 *
 * @derives(ADR-0022)
 */

import { describe, it, expect } from 'vitest';

import {
  stripTaggedBlocks,
  redactSecrets,
  redact,
  STRIP_TAGS,
  SECRET_PATTERNS,
} from './redaction.js';

describe('redaction pipeline', () => {
  describe('stripTaggedBlocks() — removes tagged XML blocks', () => {
    it('1. strips <private> blocks', () => {
      const input = 'before <private>secret stuff</private> after';
      expect(stripTaggedBlocks(input)).toBe('before  after');
    });

    it('2. strips <system-reminder> blocks', () => {
      const input = 'text <system-reminder>internal reminder</system-reminder> more';
      expect(stripTaggedBlocks(input)).toBe('text  more');
    });

    it('3. strips <system_instruction> blocks', () => {
      const input = 'a <system_instruction>do this</system_instruction> b';
      expect(stripTaggedBlocks(input)).toBe('a  b');
    });

    it('4. strips <system-instruction> blocks (hyphen variant)', () => {
      const input = 'a <system-instruction>do that</system-instruction> b';
      expect(stripTaggedBlocks(input)).toBe('a  b');
    });

    it('5. strips <persisted-output> blocks', () => {
      const input = 'start <persisted-output>cached data</persisted-output> end';
      expect(stripTaggedBlocks(input)).toBe('start  end');
    });

    it('6. strips <claude-mem-context> blocks', () => {
      const input = 'before <claude-mem-context>memory context</claude-mem-context> after';
      expect(stripTaggedBlocks(input)).toBe('before  after');
    });

    it('7. strips <task-notification> blocks', () => {
      const input = 'a <task-notification>task done</task-notification> b';
      expect(stripTaggedBlocks(input)).toBe('a  b');
    });
  });

  describe('redactSecrets() — replaces secret patterns with [REDACTED]', () => {
    it('8. redacts OpenAI keys (sk-...)', () => {
      const input = 'key: sk-abcdefghijklmnopqrstuvwxyz1234';
      expect(redactSecrets(input)).toBe('key: [REDACTED]');
    });

    it('9. redacts Slack tokens (xoxb-...)', () => {
      const input = 'token: xoxb-123456789012-abcdefghij-xyz';
      expect(redactSecrets(input)).toBe('token: [REDACTED]');
    });

    it('10. redacts Postgres URLs with credentials', () => {
      const input = 'db: postgresql://user:password@db.example.com:5432/mydb';
      expect(redactSecrets(input)).toBe('db: [REDACTED]');
    });

    it('11. redacts AWS access keys (AKIA...)', () => {
      const input = 'aws: AKIAIOSFODNN7EXAMPLE';
      expect(redactSecrets(input)).toBe('aws: [REDACTED]');
    });

    it('12. redacts JWTs (eyJ...)', () => {
      const header = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LWlkLTEyMyJ9';
      const payload = 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9';
      const sig = 'TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ';
      const input = `token: ${header}.${payload}.${sig}`;
      expect(redactSecrets(input)).toBe('token: [REDACTED]');
    });

    it('13. redacts GitHub PATs (ghp_...)', () => {
      const input = 'gh: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
      expect(redactSecrets(input)).toBe('gh: [REDACTED]');
    });

    it('14. redacts Google API keys (AIza...)', () => {
      const input = 'google: AIzaSyA1234567890abcdefghijklmnopqrstuv';
      expect(redactSecrets(input)).toBe('google: [REDACTED]');
    });
  });

  describe('edge cases', () => {
    it('15. handles multiple tags in one string', () => {
      const input = '<private>a</private> middle <system-reminder>b</system-reminder>';
      expect(stripTaggedBlocks(input)).toBe(' middle ');
    });

    it('16. handles multiline tagged blocks', () => {
      const input = 'before\n<private>\nline 1\nline 2\n</private>\nafter';
      expect(stripTaggedBlocks(input)).toBe('before\n\nafter');
    });

    it('17. handles multiple secrets in one string', () => {
      const input =
        'keys: sk-aaaaaaaaaaaaaaaaaaaaaaaaaa and ghp_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBbb';
      const result = redactSecrets(input);
      expect(result).toBe('keys: [REDACTED] and [REDACTED]');
    });

    it('18. passes through content with no matches unchanged', () => {
      const input = 'This is normal text with no secrets or tags.';
      expect(stripTaggedBlocks(input)).toBe(input);
      expect(redactSecrets(input)).toBe(input);
      expect(redact(input)).toBe(input);
    });

    it('19. handles empty string', () => {
      expect(stripTaggedBlocks('')).toBe('');
      expect(redactSecrets('')).toBe('');
      expect(redact('')).toBe('');
    });
  });

  describe('redact() — combined pipeline', () => {
    it('20. strips tags first, then redacts secrets (correct order)', () => {
      const input =
        'visible sk-realkey12345678901234 <private>sk-hiddenkey12345678901234</private> end';
      const result = redact(input);
      expect(result).toBe('visible [REDACTED]  end');
      expect(result).not.toContain('sk-');
      expect(result).not.toContain('private');
    });
  });

  describe('exports validation', () => {
    it('21. STRIP_TAGS has 7 entries matching spec', () => {
      expect(STRIP_TAGS).toHaveLength(7);
      expect(STRIP_TAGS).toContain('private');
      expect(STRIP_TAGS).toContain('system-reminder');
      expect(STRIP_TAGS).toContain('system_instruction');
      expect(STRIP_TAGS).toContain('system-instruction');
      expect(STRIP_TAGS).toContain('persisted-output');
      expect(STRIP_TAGS).toContain('claude-mem-context');
      expect(STRIP_TAGS).toContain('task-notification');
    });

    it('22. SECRET_PATTERNS has 7 entries matching spec', () => {
      expect(SECRET_PATTERNS).toHaveLength(7);
    });
  });
});
