/**
 * HR Updates service — composes the `GET /supervisor/updates` response.
 *
 * Schema note: `HRUpdate` stores a single `acknowledgedBy` UUID on the row
 * (not a join table). This means one HRUpdate can track one acknowledger —
 * the most-recent. For v0, a row is "acknowledged by this user" when
 * `acknowledgedBy === userId`. A per-user ack join table is a future slice.
 *
 * Audience rules (v0 — refine later):
 *   - Org-wide updates: `targetSupervisorId IS NULL` — visible to all supervisors.
 *   - Targeted updates: `targetSupervisorId = userId` — visible only to that user.
 *   - Both are filtered per `companyId` (tenant isolation enforced first).
 *
 * Partitioning:
 *   - `needsAck`: rows with `acknowledgmentRequired = true` and `acknowledgedBy != userId`
 *     (or acknowledgedBy IS NULL). Capped at 20, ordered newest-first.
 *   - `recentAcked`: rows where `acknowledgedBy = userId` and `acknowledgedAt` is within
 *     the last 30 days. Capped at 20, ordered newest ack first.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */

import type { Prisma } from '@prisma/client';
import { HRUpdatesResponse, type HRUpdateRowT, type HRUpdatesResponseT } from '@axhy/shared-schema';

const CAP = 20;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Arguments for `buildHRUpdatesForSupervisor`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export type BuildHRUpdatesArgs = {
  companyId: string;
  userId: string;
  /** Defaults to `new Date()`. */
  at?: Date;
};

/**
 * Build the `GET /supervisor/updates` response for the calling supervisor.
 *
 * Reads HRUpdate rows filtered by audience (org-wide or targeted),
 * determines acknowledged status per the single-ack-on-row v0 scheme,
 * and partitions into `needsAck` / `recentAcked`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export async function buildHRUpdatesForSupervisor(
  tx: Prisma.TransactionClient,
  args: BuildHRUpdatesArgs,
): Promise<HRUpdatesResponseT> {
  const at = args.at ?? new Date();
  const thirtyDaysAgo = new Date(at.getTime() - THIRTY_DAYS_MS);

  // Fetch all updates visible to this supervisor:
  //   - org-wide (targetSupervisorId IS NULL), OR
  //   - targeted to this user explicitly.
  const rows = await tx.hRUpdate.findMany({
    where: {
      companyId: args.companyId,
      OR: [{ targetSupervisorId: null }, { targetSupervisorId: args.userId }],
    },
    orderBy: { createdAt: 'desc' },
    // Over-fetch enough to fill both lists after partitioning (worst-case: all
    // rows need ack and caller has acked none, so needsAck cap = 20; or all acked).
    take: CAP * 4,
  });

  if (rows.length === 0) {
    return HRUpdatesResponse.parse({
      needsAck: [],
      recentAcked: [],
      counts: { needsAck: 0, recentAcked: 0 },
    });
  }

  const needsAckRows: HRUpdateRowT[] = [];
  const recentAckedRows: HRUpdateRowT[] = [];

  for (const row of rows) {
    const ackedByMe = row.acknowledgedBy === args.userId;
    const ackedAt = ackedByMe && row.acknowledgedAt ? row.acknowledgedAt : null;

    // Determine which bucket this row belongs to:
    //   needsAck — requiresAck AND caller has not acked.
    //   recentAcked — caller has acked within the last 30 days.
    const isNeedsAck = row.acknowledgmentRequired && !ackedByMe;
    const isRecentAcked = ackedByMe && ackedAt !== null && ackedAt >= thirtyDaysAgo;

    const wire: HRUpdateRowT = {
      id: row.id,
      title: row.kind, // HRUpdate.kind serves as title (e.g. "POLICY_CHANGE")
      body: row.content,
      requiresAck: row.acknowledgmentRequired,
      acknowledged: ackedByMe,
      ackText: ackedByMe ? (row.acknowledgmentPhrase ?? null) : null,
      ackedAt: ackedAt ? ackedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };

    if (isNeedsAck && needsAckRows.length < CAP) {
      needsAckRows.push(wire);
    } else if (isRecentAcked && recentAckedRows.length < CAP) {
      recentAckedRows.push(wire);
    }
  }

  return HRUpdatesResponse.parse({
    needsAck: needsAckRows,
    recentAcked: recentAckedRows,
    counts: {
      needsAck: needsAckRows.length,
      recentAcked: recentAckedRows.length,
    },
  });
}
