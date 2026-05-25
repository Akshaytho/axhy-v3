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
