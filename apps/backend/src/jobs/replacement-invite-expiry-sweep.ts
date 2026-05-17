/**
 * F28 — replacement-invite-expiry-sweep — Wave 1 backend.
 *
 * Flips PENDING ReplacementInvite rows past `expiresAt` to EXPIRED, then
 * emits an outcome SupervisorDecision row (kind `REPLACEMENT_INVITE_OUTCOME`)
 * for any group that finished without a winner.
 *
 * Scheduling shape (mirrors `binding-expire-sweep.ts`):
 *   Piggyback on the existing outbox dispatcher tick. The dispatcher ticks
 *   every ~2 s; this function is called on every tick but the in-memory
 *   `lastSweepInstant` marker gates real work to once per
 *   SWEEP_INTERVAL_MS (30 s). 30 s matches the 2-minute countdown UX —
 *   worst-case the supervisor sees the outcome ~30 s after expiry.
 *
 * Idempotency (master-plan §P.4):
 *   The service layer's atomic UPDATE on `status='PENDING'` is naturally
 *   idempotent — a second replica's sweep finds 0 rows once the first
 *   replica completes. Outcome decisions are de-duped via a
 *   `findFirst` on the existing SupervisorDecision row keyed by
 *   (companyId, kind='REPLACEMENT_INVITE_OUTCOME', targetId=groupId).
 *
 * Failure-tolerant: catches errors at the batch level, logs at error level,
 * returns without throwing so the dispatcher's outbox-poll loop continues.
 * Next tick re-tries any rows still PENDING-past-expiresAt.
 *
 * Alert thresholds (docs/runbooks/replacement-invite-expiry.md):
 *   - Sweep fails for 3 consecutive minutes → page on-call
 *   - Sweep processes >500 rows in one cycle → page on-call (thundering
 *     herd / supervisor mistake; investigate)
 *
 * @derives(master-plan §P.4 — ReplacementInvite cron sweep)
 * @derives(replacement-invite-feature-spec.md, 2026-05-18)
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { sweepExpiredReplacementInvites } from '../lib/services/replacement-invite-service.js';

/** Sweep cadence — every 30 s. */
const SWEEP_INTERVAL_MS = 30 * 1000;

/** Alert threshold — log warn if one cycle processes more than this. */
const LARGE_SWEEP_THRESHOLD = 500;

/**
 * In-memory marker — last instant this dispatcher process ran the sweep.
 * First-boot records `now` so a process restart in the middle of an
 * interval doesn't trigger a sweep on the very first tick (matches
 * binding-expire-sweep's first-boot behaviour).
 */
let lastSweepInstant: Date | null = null;

/**
 * Test helper — clears the cadence marker so tests can force-run the sweep.
 * Not exported via any index; only used by integration tests.
 *
 * @derives(master-plan §P.4) — cron sweep test affordance
 */
export function _resetSweepMarkerForTesting(): void {
  lastSweepInstant = null;
}

/**
 * Run the sweep if (and only if) at least SWEEP_INTERVAL_MS has elapsed
 * since the last successful run. First-boot records `now` as
 * already-swept so a process restart mid-interval doesn't trigger a sweep
 * on the first tick.
 *
 * @returns `{ ran, expiredCount, outcomeDecisionsEmitted }` for callers,
 *          tests, and dashboards; never throws.
 *
 * @derives(master-plan §P.4 — cron sweep)
 */
/** @derives(master-plan §P.4) — dispatcher-tick cadence gate for the sweep */
export async function maybeRunReplacementInviteExpirySweep(
  client: PrismaClient,
  log: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<{ ran: boolean; expiredCount: number; outcomeDecisionsEmitted: number }> {
  if (lastSweepInstant === null) {
    lastSweepInstant = now;
    return { ran: false, expiredCount: 0, outcomeDecisionsEmitted: 0 };
  }

  if (now.getTime() - lastSweepInstant.getTime() < SWEEP_INTERVAL_MS) {
    return { ran: false, expiredCount: 0, outcomeDecisionsEmitted: 0 };
  }

  try {
    const result = await sweepExpiredReplacementInvites(client, now);
    lastSweepInstant = now;
    if (result.expiredCount > 0 || result.outcomeDecisionsEmitted > 0) {
      log.info(
        {
          event: 'replacement_invite_expiry_sweep.complete',
          expiredCount: result.expiredCount,
          outcomeDecisionsEmitted: result.outcomeDecisionsEmitted,
          sweptAt: now.toISOString(),
        },
        'replacement-invite-expiry-sweep batch complete',
      );
    }
    if (result.expiredCount > LARGE_SWEEP_THRESHOLD) {
      log.warn(
        {
          event: 'replacement_invite_expiry_sweep.large_batch',
          expiredCount: result.expiredCount,
          threshold: LARGE_SWEEP_THRESHOLD,
        },
        'replacement-invite-expiry-sweep processed unusually large batch — investigate',
      );
    }
    return {
      ran: true,
      expiredCount: result.expiredCount,
      outcomeDecisionsEmitted: result.outcomeDecisionsEmitted,
    };
  } catch (err) {
    log.error(
      { event: 'replacement_invite_expiry_sweep.batch_failed', err: (err as Error).message },
      'replacement-invite-expiry-sweep batch failed — will retry next tick',
    );
    return { ran: false, expiredCount: 0, outcomeDecisionsEmitted: 0 };
  }
}
