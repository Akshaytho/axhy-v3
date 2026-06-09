import type { Prisma, PrismaClient } from '@prisma/client';

import { withTenantRead } from './tenant-context.js';

/**
 * Site ids owned by `userId` (an HR) within the company — the site-anchored
 * replacement for the old getMyPodIds. HR data-access scopes to these site ids
 * (workers assigned to them, complaints/leave on them). Backed by the
 * @@index([companyId, ownerHrUserId]) on Site.
 *
 * RLS: Site is FORCE-RLS (migration 023). When called with the base PrismaClient
 * (no GUC), this self-wraps in withTenantRead so the read returns rows under the
 * axhy_app role; when called with a transaction client (already inside
 * withTenantContext/withTenantRead) the company GUC is already set, so it reads
 * directly. Discriminator: only a base PrismaClient exposes `$transaction`.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 * (founder decision: HR-portal-final/15_OWNERSHIP_MODEL_DECISION.md §3)
 */
export async function getHrSiteIds(
  db: PrismaClient | Prisma.TransactionClient,
  userId: string,
  companyId: string,
): Promise<string[]> {
  const read = (client: PrismaClient | Prisma.TransactionClient): Promise<string[]> =>
    client.site
      .findMany({ where: { companyId, ownerHrUserId: userId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));

  if (typeof (db as PrismaClient).$transaction === 'function') {
    return withTenantRead(db as PrismaClient, companyId, (tx) => read(tx));
  }
  return read(db);
}
