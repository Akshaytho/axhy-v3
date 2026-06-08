import { Prisma } from '@prisma/client';

/**
 * One-worker-one-HR invariant for the site-anchored HR ownership model
 * (founder doc 15, simplified 2026-06-08). A worker's sites must never span two
 * different HR owners — every worker belongs to exactly one HR.
 *
 * This is the SINGLE point that makes the rule structural across every
 * assignment-write path (POST /assignments, /chat/apply, replacement-invite
 * accept, calendar promote). Each path calls this inside its own transaction
 * BEFORE creating the Assignment.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 * (founder decision: HR-portal-final/15_OWNERSHIP_MODEL_DECISION.md §3)
 */
export type WorkerHrInvariant =
  | { ok: true }
  | { ok: false; existingHrUserId: string; newHrUserId: string };

/**
 * Returns {ok:true} when assigning the worker to `newSiteId` keeps the worker
 * under at most one HR; otherwise {ok:false} with the conflicting HR ids.
 *
 * Concurrency: takes a `FOR UPDATE` lock on the Worker row so two simultaneous
 * assignment transactions for the same worker serialize — the second observes
 * the first's committed assignment and correctly rejects, instead of both
 * passing a stale read-then-write check and splitting the worker across HRs.
 * No DB constraint can express this cross-row rule, so the row lock is the
 * enforcement point. The caller must run this inside the same tx as the create.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export async function validateWorkerHrInvariant(
  tx: Prisma.TransactionClient,
  args: { workerId: string; newSiteId: string; companyId: string },
): Promise<WorkerHrInvariant> {
  // Serialize concurrent assignment-creates for this worker (held to commit).
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "axhy"."Worker" WHERE id = ${args.workerId}::uuid AND "companyId" = ${args.companyId}::uuid FOR UPDATE`,
  );

  const newSite = await tx.site.findFirst({
    where: { id: args.newSiteId, companyId: args.companyId },
    select: { ownerHrUserId: true },
  });
  const newHr = newSite?.ownerHrUserId ?? null;

  // Union of NON-NULL HR owners across the worker's live (ACTIVE/DRAFT) sites.
  const existing = await tx.assignment.findMany({
    where: {
      workerId: args.workerId,
      companyId: args.companyId,
      state: { in: ['ACTIVE', 'DRAFT'] },
    },
    select: { site: { select: { ownerHrUserId: true } } },
  });

  const hrs = new Set<string>();
  for (const a of existing) {
    if (a.site.ownerHrUserId) hrs.add(a.site.ownerHrUserId);
  }
  if (newHr) hrs.add(newHr);

  // Invariant: at most one distinct non-null HR owner. Null-HR (unassigned)
  // sites never create a conflict; only a second DISTINCT HR is rejected.
  if (hrs.size > 1) {
    const all = [...hrs];
    const existingHr = all.find((h) => h !== newHr) ?? all[0] ?? '';
    return { ok: false, existingHrUserId: existingHr, newHrUserId: newHr ?? '' };
  }
  return { ok: true };
}
