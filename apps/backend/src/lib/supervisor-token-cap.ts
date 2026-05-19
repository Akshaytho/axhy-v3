/**
 * Per-supervisor daily AI token cap — supersedes the message-count cap
 * (founder design change 2026-05-19). A token cap reflects actual AI
 * cost more honestly than a message count: a 30-second voice note + 4
 * photos burns ~10× the tokens of a 3-word "Mukesh absent".
 *
 * Cap is configurable per-tenant via Policy key
 * `ai.limits.tokens_per_supervisor_daily` (OWNER-only write per the
 * key-namespace ACL). Default 50000 tokens/day.
 *
 * Storage: derived from ChatMessage.tokensIn + ChatMessage.tokensOut
 * summed over (companyId, supervisorId via thread join, IST day). The
 * `tokensIn`/`tokensOut` columns were added in migration 015 and are
 * populated by chat.ts persistChatTurn from openaiToolLoop's usage.
 *
 * The cap is enforced BEFORE the AI call — chat.ts pre-flight checks
 * current usage and returns 429 TOKEN_LIMIT_REACHED if exceeded.
 *
 * Note: the cap counts ALL the tokens the supervisor's turn cost
 * (prompt + completion + cached). That matches what billing actually
 * sees on the OpenAI invoice — cached tokens are cheaper but still bill,
 * and a supervisor's prompt size is part of their abuse surface.
 *
 * @derives(master-plan §G)
 * @derives(plans/abstract-wandering-kazoo.md Wave A follow-on,
 *   supersedes supervisor-message-cap.ts)
 * @derives(docs/locked/chat-abuse-prevention.md — supersedes "200/day
 *   messages" with token-based cap)
 */

import type { Prisma } from '@prisma/client';

import { getCurrentPolicyValue } from './policy-service.js';

/** Locked-spec default. Overridable per-tenant via Policy.
 *  50,000 tokens at gpt-5.4-nano blended rate ≈ ₹5-10 per supervisor per
 *  day — generous for realistic use, tight enough to catch runaway loops. */
export const DEFAULT_DAILY_TOKEN_LIMIT = 50000;

export const POLICY_KEY_DAILY_TOKEN_LIMIT = 'ai.limits.tokens_per_supervisor_daily';

/** IST = UTC+05:30 — Asia/Kolkata. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function istDayStartUtc(now: Date): Date {
  const utcMs = now.getTime();
  const istLocalMs = utcMs + IST_OFFSET_MINUTES * 60 * 1000;
  const istLocal = new Date(istLocalMs);
  return new Date(
    Date.UTC(istLocal.getUTCFullYear(), istLocal.getUTCMonth(), istLocal.getUTCDate()) -
      IST_OFFSET_MINUTES * 60 * 1000,
  );
}
function istNextDayStartUtc(now: Date): Date {
  return new Date(istDayStartUtc(now).getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Resolve the daily token limit for a tenant. Reads Policy override
 * if present; falls back to the locked-doc default.
 */
export async function getDailyTokenLimit(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<number> {
  const raw = await getCurrentPolicyValue(tx, {
    companyId,
    key: POLICY_KEY_DAILY_TOKEN_LIMIT,
  });
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>).value;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
  }
  return DEFAULT_DAILY_TOKEN_LIMIT;
}

export type TokenCapCheckResult =
  | {
      ok: true;
      usedTodayTokens: number;
      dailyLimitTokens: number;
      remainingTokens: number;
    }
  | {
      ok: false;
      reason: 'TOKEN_LIMIT_REACHED';
      usedTodayTokens: number;
      dailyLimitTokens: number;
      remainingTokens: 0;
      nextResetAt: Date;
    };

/**
 * Sum `tokensIn + tokensOut` for this supervisor's ChatMessage rows in
 * today's IST window. Joins on ChatThread to map (companyId,
 * supervisorId) → threadId. NULL token columns count as 0.
 */
async function sumTokensToday(
  tx: Prisma.TransactionClient,
  companyId: string,
  supervisorId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<number> {
  // Raw aggregate: COALESCE(SUM(tokensIn + tokensOut), 0). Faster than
  // findMany + reduce at any non-trivial volume.
  const rows: Array<{ total: bigint | number | null }> = await tx.$queryRaw`
    SELECT COALESCE(SUM(COALESCE("tokensIn", 0) + COALESCE("tokensOut", 0)), 0)::bigint AS total
    FROM "axhy"."ChatMessage" m
    INNER JOIN "axhy"."ChatThread" t ON t."id" = m."threadId"
    WHERE m."companyId" = ${companyId}::uuid
      AND t."supervisorId" = ${supervisorId}::uuid
      AND m."createdAt" >= ${dayStart}
      AND m."createdAt" <  ${dayEnd}
  `;
  const total = rows[0]?.total ?? 0;
  return typeof total === 'bigint' ? Number(total) : (total as number);
}

export async function checkSupervisorTokenCap(
  tx: Prisma.TransactionClient,
  input: { companyId: string; supervisorId: string; now?: Date },
): Promise<TokenCapCheckResult> {
  const now = input.now ?? new Date();
  const dayStart = istDayStartUtc(now);
  const dayEnd = istNextDayStartUtc(now);

  const [dailyLimit, usedToday] = await Promise.all([
    getDailyTokenLimit(tx, input.companyId),
    sumTokensToday(tx, input.companyId, input.supervisorId, dayStart, dayEnd),
  ]);

  if (usedToday >= dailyLimit) {
    return {
      ok: false,
      reason: 'TOKEN_LIMIT_REACHED',
      usedTodayTokens: usedToday,
      dailyLimitTokens: dailyLimit,
      remainingTokens: 0,
      nextResetAt: dayEnd,
    };
  }
  return {
    ok: true,
    usedTodayTokens: usedToday,
    dailyLimitTokens: dailyLimit,
    remainingTokens: dailyLimit - usedToday,
  };
}
