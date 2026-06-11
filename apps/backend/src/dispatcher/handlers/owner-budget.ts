/**
 * Owner AI-budget outbox handlers — stubs for Wave 4b Phase 1.
 *
 * Topics handled:
 *   - owner.ai_budget_warning  → 80% of daily cap reached (₹3K)
 *   - owner.ai_budget_capped   → 100% of daily cap reached (₹5K), 429 fired
 *
 * Phase D will replace these stubs with real Slack channel `#axhy-ops` +
 * Mr. Reddy WhatsApp delivery via Gupshup. Today the stubs:
 *   - log at WARN level so ops can tail dispatcher logs to confirm fires
 *   - write an OWNER_BUDGET_ALERT_DISPATCHED audit row for the immutable
 *     trail (compliance + future dashboard)
 *
 * Idempotency is enforced upstream by the Outbox.idempotencyKey unique
 * constraint (migration 20260510_wave_4b_ai_spend_protection); these
 * handlers don't need their own dedup logic — by the time they fire, the
 * row already passed the unique check.
 *
 * @derives(spec-2 §9.4, §12)
 * @derives(ADR-0009) — outbox over Redis until measured pain
 * @derives(ADR-0023)
 */

import type { FastifyBaseLogger } from 'fastify';

// RLS Option-A: dispatcher handlers use the dispatcher client (RLS-bypassing
// role post-flip) — under axhy_app the AuditEvent insert is policy-blocked
// (dispatcher/db.ts). Same object as the singleton until
// DISPATCHER_DATABASE_URL is set.
import { dispatcherPrisma as prisma } from '../db.js';

type BudgetAlertPayload = {
  kind: 'WARN' | 'CAP';
  dateUtc: string;
  companyId: string;
  topic: string;
};

function parsePayload(raw: unknown): BudgetAlertPayload {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`owner-budget handler: payload is not an object: ${JSON.stringify(raw)}`);
  }
  const p = raw as Record<string, unknown>;
  const kind = p.kind === 'WARN' || p.kind === 'CAP' ? p.kind : null;
  const dateUtc = typeof p.dateUtc === 'string' ? p.dateUtc : null;
  const companyId = typeof p.companyId === 'string' ? p.companyId : null;
  const topic = typeof p.topic === 'string' ? p.topic : null;
  if (!kind || !dateUtc || !companyId || !topic) {
    throw new Error(
      `owner-budget handler: missing required field in payload: ${JSON.stringify(raw)}`,
    );
  }
  return { kind, dateUtc, companyId, topic };
}

async function recordOwnerAlertAudit(
  payload: BudgetAlertPayload,
  log: FastifyBaseLogger,
): Promise<void> {
  log.warn(
    { event: 'owner_budget_alert', ...payload, stub: 'owner-budget' },
    `[stub] ${payload.topic} fired — Phase D will swap for Slack #axhy-ops + Mr. Reddy WhatsApp via Gupshup`,
  );
  // #26: idempotent — outbox redelivery of the same alert must not write a
  // duplicate audit row. dedupKey is unique per (company, day, topic); createMany
  // with skipDuplicates is a no-op (ON CONFLICT DO NOTHING) on redelivery.
  await prisma.auditEvent.createMany({
    data: [
      {
        companyId: payload.companyId,
        kind: 'OWNER_BUDGET_ALERT_DISPATCHED',
        actorId: '00000000-0000-0000-0000-000000000000', // SYSTEM
        targetId: null,
        payload: {
          topic: payload.topic,
          alertKind: payload.kind,
          dateUtc: payload.dateUtc,
        },
        dedupKey: `owner_budget:${payload.dateUtc}:${payload.topic}`,
      },
    ],
    skipDuplicates: true,
  });
}

export async function handleOwnerAiBudgetWarning(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  const parsed = parsePayload(payload);
  if (parsed.kind !== 'WARN') {
    throw new Error(
      `owner.ai_budget_warning handler invoked with kind=${parsed.kind}, expected WARN`,
    );
  }
  await recordOwnerAlertAudit(parsed, log);
}

export async function handleOwnerAiBudgetCapped(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  const parsed = parsePayload(payload);
  if (parsed.kind !== 'CAP') {
    throw new Error(
      `owner.ai_budget_capped handler invoked with kind=${parsed.kind}, expected CAP`,
    );
  }
  await recordOwnerAlertAudit(parsed, log);
}
