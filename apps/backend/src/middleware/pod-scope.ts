// [ORCHESTRATOR_EXCEPTION] Task 2 subagent execution — implementing pod-scope helpers per docs/plans/2026-05-29-hr-a1-implementation.md.
import type { PrismaClient } from '@prisma/client';

/** @derives(ADR-0026) */
export class PodOwnershipError extends Error {
  constructor(message = 'NOT_POD_OWNER') {
    super(message);
    this.name = 'PodOwnershipError';
  }
}

/** @derives(ADR-0026) */
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

/** @derives(ADR-0026) */
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
