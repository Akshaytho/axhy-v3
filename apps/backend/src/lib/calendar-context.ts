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

  const lines: string[] = [
    `# Recent calendar (last ${CALENDAR_LOOKBACK_DAYS} days, ${rows.length} entries)`,
    '',
  ];
  for (const r of rows) {
    const dateStr = r.date.toISOString().slice(0, 10);
    const note = r.notes ? ` — ${r.notes}` : '';
    lines.push(`- ${dateStr} [${r.kind}]${note}`);
  }
  return lines.join('\n').trim();
}
