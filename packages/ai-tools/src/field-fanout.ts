/**
 * @axhy/ai-tools — Field-fanout: split documents into section-level vectors
 *
 * Splits markdown content by ## headings into sections. Each section gets
 * its own embedding for more precise retrieval. A document with 5 headings
 * produces 6 entries: 1 parent (field_type='document') + 5 children
 * (field_type='section', parent_entry_id linked to parent).
 *
 * Gated behind FIELD_FANOUT_ENABLED feature flag.
 *
 * @derives(ADR-0022)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Section = {
  title: string | null;
  content: string;
  startLine: number;
  endLine: number;
};

// ─── Section splitting ──────────────────────────────────────────────────────

const HEADING_RE = /^(#{1,3})\s+(.+)$/;

export function splitIntoSections(content: string): Section[] {
  if (!content.trim()) return [];

  const lines = content.split('\n');
  const sections: Section[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let currentStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(HEADING_RE);

    if (match) {
      if (currentLines.length > 0 || currentTitle !== null) {
        sections.push({
          title: currentTitle,
          content: currentLines.join('\n').trim(),
          startLine: currentStart,
          endLine: i,
        });
      }
      currentTitle = match[2]!.trim();
      currentLines = [];
      currentStart = i + 1;
    } else {
      currentLines.push(lines[i]!);
    }
  }

  if (currentLines.length > 0 || currentTitle !== null) {
    sections.push({
      title: currentTitle,
      content: currentLines.join('\n').trim(),
      startLine: currentStart,
      endLine: lines.length,
    });
  }

  return sections;
}
