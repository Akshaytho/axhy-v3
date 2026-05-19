/**
 * Reload-context counter — enforces the 3-per-day / IST-midnight-reset
 * rule from docs/locked/chat-sidebar-context-flow.md.
 *
 * Storage strategy: the counter is derived from `AuditEvent` rows of kind
 * `CHAT_RELOAD_CONTEXT` filtered by (actorId, IST date). No new table, no
 * Policy noise — the audit trail of "supervisor reloaded N times today"
 * is also a useful audit artefact in its own right.
 *
 * IST midnight reset: we derive the IST date from `now` and use
 * createdAt BETWEEN [istDayStart, istDayEnd) in the count. The counter
 * "resets" at IST midnight because the next day's date window is empty.
 *
 * Per-call cost: one COUNT(*) on a (companyId, kind, actorId, createdAt)
 * filter. At 100-supervisor scale and 3-reload daily limit, this is at
 * most ~300 audit rows/day — well within an indexed scan.
 *
 * @derives(master-plan §G)
 * @derives(docs/locked/chat-sidebar-context-flow.md — Reload Context Button)
 * @derives(plans/abstract-wandering-kazoo.md Phase 3)
 */

import type { Prisma } from '@prisma/client';

import { recordAuditEvent } from './audit-event.js';

/** Locked-spec value. Configurable later if a tenant needs more. */
export const RELOAD_CONTEXT_DAILY_LIMIT = 3;

/** IST = UTC+05:30 — Asia/Kolkata. Used for "today" reset boundary. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** Returns the start of the IST day containing `now` as a UTC Date. */
function istDayStartUtc(now: Date): Date {
  const utcMs = now.getTime();
  const istLocalMs = utcMs + IST_OFFSET_MINUTES * 60 * 1000;
  const istLocal = new Date(istLocalMs);
  const istYear = istLocal.getUTCFullYear();
  const istMonth = istLocal.getUTCMonth();
  const istDate = istLocal.getUTCDate();
  // Local IST midnight = UTC of (00:00 IST) = UTC of (year, month, date, -IST_OFFSET).
  return new Date(Date.UTC(istYear, istMonth, istDate) - IST_OFFSET_MINUTES * 60 * 1000);
}

/** Returns the start of the NEXT IST day from `now` as a UTC Date. */
function istNextDayStartUtc(now: Date): Date {
  const start = istDayStartUtc(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export type ConsumeReloadResult =
  | { ok: true; remaining: number; usedToday: number }
  | { ok: false; reason: 'EXCEEDED'; remaining: 0; usedToday: number; nextResetAt: Date };

/**
 * Atomic consume: read today's count, decide allow/deny, if allow then
 * insert the AuditEvent. Caller MUST pass a serializable tx so two
 * concurrent reloads cannot both pass the 3-limit check.
 *
 * Returns `remaining` AFTER the consume decision (0 when denied, 0–N when
 * allowed). `nextResetAt` is the start of the next IST day.
 */
export async function consumeReloadContext(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    supervisorId: string;
    now?: Date;
  },
): Promise<ConsumeReloadResult> {
  const now = input.now ?? new Date();
  const dayStart = istDayStartUtc(now);
  const dayEnd = istNextDayStartUtc(now);

  const usedToday = await tx.auditEvent.count({
    where: {
      companyId: input.companyId,
      kind: 'CHAT_RELOAD_CONTEXT',
      actorId: input.supervisorId,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });

  if (usedToday >= RELOAD_CONTEXT_DAILY_LIMIT) {
    return {
      ok: false,
      reason: 'EXCEEDED',
      remaining: 0,
      usedToday,
      nextResetAt: dayEnd,
    };
  }

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'CHAT_RELOAD_CONTEXT',
    actorId: input.supervisorId,
    payload: {
      consumedAt: now.toISOString(),
      usedTodayBeforeConsume: usedToday,
    },
  });

  return {
    ok: true,
    remaining: RELOAD_CONTEXT_DAILY_LIMIT - usedToday - 1,
    usedToday: usedToday + 1,
  };
}

/**
 * Read-only inspection — how many reloads has this supervisor used today
 * (without consuming). Used by the Drawer's counter pill to render
 * `(remaining)/3 today` without spending a budget slot on a UI tick.
 */
export async function getReloadCountToday(
  tx: Prisma.TransactionClient,
  input: { companyId: string; supervisorId: string; now?: Date },
): Promise<{ usedToday: number; remaining: number; nextResetAt: Date }> {
  const now = input.now ?? new Date();
  const dayStart = istDayStartUtc(now);
  const dayEnd = istNextDayStartUtc(now);

  const usedToday = await tx.auditEvent.count({
    where: {
      companyId: input.companyId,
      kind: 'CHAT_RELOAD_CONTEXT',
      actorId: input.supervisorId,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });

  return {
    usedToday,
    remaining: Math.max(0, RELOAD_CONTEXT_DAILY_LIMIT - usedToday),
    nextResetAt: dayEnd,
  };
}
