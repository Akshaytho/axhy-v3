/**
 * Calendar Tier 3 prompt context helper.
 *
 * Loads the supervisor's last 30 days of CalendarEntry rows and formats
 * them as a compact text block for injection as the Tier 3a system
 * message in `openaiToolLoop`. Capped at 50 entries to prevent prompt
 * bloat at edge cases (pathological tenants creating dozens per day).
 *
 * Empty string when no entries — caller skips the system message slot.
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 * @derives(spec-2 §8.1)
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { CALENDAR_LOOKBACK_DAYS, CALENDAR_MAX_ENTRIES } from '@axhy/business-rules';

import { neuteriseClosingTags } from './prompt-composer.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function loadCalendarTier3(
  client: DbClient,
  companyId: string,
  supervisorId: string,
  now: Date = new Date(),
): Promise<string> {
  const cutoff = new Date(now.getTime() - CALENDAR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await client.calendarEntry.findMany({
    where: {
      companyId,
      supervisorId,
      date: { gte: cutoff },
    },
    orderBy: { date: 'desc' },
    take: CALENDAR_MAX_ENTRIES,
    select: {
      date: true,
      kind: true,
      notes: true,
    },
  });
  if (rows.length === 0) return '';

  // #18: wrap as a DATA block and sanitise the supervisor-authored notes.
  // r.notes is untrusted free-text — without the <calendar_context> wrapper +
  // neuteriseClosingTags, a stored note could break out of the block or carry
  // instructions. The chat system prompt's PROMPT_INJECTION_DEFENSE_SENTENCE
  // names <calendar_context> so the model treats this as reference data, not
  // instructions.
  const lines: string[] = [
    '<calendar_context>',
    `# Recent calendar (last ${CALENDAR_LOOKBACK_DAYS} days, ${rows.length} entries)`,
    '',
  ];
  for (const r of rows) {
    const dateStr = r.date.toISOString().slice(0, 10);
    const safeNote = r.notes ? neuteriseClosingTags(r.notes, 'calendar_context') : '';
    const note = safeNote ? ` — ${safeNote}` : '';
    lines.push(`- ${dateStr} [${r.kind}]${note}`);
  }
  lines.push('</calendar_context>');
  return lines.join('\n').trim();
}
