/**
 * F-003 — binding-expire-sweep: side-effect audit emit for time-based binding expiry.
 *
 * What this sweep does and does NOT do (from F-003 scope §2 / closure spec
 * §3.1 + §10 2026-05-16 update):
 *
 *   The sweep does NOT decide who is the current supervisor.
 *   Responsibility switching when `effectiveUntil` passes is already correct
 *   and time-based via getEffectiveBinding's read-time predicate
 *   (`effectiveFrom <= at AND (effectiveUntil IS NULL OR effectiveUntil > at)
 *    AND endedAt IS NULL`). The acting binding falls out the instant
 *   `effectiveUntil` passes; no cron is needed for the switch itself.
 *
 *   The sweep emits a `BINDING_ENDED_AUTO` AuditEvent for each binding whose
 *   `effectiveUntil` has passed and that has not yet been audit-emitted.
 *   Downstream consumers (notification dispatcher F-007, "while you were out"
 *   digest, audit-trail reports) get the signal from this event.
 *
 *   The sweep does NOT mutate the binding row. Setting `endedAt` here would
 *   break historical point-in-time queries via getEffectiveBinding (which
 *   filters `endedAt IS NULL`); the row must stay `endedAt = NULL` so a query
 *   at `at < effectiveUntil` still returns it.
 *
 * Scheduling shape (F-003 scope §4 pick 1, corrected 2026-05-16):
 *   Piggyback on the existing outbox dispatcher tick — same pattern as
 *   `maybeResetAiSpend`. The dispatcher ticks every ~2s; this function is
 *   called on every tick but the in-memory `lastSweepInstant` marker gates
 *   real work to once per 5 minutes (F-003 pick 2, locked at closure spec
 *   §10 line 560).
 *
 * Idempotency (F-003 scope §4 pick 7):
 *   Per-row audit-existence check — the sweep query filters
 *   `effectiveUntil <= now AND endedAt IS NULL AND NOT EXISTS (audit row
 *    with kind='BINDING_ENDED_AUTO' AND targetId=binding.id)`. Re-running
 *   the sweep is a no-op. Multi-replica safe via the same predicate (second
 *   replica's query finds zero rows).
 *
 * Transaction shape (F-003 scope §4 pick 4):
 *   One Prisma transaction per binding — independent per-row side effects;
 *   a single failure does not roll back the others.
 *
 * S-001 interaction (F-003 scope §4 pick 3):
 *   The sweep is exempt from the S-001 same-day-supervisor-freeze guard.
 *   Responsibility switching already happened at read-time when
 *   `effectiveUntil` passed; this sweep emits side-effect audit only and
 *   does not mutate the binding row, so it cannot violate the freeze.
 *
 * Failure-tolerant: catches errors per-binding, logs at error level,
 * returns without throwing so the dispatcher's outbox-poll loop continues.
 * The next tick re-tries any rows that failed.
 *
 * @derives(closure spec §10 2026-05-16 update)
 * @derives(closure spec §3.1 2026-05-16 update)
 * @derives(F-003 scope artifact 2026-05-16)
 * @derives(master-plan §G) — HR control plane / responsibility model
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { recordBindingEndedAuto } from '../lib/site-supervisor-binding.js';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

/** Sweep cadence — F-003 pick 2, locked at closure spec §10 line 560. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * In-memory marker — last instant this dispatcher process ran the sweep.
 * Persists for the lifetime of the dispatcher process. First-boot path
 * (see `maybeRunBindingExpireSweep` below) records "now" so a midday
 * restart doesn't trigger a sweep run on the very first tick.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
let lastSweepInstant: Date | null = null;

/**
 * Test helper — forces re-run on next call by clearing the marker.
 * Not exported via any index; only used by integration tests.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export function _resetSweepMarkerForTesting(): void {
  lastSweepInstant = null;
}

/**
 * Run the sweep if (and only if) at least SWEEP_INTERVAL_MS has elapsed
 * since the last successful run. First-boot records `now` so a process
 * restart in the middle of an interval doesn't trigger a sweep on the
 * first tick.
 *
 * @returns `{ ran, auditsEmitted, failed }` for callers/tests/dashboards;
 *          never throws.
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export async function maybeRunBindingExpireSweep(
  client: PrismaClient,
  log: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<{ ran: boolean; auditsEmitted: number; skippedDuplicate: number; failed: number }> {
  // First boot — record "now" as already-swept so a process restart mid-
  // interval doesn't trigger a sweep on the very first tick. Mirrors
  // maybeResetAiSpend's first-boot behavior.
  if (lastSweepInstant === null) {
    lastSweepInstant = now;
    return { ran: false, auditsEmitted: 0, skippedDuplicate: 0, failed: 0 };
  }

  // Cadence gate — only fire every SWEEP_INTERVAL_MS even though the
  // dispatcher tick polls every ~2s.
  if (now.getTime() - lastSweepInstant.getTime() < SWEEP_INTERVAL_MS) {
    return { ran: false, auditsEmitted: 0, skippedDuplicate: 0, failed: 0 };
  }

  // Run the sweep.
  let auditsEmitted = 0;
  let skippedDuplicate = 0;
  let failed = 0;
  try {
    const candidates = await findBindingsNeedingAuditEmit(client, now);
    for (const candidate of candidates) {
      try {
        const { emitted } = await emitAuditForOneBinding(client, candidate);
        if (emitted) {
          auditsEmitted++;
        } else {
          // Either the cheap-skip findFirst caught a pre-existing audit
          // OR the partial unique index caught a multi-replica race and
          // we swallowed the P2002. Either way, the binding IS audited.
          skippedDuplicate++;
        }
      } catch (err) {
        failed++;
        log.error(
          {
            event: 'binding_expire_sweep.row_failed',
            err: (err as Error).message,
            bindingId: candidate.id,
          },
          'binding-expire-sweep row failed — will retry next sweep',
        );
        // Per-row failure does not block the rest of the batch (pick 4).
        // The audit-existence predicate + DB unique index (pick 7) ensure
        // the next sweep picks this row up again automatically.
      }
    }
    // Advance the marker only after the batch completes (pass or partial).
    // Same-tick re-entry by another call is blocked by the marker; per-row
    // re-attempts happen on the NEXT 5-min tick.
    lastSweepInstant = now;
    if (auditsEmitted > 0 || skippedDuplicate > 0 || failed > 0) {
      log.info(
        {
          event: 'binding_expire_sweep.complete',
          auditsEmitted,
          skippedDuplicate,
          failed,
          sweptAt: now.toISOString(),
        },
        'binding-expire-sweep batch complete',
      );
    }
    return { ran: true, auditsEmitted, skippedDuplicate, failed };
  } catch (err) {
    // Batch-level failure (e.g. the find query crashed before any per-row
    // work). Do NOT advance the marker — next tick will retry the whole
    // batch.
    log.error(
      { event: 'binding_expire_sweep.batch_failed', err: (err as Error).message },
      'binding-expire-sweep batch failed — will retry next sweep',
    );
    return { ran: false, auditsEmitted: 0, skippedDuplicate: 0, failed: 0 };
  }
}

/**
 * Per-binding work — emit `BINDING_ENDED_AUTO` for one binding.
 *
 * Dedup is DB-enforced (round-2 fix per friend's F-003 round-1 P1):
 * migration `20260519_f003_binding_ended_auto_dedup_index` adds a
 * partial unique index on `(companyId, kind, targetId) WHERE
 * kind='BINDING_ENDED_AUTO' AND targetId IS NOT NULL`. Two concurrent
 * dispatcher replicas hitting the same binding both attempt insert;
 * exactly one wins; the loser sees a P2002 unique-violation, which
 * this function catches and treats as "another replica already did it"
 * (no-op, counted as a success-equivalent for the caller's batch
 * accounting).
 *
 * The findFirst cheap-skip BEFORE the insert is kept as an
 * optimisation: in the common single-replica case (and the common
 * second-tick rerun), it avoids throwing and rolling back a tx for
 * what's already known to be a no-op. It is NOT a correctness
 * mechanism — the partial unique index is.
 *
 * Internal helper — not exported.
 *
 * @derives(F-003 scope artifact §4 pick 7, revised 2026-05-16 round-2)
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export async function _emitAuditForOneBindingForTesting(
  client: PrismaClient,
  binding: ExpiredBindingCandidate,
): Promise<{ emitted: boolean }> {
  return emitAuditForOneBinding(client, binding);
}

async function emitAuditForOneBinding(
  client: PrismaClient,
  binding: ExpiredBindingCandidate,
): Promise<{ emitted: boolean }> {
  try {
    return await client.$transaction(async (tx) => {
      // Cheap-skip: avoid throwing a P2002 in the common case where the
      // audit already exists. This is an optimisation, not the
      // correctness guarantee — the partial unique index is.
      const alreadyEmitted = await tx.auditEvent.findFirst({
        where: {
          companyId: binding.companyId,
          kind: 'BINDING_ENDED_AUTO',
          targetId: binding.id,
        },
        select: { id: true },
      });
      if (alreadyEmitted) {
        return { emitted: false };
      }
      await recordBindingEndedAuto(tx, {
        companyId: binding.companyId,
        actorId: SYSTEM_ACTOR_ID,
        payload: {
          bindingId: binding.id,
          siteId: binding.siteId,
          userId: binding.userId,
          actingForUserId: binding.actingForUserId,
          effectiveFrom: binding.effectiveFrom.toISOString(),
          effectiveUntil: binding.effectiveUntil!.toISOString(),
          sweptAt: new Date().toISOString(),
        },
      });
      return { emitted: true };
    });
  } catch (err) {
    // P2002 = Prisma unique-constraint violation. Under the partial
    // unique index, that means another replica beat us to the insert.
    // Treat as a successful no-op race outcome — the binding IS
    // audited, just not by us.
    if (isPrismaUniqueViolation(err)) {
      return { emitted: false };
    }
    throw err;
  }
}

/**
 * Narrow Prisma error-type discriminator. We don't import
 * `Prisma.PrismaClientKnownRequestError` here to avoid a heavy
 * type-import dependency cycle in the jobs module; structural check
 * is enough.
 */
