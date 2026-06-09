/**
 * Service for POST /super-admin/memberships.
 *
 * Bootstraps the first OWNER of a tenant. Verifies the target company
 * exists and is ACTIVE, upserts the User by phone (excluding anonymised
 * rows), and creates an ACTIVE OWNER Membership inside the supplied
 * transaction. Calls assertTargetRole(SUPER_ADMIN, OWNER) for drift
 * coverage — if HIRING_AUTHORITY ever drops OWNER from SUPER_ADMIN,
 * this route fails closed before touching the DB.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { Prisma } from '@prisma/client';

import { TargetRoleError, assertTargetRole } from '../../middleware/role-gates.js';
import { recordAuditEvent } from '../audit-event.js';

/** @derives(ADR-0026) */
export type SuperAdminCreateOwnerServiceInput = {
  callerUserId: string;
  body: {
    companyId: string;
    phone: string;
    name: string;
    baseSalaryPaise: number;
    bankIfsc?: string;
    bankAcct?: string;
  };
};

/** @derives(ADR-0026) */
export type SuperAdminCreateOwnerServiceOutput =
  | { kind: 'OK'; membershipId: string; userId: string; companyId: string }
  | { kind: 'FORBIDDEN_TARGET_ROLE' }
  | { kind: 'COMPANY_NOT_FOUND' }
  | { kind: 'COMPANY_NOT_ACTIVE'; status: string }
  | { kind: 'ALREADY_EXISTS' };

/** @derives(ADR-0026) */
export async function superAdminCreateOwnerService(
  tx: Prisma.TransactionClient,
  input: SuperAdminCreateOwnerServiceInput,
): Promise<SuperAdminCreateOwnerServiceOutput> {
  try {
    assertTargetRole('SUPER_ADMIN', 'OWNER');
  } catch (err) {
    if (err instanceof TargetRoleError) {
      return { kind: 'FORBIDDEN_TARGET_ROLE' };
    }
    throw err;
  }

  // RLS: scope this provisioning tx to the target company so the OWNER Membership
  // INSERT satisfies tenant_isolation WITH CHECK when the app connects as axhy_app.
  // No-op under the superuser postgres connection.
  await tx.$executeRawUnsafe(
    `SELECT set_config('axhy.current_company_id', $1, true)`,
    input.body.companyId,
  );

  const company = await tx.company.findUnique({
    where: { id: input.body.companyId },
    select: { id: true, status: true },
  });
  if (!company) {
    return { kind: 'COMPANY_NOT_FOUND' };
  }
  if (company.status !== 'ACTIVE') {
    return { kind: 'COMPANY_NOT_ACTIVE', status: company.status };
  }

  let user = await tx.user.findFirst({
    where: { phone: input.body.phone, NOT: { phone: { startsWith: 'anon:' } } },
  });
  if (!user) {
    user = await tx.user.create({
      data: { phone: input.body.phone, locale: 'en' },
    });
  }

  try {
    const membership = await tx.membership.create({
      data: {
        companyId: input.body.companyId,
        userId: user.id,
        role: 'OWNER',
        baseSalaryPaise: input.body.baseSalaryPaise,
        bankIfsc: input.body.bankIfsc ?? null,
        bankAcct: input.body.bankAcct ?? null,
        status: 'ACTIVE',
      },
    });

    await recordAuditEvent(tx, {
      companyId: input.body.companyId,
      kind: 'MEMBERSHIP_CREATED',
      actorId: input.callerUserId,
      targetId: user.id,
      payload: {
        targetUserId: user.id,
        targetRole: 'OWNER',
        membershipId: membership.id,
        createdName: input.body.name,
        bootstrappedBy: 'SUPER_ADMIN',
      },
    });

    return {
      kind: 'OK',
      membershipId: membership.id,
      userId: user.id,
      companyId: input.body.companyId,
    };
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return { kind: 'ALREADY_EXISTS' };
    }
    throw err;
  }
}
