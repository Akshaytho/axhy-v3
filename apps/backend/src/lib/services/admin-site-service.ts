/**
 * Services for R4 POST /admin/sites + R5 POST /admin/sites/:id/bindings.
 *
 * @derives(ADR-0026)
 * @derives(ADR-0003)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { Prisma } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';

/** @derives(ADR-0026) */
export type AdminCreateSiteServiceInput = {
  callerCompanyId: string;
  callerUserId: string;
  body: {
    name: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    workdays?: string;
  };
};

/** @derives(ADR-0026) */
export type AdminCreateSiteServiceOutput = { kind: 'OK'; siteId: string };

/** @derives(ADR-0026) */
export async function adminCreateSiteService(
  tx: Prisma.TransactionClient,
  input: AdminCreateSiteServiceInput,
): Promise<AdminCreateSiteServiceOutput> {
  const site = await tx.site.create({
    data: {
      companyId: input.callerCompanyId,
      name: input.body.name,
      address: input.body.address ?? null,
      latitude: input.body.latitude ?? null,
      longitude: input.body.longitude ?? null,
      workdays: input.body.workdays ?? 'MTWTFS_',
      state: 'DRAFT',
    },
  });

  await recordAuditEvent(tx, {
    companyId: input.callerCompanyId,
    kind: 'SITE_CREATED',
    actorId: input.callerUserId,
    targetId: site.id,
    payload: { siteId: site.id, name: input.body.name },
  });

  return { kind: 'OK', siteId: site.id };
}

/** @derives(ADR-0026) */
export type AdminCreateBindingServiceInput = {
  siteId: string;
  callerCompanyId: string;
  callerUserId: string;
  body: {
    supervisorUserId: string;
    effectiveFrom: string;
    effectiveUntil?: string;
    actingForUserId?: string;
    reason: string;
  };
};

/** @derives(ADR-0026) */
export type AdminCreateBindingServiceOutput =
  | { kind: 'OK'; bindingId: string }
  | { kind: 'SITE_NOT_FOUND' }
  | { kind: 'SUPERVISOR_NOT_FOUND' };

/** @derives(ADR-0026) */
export async function adminCreateBindingService(
  tx: Prisma.TransactionClient,
  input: AdminCreateBindingServiceInput,
): Promise<AdminCreateBindingServiceOutput> {
  const site = await tx.site.findFirst({
    where: { id: input.siteId, companyId: input.callerCompanyId },
  });
  if (!site) return { kind: 'SITE_NOT_FOUND' };

  const supMembership = await tx.membership.findFirst({
    where: {
      userId: input.body.supervisorUserId,
      companyId: input.callerCompanyId,
      role: 'SUPERVISOR',
      status: 'ACTIVE',
    },
  });
  if (!supMembership) return { kind: 'SUPERVISOR_NOT_FOUND' };

  const binding = await tx.siteSupervisorBinding.create({
    data: {
      companyId: input.callerCompanyId,
      siteId: input.siteId,
      userId: input.body.supervisorUserId,
      actingForUserId: input.body.actingForUserId ?? null,
      effectiveFrom: new Date(input.body.effectiveFrom),
      effectiveUntil: input.body.effectiveUntil ? new Date(input.body.effectiveUntil) : null,
      reason: input.body.reason,
      createdBy: input.callerUserId,
    },
  });

  await recordAuditEvent(tx, {
    companyId: input.callerCompanyId,
    kind: 'BINDING_CREATED',
    actorId: input.callerUserId,
    targetId: binding.id,
    payload: {
      bindingId: binding.id,
      siteId: input.siteId,
      supervisorUserId: input.body.supervisorUserId,
      actingForUserId: input.body.actingForUserId ?? null,
    },
  });

  return { kind: 'OK', bindingId: binding.id };
}

/** @derives(master-plan §G) — site-anchored HR ownership (doc 15) */
export type AdminAssignSiteHrServiceInput = {
  callerCompanyId: string;
  callerUserId: string;
  siteId: string;
  /** null = unassign (OWNER removes the site's HR owner). */
  hrUserId: string | null;
};

/** @derives(master-plan §G) */
export type AdminAssignSiteHrServiceOutput =
  | { kind: 'OK'; siteId: string; hrUserId: string | null }
  | { kind: 'SITE_NOT_FOUND' }
  | { kind: 'HR_NOT_FOUND' }
  | { kind: 'WOULD_SPLIT_WORKER'; workerIds: string[] };

/**
 * OWNER-only direct site→HR ownership assignment (site-anchored model, doc 15).
 * Upholds the one-worker-one-HR invariant on the reassign path via a split-safety
 * check: a reassignment can never leave a worker on this site who also works a
 * site owned by a different HR.
 *
 * @derives(master-plan §G) — HR control plane
 */
export async function adminAssignSiteHrService(
  tx: Prisma.TransactionClient,
  input: AdminAssignSiteHrServiceInput,
): Promise<AdminAssignSiteHrServiceOutput> {
  const site = await tx.site.findFirst({
    where: { id: input.siteId, companyId: input.callerCompanyId },
    select: { id: true, ownerHrUserId: true },
  });
  if (!site) return { kind: 'SITE_NOT_FOUND' };

  if (input.hrUserId !== null) {
    // Target must be an ACTIVE HR member of this company.
    const hr = await tx.membership.findFirst({
      where: {
        userId: input.hrUserId,
        companyId: input.callerCompanyId,
        role: 'HR',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!hr) return { kind: 'HR_NOT_FOUND' };

    // Split-safety (one worker = one HR): reject if any worker on this site also
    // works a site owned by a DIFFERENT non-null HR — that worker would be split
    // across two HRs. (Unassigning to null can never split, so it's skipped.)
    const splitWorkers = await tx.worker.findMany({
      where: {
        companyId: input.callerCompanyId,
        AND: [
          { assignments: { some: { siteId: input.siteId } } },
          {
            assignments: {
              some: {
                site: {
                  AND: [
                    { ownerHrUserId: { not: null } },
                    { ownerHrUserId: { not: input.hrUserId } },
                  ],
                },
              },
            },
          },
        ],
      },
      select: { id: true },
      take: 20,
    });
    if (splitWorkers.length > 0) {
      return { kind: 'WOULD_SPLIT_WORKER', workerIds: splitWorkers.map((w) => w.id) };
    }
  }

  await tx.site.update({
    where: { id: input.siteId },
    data: { ownerHrUserId: input.hrUserId },
  });

  await recordAuditEvent(tx, {
    companyId: input.callerCompanyId,
    kind: 'SITE_HR_ASSIGNED',
    actorId: input.callerUserId,
    targetId: input.siteId,
    payload: {
      siteId: input.siteId,
      hrUserId: input.hrUserId,
      previousHrUserId: site.ownerHrUserId,
    },
  });

  return { kind: 'OK', siteId: input.siteId, hrUserId: input.hrUserId };
}