function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export type ExpiredBindingCandidate = {
  id: string;
  companyId: string;
  siteId: string;
  userId: string;
  actingForUserId: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
};

/**
 * Find bindings that have expired and not yet been audit-emitted.
 *
 * Predicate (F-003 pick 7):
 *   effectiveUntil <= now
 *   AND endedAt IS NULL
 *   AND NOT EXISTS (audit row with kind='BINDING_ENDED_AUTO' AND targetId=binding.id)
 *
 * `endedAt IS NULL` is included because a binding that was manually
 * ended early already has audit lineage (`BINDING_ENDED_MANUAL`); we
 * don't double-audit it as auto-expired.
 *
 * Internal helper — not exported.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
async function findBindingsNeedingAuditEmit(
  client: PrismaClient,
  now: Date,
): Promise<ExpiredBindingCandidate[]> {
  // Two-step approach (cleaner than raw SQL): find expired-but-not-ended
  // bindings, then filter out those that already have a BINDING_ENDED_AUTO
  // audit row. At launch scale (10s–100s of expiring bindings per day per
  // tenant) this is trivial; if it ever becomes a hot path we can rewrite
  // as a single NOT EXISTS join.
  const expired = await client.siteSupervisorBinding.findMany({
    where: {
      endedAt: null,
      effectiveUntil: { lte: now, not: null },
    },
    select: {
      id: true,
      companyId: true,
      siteId: true,
      userId: true,
      actingForUserId: true,
      effectiveFrom: true,
      effectiveUntil: true,
    },
  });

  if (expired.length === 0) return [];

  const alreadyAudited = await client.auditEvent.findMany({
    where: {
      kind: 'BINDING_ENDED_AUTO',
      targetId: { in: expired.map((b) => b.id) },
    },
    select: { targetId: true },
  });
  const auditedIds = new Set(
    alreadyAudited.map((a) => a.targetId).filter((x): x is string => x !== null),
  );

  return expired.filter((b) => !auditedIds.has(b.id));
}
