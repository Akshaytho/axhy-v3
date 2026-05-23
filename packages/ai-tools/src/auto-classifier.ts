/**
 * @axhy/ai-tools — Auto-classifier with frontmatter override
 *
 * Wraps brain-schema.ts classifyByPath + extractConcepts with frontmatter
 * awareness: if a document has `type:`, `authority_level:`, or `confidence:`
 * in its YAML frontmatter, those values override path-based inference.
 *
 * @derives(ADR-0022)
 */

import type { AuthorityMapping, EntryType, AuthorityLevel, Confidence } from './brain-schema.js';
import { classifyByPath, extractTitle, extractConcepts } from './brain-schema.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ClassificationResult = AuthorityMapping & {
  title: string | null;
  concepts: string[];
};

// ─── Valid values for override validation ─────────────────────────────────

const VALID_TYPES = new Set<EntryType>([
  'retro',
  'learning',
  'locked_doc',
  'spec',
  'decision',
  'discovery',
  'persona',
  'tool_call',
  'user_prompt',
  'assistant_message',
  'session_summary',
  'feature',
  'bugfix',
  'refactor',
  'change',
]);

const VALID_AUTHORITY_LEVELS = new Set<AuthorityLevel>([
  'locked',
  'curated',
  'candidate',
  'evidence',
  'activity',
  'deprecated',
  'rejected',
]);

const VALID_CONFIDENCE = new Set<Confidence>(['high', 'medium', 'low', 'unknown']);

// ─── Frontmatter parsing ─────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fields: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const kv = line.match(/^(\w[\w_-]*):\s*(.+)/);
    if (kv) {
      fields[kv[1]!.trim()] = kv[2]!.trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return fields;
}

// ─── Auto-classify ──────────────────────────────────────────────────────

export function autoClassify(sourcePath: string, content: string): ClassificationResult {
  const base = classifyByPath(sourcePath);
  const title = extractTitle(content);
  const concepts = extractConcepts(sourcePath, content);
  const fm = parseFrontmatter(content);

  if (fm.type && VALID_TYPES.has(fm.type as EntryType)) {
    base.type = fm.type as EntryType;
  }

  if (fm.authority_level && VALID_AUTHORITY_LEVELS.has(fm.authority_level as AuthorityLevel)) {
    base.authority_level = fm.authority_level as AuthorityLevel;
  }

  if (fm.confidence && VALID_CONFIDENCE.has(fm.confidence as Confidence)) {
    base.confidence = fm.confidence as Confidence;
  }

  return { ...base, title, concepts };
}

export { parseFrontmatter };
