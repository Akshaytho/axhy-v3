/**
 * activity-service — composes the `GET /supervisor/activity` response.
 *
 * Reads AuditEvent rows authored by the calling supervisor (scoped to
 * tenant via `withTenantContext`), sorted newest-first, capped at a
 * pagination limit. Composes a plain-English `summary` line per row from
 * the kind taxonomy + payload — so the client doesn't have to know the
 * payload shape.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Activity slice
 */

import type { Prisma } from '@prisma/client';
import { ActivityResponse, type ActivityResponseT } from '@axhy/shared-schema';

import { summarizeAuditKind } from './audit-summary.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** @derives(ADR-0003) @derives(master-plan §G) — Activity slice */
export type BuildActivityArgs = {
  companyId: string;
  userId: string;
  /** Page size, capped at MAX_LIMIT. */
  limit?: number;
};

/**
 * Build the `GET /supervisor/activity` response for the caller.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export async function buildActivityForSupervisor(
  tx: Prisma.TransactionClient,
  args: BuildActivityArgs,
): Promise<ActivityResponseT> {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const rows = await tx.auditEvent.findMany({
    where: { companyId: args.companyId, actorId: args.userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      kind: true,
      targetId: true,
      payload: true,
      createdAt: true,
    },
  });

  const composed = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    when: r.createdAt.toISOString(),
    targetId: r.targetId ?? null,
    summary: summarizeAuditKind(r.kind, r.payload),
  }));

  return ActivityResponse.parse({ rows: composed });
}
