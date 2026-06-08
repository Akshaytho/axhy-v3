import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Site ids owned by `userId` (an HR) within the company — the site-anchored
 * replacement for the old getMyPodIds. HR data-access scopes to these site ids
 * (workers assigned to them, complaints/leave on them). Backed by the
 * @@index([companyId, ownerHrUserId]) on Site.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 * (founder decision: HR-portal-final/15_OWNERSHIP_MODEL_DECISION.md §3)
 */
export async function getHrSiteIds(
  db: PrismaClient | Prisma.TransactionClient,
  userId: string,
  companyId: string,
): Promise<string[]> {
  const rows = await db.site.findMany({
    where: { companyId, ownerHrUserId: userId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
