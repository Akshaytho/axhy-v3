/**
 * Brain Compact — consolidate learning files without losing meaning.
 *
 * Problem: learnings accumulate (1 per mistake). After months, docs/learnings/
 * has 200 files. Most reference the same handful of rules.
 *
 * Solution: group by broken_rule, merge detection patterns, keep newest
 * root cause, archive originals. 5 files about Rule 6 → 1 consolidated
 * file with all 5 grep patterns ORed together.
 *
 * What's preserved:
 *   - Every check_pattern (ORed into one regex)
 *   - Every check_paths (unioned)
 *   - Newest root_cause (newer wins per README rules)
 *   - All original files (moved to docs/learnings/_archive/)
 *
 * What's reduced:
 *   - File count (N files per rule → 1)
 *   - Audit Phase 3 scan time (fewer files to parse)
 *   - Brain embedding count (1 chunk per rule, not N)
 *
 * Usage:
 *   pnpm --filter @axhy/ai-tools brain:compact
 *
 * Safe to run multiple times (idempotent — skips already-consolidated files).
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '../../..');
const LEARNINGS_DIR = join(REPO_ROOT, 'docs/learnings');
const ARCHIVE_DIR = join(LEARNINGS_DIR, '_archive');

type ParsedLearning = {
  file: string;
  brokenRule: string;
  persona: string;
  date: string;
  session: string;
  checkPattern: string;
  checkPaths: string;
  checkExpect: string;
  rootCause: string;
  preventionRule: string;
  whatHappened: string;
  detection: string;
  raw: string;
};

function parseFmValue(fm: string, key: string): string {
  const re = new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm');
  const m = fm.match(re);
  return m ? m[1]!.trim() : '';
}

function parseSection(content: string, heading: string): string {
  const re = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const m = content.match(re);
  return m ? m[1]!.trim() : '';
}

function parseLearning(file: string): ParsedLearning | null {
  const fullPath = join(LEARNINGS_DIR, file);
  const raw = readFileSync(fullPath, 'utf8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm = fmMatch[1]!;

  const brokenRule = parseFmValue(fm, 'broken_rule');
  if (!brokenRule) return null;

  return {
    file,
    brokenRule,
    persona: parseFmValue(fm, 'persona') || 'all',
    date: parseFmValue(fm, 'date') || '',
    session: parseFmValue(fm, 'session') || '',
    checkPattern: parseFmValue(fm, 'check_pattern') || '',
    checkPaths: parseFmValue(fm, 'check_paths') || '',
    checkExpect: parseFmValue(fm, 'check_expect') || 'none',
    rootCause: parseSection(raw, 'Root cause'),
    preventionRule: parseSection(raw, 'New prevention rule'),
    whatHappened: parseSection(raw, 'What happened'),
    detection: parseSection(raw, 'Detection'),
    raw,
  };
}

function mergePatterns(patterns: string[]): string {
  const unique = new Set<string>();
  for (const p of patterns) {
    if (!p) continue;
    for (const part of p.split('|')) {
      const trimmed = part.trim();
      if (trimmed) unique.add(trimmed);
    }
  }
  return [...unique].join('|');
}

function mergePaths(pathSets: string[]): string {
  const unique = new Set<string>();
  for (const ps of pathSets) {
    if (!ps) continue;
    for (const p of ps.split(',')) {
      const trimmed = p.trim();
      if (trimmed) unique.add(trimmed);
    }
  }
  return [...unique].join(', ');
}

function buildConsolidatedFile(rule: string, group: ParsedLearning[]): string {
  const sorted = [...group].sort((a, b) => b.date.localeCompare(a.date));
  const newest = sorted[0]!;

  const mergedPattern = mergePatterns(group.map((l) => l.checkPattern));
  const mergedPaths = mergePaths(group.map((l) => l.checkPaths));
  const checkExpect = newest.checkExpect || 'none';

  const today = new Date().toISOString().slice(0, 10);

  const patternHistory = group
    .filter((l) => l.checkPattern)
    .map((l) => `- \`${l.checkPattern}\` (${l.date}, ${l.file})`)
    .join('\n');

  const rootCauseHistory = group
    .filter((l) => l.rootCause)
    .map((l) => `### ${l.date} — ${l.session || l.file}\n${l.rootCause}`)
    .join('\n\n');

  return `---
broken_rule: "${rule}"
persona: ${newest.persona}
date: ${today}
session: "consolidated from ${group.length} learnings"
consolidated_from: ${group.length}
consolidated_sources: "${group.map((l) => l.file).join(', ')}"
check_pattern: "${mergedPattern}"
check_paths: "${mergedPaths}"
check_expect: "${checkExpect}"
---

# Learning: ${rule} (consolidated ${group.length}x)

## What happened
This rule was broken ${group.length} times across sessions. Detection patterns have been merged.

## Pattern history
${patternHistory || 'No machine-readable patterns in original learnings.'}

## Root cause history (newest first)
${rootCauseHistory || newest.rootCause || 'No root cause documented.'}

## New prevention rule
${newest.preventionRule || 'See locked doc for the canonical rule.'}

## Detection
Consolidated grep: \`${mergedPattern || 'none'}\` in \`${mergedPaths || 'apps/backend/src'}\`
`;
}

async function main() {
  console.log('[compact] Reading learnings...');

  if (!existsSync(LEARNINGS_DIR)) {
    console.log('[compact] No docs/learnings/ directory. Nothing to compact.');
    return;
  }

  const files = readdirSync(LEARNINGS_DIR).filter(
    (f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('consolidated-'),
  );

  if (files.length === 0) {
    console.log('[compact] No learning files to compact.');
    return;
  }

  const learnings: ParsedLearning[] = [];
  for (const file of files) {
    const parsed = parseLearning(file);
    if (parsed) learnings.push(parsed);
  }

  console.log(`[compact] Found ${learnings.length} learning(s)`);

  // Group by broken_rule
  const groups = new Map<string, ParsedLearning[]>();
  for (const l of learnings) {
    const key = l.brokenRule;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  // Only consolidate groups with 2+ learnings
  const toConsolidate = [...groups.entries()].filter(([, g]) => g.length >= 2);
  const soloLearnings = [...groups.entries()].filter(([, g]) => g.length === 1);

  if (toConsolidate.length === 0) {
    console.log('[compact] No rules with 2+ learnings. Nothing to consolidate.');
    console.log(`[compact] ${soloLearnings.length} solo learning(s) left as-is.`);
    return;
  }

  // Create archive dir
  mkdirSync(ARCHIVE_DIR, { recursive: true });

  let archivedCount = 0;
  let consolidatedCount = 0;

  for (const [rule, group] of toConsolidate) {
    console.log(`\n[compact] Consolidating: ${rule} (${group.length} learnings)`);

    // Build consolidated file
    const content = buildConsolidatedFile(rule, group);
    const slug = rule
      .replace(/\.md/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 60);
    const consolidatedFile = `consolidated-${slug}.md`;

    writeFileSync(join(LEARNINGS_DIR, consolidatedFile), content);
    console.log(`  Created: ${consolidatedFile}`);
    consolidatedCount++;

    // Archive originals
    for (const l of group) {
      const src = join(LEARNINGS_DIR, l.file);
      const dst = join(ARCHIVE_DIR, l.file);
      renameSync(src, dst);
      console.log(`  Archived: ${l.file}`);
      archivedCount++;
    }
  }

  console.log(`\n[compact] Done.`);
  console.log(`  Consolidated: ${consolidatedCount} rules (from ${archivedCount} files)`);
  console.log(`  Solo learnings: ${soloLearnings.length} (untouched)`);
  console.log(`  Archived originals: ${ARCHIVE_DIR}/`);
  console.log(
    `  Total learning files now: ${consolidatedCount + soloLearnings.length} (was ${learnings.length})`,
  );
}

await main();
