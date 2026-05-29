// [ORCHESTRATOR_EXCEPTION] Task 2 subagent re-create with ADR-format JSDoc to satisfy strict axhy/require-derives regex.
import type { PrismaClient } from '@prisma/client';

/**
 * Thrown by requirePodOwnership when the caller is neither primary nor backup
 * owner of the target HRPod within their company.
 *
 * @derives(ADR-0026)
 */
export class PodOwnershipError extends Error {
  constructor(message = 'NOT_POD_OWNER') {
    super(message);
    this.name = 'PodOwnershipError';
  }
}

/**
 * Returns the set of HRPod ids the given user owns (primary or backup) within
 * the caller's company. Used by HR list/detail handlers to scope queries to
 * only the pods the caller is responsible for.
 *
 * @derives(ADR-0026)
 */
export async function getMyPodIds(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
): Promise<string[]> {
  const rows = await prisma.hRPod.findMany({
    where: {
      companyId,
      OR: [{ primaryOwnerUserId: userId }, { backupOwnerUserId: userId }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Throws PodOwnershipError unless the given user is primary or backup owner of
 * the target HRPod within the caller's company. Use at the top of any handler
 * that mutates pod-scoped resources.
 *
 * @derives(ADR-0026)
 */
export async function requirePodOwnership(
  prisma: PrismaClient,
  podId: string,
  userId: string,
  companyId: string,
): Promise<void> {
  const pod = await prisma.hRPod.findFirst({
    where: {
      id: podId,
      companyId,
      OR: [{ primaryOwnerUserId: userId }, { backupOwnerUserId: userId }],
    },
    select: { id: true },
  });
  if (!pod) throw new PodOwnershipError();
}
