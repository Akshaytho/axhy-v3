/**
 * LivingDoc → Tier 2 prompt block formatter.
 *
 * Pure function: takes a LivingDocActive (already ACTIVE-filtered by
 * `getLivingDoc`) and returns a compact text block suitable for injection
 * as a Tier 2 system message in `openaiToolLoop`. Returns empty string
 * when ALL 5 sections are empty (don't inject empty Tier 2 — would
 * waste a system message slot and bust cache for no reason).
 *
 * Format is intentionally terse: short headers + ruleText per line. No
 * JSON, no markdown tables — minimizes tokens for the same information.
 * Typical block: 2-4K tokens for a tenant with 30-50 active rules.
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 * @derives(spec-2 §3.5, §6.1, §8.1)
 */

import type { LivingDocActive } from './living-doc.js';

const SECTION_HEADERS: Array<{ key: keyof LivingDocActive; label: string }> = [
  { key: 'siteRules', label: 'Site rules' },
  { key: 'workerNotes', label: 'Worker notes' },
  { key: 'clientPreferences', label: 'Client preferences' },
  { key: 'recurringTasks', label: 'Recurring tasks' },
  { key: 'freeNotes', label: 'Free notes' },
];

export function formatLivingDocPrompt(doc: LivingDocActive): string {
  const lines: string[] = [];
  let totalRules = 0;

  for (const { key, label } of SECTION_HEADERS) {
    const rules = doc[key];
    if (!Array.isArray(rules) || rules.length === 0) continue;
    lines.push(`## ${label}`);
    for (const r of rules) {
      lines.push(`- ${r.ruleText}`);
      totalRules += 1;
    }
    lines.push('');
  }

  if (totalRules === 0) return '';

  return [
    `# Supervisor's living context (${totalRules} active rule${totalRules === 1 ? '' : 's'})`,
    '',
    ...lines,
  ]
    .join('\n')
    .trim();
}
