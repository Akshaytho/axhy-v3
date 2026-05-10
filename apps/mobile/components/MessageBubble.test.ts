/**
 * stripMarkdown is internal but its behavior is critical for AI text rendering
 * in MessageBubble. Mirror the helper here so we can unit-test it directly.
 *
 * If MessageBubble.tsx's stripMarkdown changes, update this mirror to match.
 */
import { describe, it, expect } from 'vitest';

function stripMarkdown(text: string): string {
  return text
    .replace(/\|/g, '  ')
    .replace(/^>[ \t]?/gm, '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[-–—]{2,}[ \t\-–—]*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

describe('stripMarkdown', () => {
  it('strips ### headers but keeps content', () => {
    expect(stripMarkdown('### Soft Conflict')).toBe('Soft Conflict');
    expect(stripMarkdown('# Heading')).toBe('Heading');
  });

  it('strips dash separator rows (table sep / HR)', () => {
    const input = 'Field Detail\n--- ---\nWorker Pradeep';
    expect(stripMarkdown(input)).toBe('Field Detail\n\nWorker Pradeep');
  });

  it('strips long dash HRs', () => {
    expect(stripMarkdown('Above\n---------\nBelow')).toBe('Above\n\nBelow');
  });

  it('removes bold markers but keeps content', () => {
    expect(stripMarkdown('**Bold** text')).toBe('Bold text');
    expect(stripMarkdown('Some **emphasized** content')).toBe('Some emphasized content');
  });

  it('strips backticks but keeps content', () => {
    expect(stripMarkdown('Use `propose_create_assignment` tool')).toBe(
      'Use propose_create_assignment tool',
    );
  });

  it('replaces table pipes with double spaces', () => {
    expect(stripMarkdown('Field | Value')).toBe('Field    Value');
  });

  it('collapses triple+ newlines to double', () => {
    expect(stripMarkdown('A\n\n\n\nB')).toBe('A\n\nB');
  });

  it('handles compound real-world AI output', () => {
    const input = `### Leave proposal

Field Detail
--- ---
**Worker** Pradeep
Days 3
\`reason\`: sick`;
    const output = stripMarkdown(input);
    expect(output).not.toContain('###');
    expect(output).not.toContain('---');
    expect(output).not.toContain('**');
    expect(output).not.toContain('`');
    expect(output).toContain('Pradeep');
    expect(output).toContain('reason: sick');
  });

  it('strips italic *...* markers but keeps content', () => {
    expect(stripMarkdown('Site Hospital A *(Apollo, Hyd)*')).toBe('Site Hospital A (Apollo, Hyd)');
  });

  it('strips blockquote prefix "> "', () => {
    const input = '> Mark Absent\n> Worker: Sundeep\n> Date: Today';
    const output = stripMarkdown(input);
    expect(output).toBe('Mark Absent\nWorker: Sundeep\nDate: Today');
  });

  it('handles pipe-bordered table that AI Sonnet 4.6 actually emits', () => {
    const input = `Here's the proposal:

| Detail | Info |
|---|---|
| **Worker** | Pradeep |
| **Days** | 3 |

Please confirm.`;
    const output = stripMarkdown(input);
    expect(output).not.toContain('---');
    expect(output).not.toContain('**');
    expect(output).not.toContain('|');
    expect(output).toContain('Worker');
    expect(output).toContain('Pradeep');
  });
});
