/**
 * Supervisor Context service — composes `GET /supervisor/context`.
 *
 * `buildSupervisorContext` returns the two counts rendered by the Chat tab
 * GreetingCard: how many sites this supervisor is responsible for right now,
 * and how many distinct workers have active assignments on those sites.
 *
 * Both values are portfolio-scoped to the calling supervisor at request time,
 * applying §5.8 acting-over-permanent precedence via `getSitesSupervisedByUser`.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import type { Prisma } from '@prisma/client';
import type { SupervisorContextT } from '@axhy/shared-schema';

import { getSitesSupervisedByUser } from '../effective-responsibility.js';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type BuildSupervisorContextArgs = {
  companyId: string;
  userId: string;
  /** Defaults to `new Date()`. */
  at?: Date;
};

/**
 * Build the `GET /supervisor/context` response for the calling supervisor.
 *
 * - `sitesActive`   — number of sites this supervisor is effective-responsible
 *   for at `at`, after §5.8 acting-over-permanent resolution.
 * - `workersActive` — count of distinct `Assignment.workerId` where
 *   `state = 'ACTIVE'`, `validFrom <= at`, and
 *   `(validUntil IS NULL OR validUntil >= at)`,
 *   filtered to `siteId IN` the supervisor's portfolio.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export async function buildSupervisorContext(
  tx: Prisma.TransactionClient,
  args: BuildSupervisorContextArgs,
): Promise<SupervisorContextT> {
  const at = args.at ?? new Date();

  const portfolio = await getSitesSupervisedByUser(tx, {
    companyId: args.companyId,
    userId: args.userId,
    at,
  });

  if (portfolio.length === 0) {
    return { sitesActive: 0, workersActive: 0 };
  }

  const siteIds = portfolio.map((p) => p.siteId);

  const assignments = await tx.assignment.findMany({
    where: {
      companyId: args.companyId,
      siteId: { in: siteIds },
      state: 'ACTIVE',
      validFrom: { lte: at },
      OR: [{ validUntil: null }, { validUntil: { gte: at } }],
    },
    select: { workerId: true },
  });

  const distinctWorkers = new Set(assignments.map((a) => a.workerId));

  return {
    sitesActive: siteIds.length,
    workersActive: distinctWorkers.size,
  };
}
