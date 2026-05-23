/**
 * @axhy/ai-tools — brain_entries v3 schema types
 *
 * TypeScript types matching the brain_entries SQL table (0004-brain-entries-v3.sql).
 * Used by migration scripts, brain-builder v2, and impactCheck v2.
 *
 * @derives(ADR-0022)
 */

export type BrainEntryKind = 'curated' | 'activity' | 'change' | 'migrated';

export type AuthorityLevel =
  | 'locked'
  | 'curated'
  | 'candidate'
  | 'evidence'
  | 'activity'
  | 'deprecated'
  | 'rejected';

export type Confidence = 'high' | 'medium' | 'low' | 'unknown';

export type EntryType =
  | 'retro'
  | 'learning'
  | 'locked_doc'
  | 'spec'
  | 'decision'
  | 'discovery'
  | 'persona'
  | 'tool_call'
  | 'user_prompt'
  | 'assistant_message'
  | 'session_summary'
  | 'feature'
  | 'bugfix'
  | 'refactor'
  | 'change';

export type FieldType = 'document' | 'section' | 'fact' | 'title' | 'narrative';

export type EntryOrigin = 'brain_build' | 'axhy_hook' | 'claude_mem_sync' | 'git_commit' | 'manual';

export type BrainEntry = {
  id: string;
  kind: BrainEntryKind;
  authority_level: AuthorityLevel;
  confidence: Confidence;
  type: EntryType;
  concepts: string[];
  source_file: string | null;
  source_session_id: string | null;
  source_hash: string | null;
  origin: EntryOrigin;
  parent_entry_id: string | null;
  title: string | null;
  content: string;
  field_type: FieldType | null;
  embedding: number[];
  created_at_epoch: number;
  superseded_at_epoch: number | null;
  read_count: number;
  metadata: Record<string, unknown>;
};

export type InsertBrainEntry = Omit<BrainEntry, 'id' | 'created_at_epoch' | 'read_count'> & {
  created_at_epoch?: number;
};

export type AuthorityMapping = {
  kind: BrainEntryKind;
  authority_level: AuthorityLevel;
  confidence: Confidence;
  type: EntryType;
};

export function classifyByPath(sourcePath: string): AuthorityMapping {
  if (/docs\/locked\//.test(sourcePath)) {
    return { kind: 'curated', authority_level: 'locked', confidence: 'high', type: 'locked_doc' };
  }
  if (/docs\/learnings\//.test(sourcePath)) {
    return { kind: 'curated', authority_level: 'curated', confidence: 'high', type: 'learning' };
  }
  if (/docs\/retros\//.test(sourcePath)) {
    return { kind: 'curated', authority_level: 'candidate', confidence: 'medium', type: 'retro' };
  }
  if (/docs\/specs\//.test(sourcePath)) {
    return { kind: 'curated', authority_level: 'candidate', confidence: 'medium', type: 'spec' };
  }
  if (/docs\/decisions\//.test(sourcePath)) {
    return { kind: 'curated', authority_level: 'curated', confidence: 'high', type: 'decision' };
  }
  if (/docs\/personas\//.test(sourcePath)) {
    return { kind: 'curated', authority_level: 'curated', confidence: 'high', type: 'persona' };
  }
  return { kind: 'curated', authority_level: 'candidate', confidence: 'medium', type: 'discovery' };
}

export function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1]!.trim() : null;
}

export function extractConcepts(sourcePath: string, content: string): string[] {
  const concepts: Set<string> = new Set();

  if (/auth/.test(sourcePath)) concepts.add('auth');
  if (/rate.?limit/.test(sourcePath)) concepts.add('rate-limit');
  if (/state.?machine/.test(sourcePath)) concepts.add('state-machine');
  if (/chat/.test(sourcePath)) concepts.add('chat');
  if (/worker/.test(sourcePath)) concepts.add('persona-worker');
  if (/supervisor/.test(sourcePath)) concepts.add('persona-supervisor');
  if (/admin/.test(sourcePath) && !/super.?admin/.test(sourcePath)) concepts.add('persona-admin');
  if (/super.?admin/.test(sourcePath)) concepts.add('persona-super-admin');
  if (/schema|prisma|migration/.test(sourcePath)) concepts.add('schema');
  if (/security/.test(sourcePath)) concepts.add('security');
  if (/redis/.test(sourcePath)) concepts.add('redis');
  if (/photo|capture|camera|r2|upload/.test(sourcePath)) concepts.add('photo-pipeline');
  if (/notification/.test(sourcePath)) concepts.add('notifications');
  if (/tenant/.test(sourcePath)) concepts.add('multi-tenant');

  const frontmatterMatch = content.match(/^---[\s\S]*?concepts:\s*\[([^\]]+)\][\s\S]*?---/);
  if (frontmatterMatch) {
    frontmatterMatch[1]!.split(',').forEach((c) => {
      const trimmed = c.trim().replace(/['"]/g, '');
      if (trimmed) concepts.add(trimmed);
    });
  }

  return Array.from(concepts);
}
