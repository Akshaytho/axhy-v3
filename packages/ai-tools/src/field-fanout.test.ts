/**
 * @axhy/ai-tools — Field-fanout tests
 *
 * Tests covering:
 * - splitIntoSections with multiple headings (1 test)
 * - Empty content returns empty array (1 test)
 * - Content with no headings returns single section (1 test)
 * - Preamble before first heading (1 test)
 * - Section title extraction (1 test)
 * - Line numbers are correct (1 test)
 * - Spec example: 5 sections = 5 entries + 1 parent = 6 total (1 test)
 *
 * @derives(ADR-0022)
 */

import { describe, it, expect } from 'vitest';

import { splitIntoSections } from './field-fanout.js';

describe('field-fanout', () => {
  describe('splitIntoSections()', () => {
    it('1. splits document by ## headings into sections', () => {
      const content = [
        '## Section One',
        'Content of section one.',
        '',
        '## Section Two',
        'Content of section two.',
      ].join('\n');

      const sections = splitIntoSections(content);
      expect(sections).toHaveLength(2);
      expect(sections[0]!.title).toBe('Section One');
      expect(sections[0]!.content).toBe('Content of section one.');
      expect(sections[1]!.title).toBe('Section Two');
      expect(sections[1]!.content).toBe('Content of section two.');
    });

    it('2. returns empty array for empty content', () => {
      expect(splitIntoSections('')).toEqual([]);
      expect(splitIntoSections('   ')).toEqual([]);
    });

    it('3. content with no headings returns single section', () => {
      const content = 'Just some text\nwith multiple lines\nbut no headings.';
      const sections = splitIntoSections(content);
      expect(sections).toHaveLength(1);
      expect(sections[0]!.title).toBeNull();
      expect(sections[0]!.content).toBe(content);
    });

    it('4. captures preamble before first heading as titleless section', () => {
      const content = ['This is a preamble.', '', '## First Section', 'Section content.'].join(
        '\n',
      );

      const sections = splitIntoSections(content);
      expect(sections).toHaveLength(2);
      expect(sections[0]!.title).toBeNull();
      expect(sections[0]!.content).toBe('This is a preamble.');
      expect(sections[1]!.title).toBe('First Section');
    });

    it('5. extracts section titles from # ## ### headings', () => {
      const content = [
        '# Top Level',
        'Intro.',
        '## Second Level',
        'Body.',
        '### Third Level',
        'Detail.',
      ].join('\n');

      const sections = splitIntoSections(content);
      expect(sections).toHaveLength(3);
      expect(sections[0]!.title).toBe('Top Level');
      expect(sections[1]!.title).toBe('Second Level');
      expect(sections[2]!.title).toBe('Third Level');
    });

    it('6. line numbers are correct', () => {
      const content = [
        '## Section A', // line 1
        'Line 2', // line 2
        '## Section B', // line 3
        'Line 4', // line 4
        'Line 5', // line 5
      ].join('\n');

      const sections = splitIntoSections(content);
      expect(sections[0]!.startLine).toBe(1);
      expect(sections[0]!.endLine).toBe(2);
      expect(sections[1]!.startLine).toBe(3);
      expect(sections[1]!.endLine).toBe(5);
    });

    it('7. spec example: 5 headings produce 5 sections (+ 1 parent = 6 entries)', () => {
      const content = [
        '## What happened',
        'We shipped the feature.',
        '## What went well',
        'Tests caught a regression.',
        '## What went wrong',
        'Deploy took too long.',
        '## Root cause',
        'Missing index on query.',
        '## Action items',
        'Add the index.',
      ].join('\n');

      const sections = splitIntoSections(content);
      expect(sections).toHaveLength(5);
      const totalEntries = 1 + sections.length;
      expect(totalEntries).toBe(6);
    });
  });
});
