/**
 * Run-once hydrator — converts Wave 1's deferred Assignment payloads
 * stored in CalendarEntry.pendingAssignmentPayload into real Assignment rows.
 * After this runs, Wave 1's synth-id pattern is gone.
 *
 * Idempotent: if re-run on a DB that has already been hydrated (no rows with
 * pendingAssignmentPayload), it logs "found 0" and exits cleanly.
 *
 * Run:
 *   cd apps/backend
 *   pnpm exec tsx --env-file=.env.local scripts/hydrate-deferred-assignments.ts
 *
 * @derives(master-plan §G)
 */

import { PrismaClient } from '@prisma/client';

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? process.env.AXHY_DB_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  const pending = await prisma.calendarEntry.findMany({
    where: {
      promotedToKind: 'ASSIGNMENT',
      pendingAssignmentPayload: { not: null as never },
    },
  });

  console.log(`[hydrator] found ${pending.length} deferred Assignment payloads`);

  let hydrated = 0;
  for (const entry of pending) {
    const payload = entry.pendingAssignmentPayload as {
      workerId: string;
      siteId: string;
      shiftStart: string;
      shiftEnd: string;
      dayMask: string;
      validFrom: string | Date;
      validUntil: string | Date | null;
    };

    const assignment = await prisma.assignment.create({
      data: {
        companyId: entry.companyId,
        workerId: payload.workerId,
        siteId: payload.siteId,
        shiftStart: payload.shiftStart,
        shiftEnd: payload.shiftEnd,
        dayMask: payload.dayMask,
        validFrom: new Date(payload.validFrom),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
        state: 'ACTIVE', // hydrated entries were already promoted = active
      },
    });

    await prisma.calendarEntry.update({
      where: { id: entry.id },
      data: { promotedToId: assignment.id, pendingAssignmentPayload: null as never },
    });

    await prisma.auditEvent.create({
      data: {
        companyId: entry.companyId,
        kind: 'ASSIGNMENT_HYDRATED_FROM_CALENDAR',
        actorId: entry.supervisorId,
        targetId: assignment.id,
        payload: {
          sourceEntryId: entry.id,
          originalSynthId: entry.promotedToId,
        },
      },
    });

    hydrated++;
  }

  console.log(`[hydrator] hydrated ${hydrated} entries`);
  await prisma.$disconnect();
}

export { main };

// Only auto-run when executed directly (not when imported by test)
// Vitest imports this module, so we skip auto-run in test context.
if (!process.env.VITEST) {
  main().catch((err) => {
    console.error('[hydrator] failed:', err);
    process.exit(1);
  });
}
