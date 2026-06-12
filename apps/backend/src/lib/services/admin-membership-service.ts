/**
 * Service for POST /admin/memberships (R1).
 *
 * Upserts User by phone (or reuses existing) + creates Membership with the
 * target role. Enforces the locked hiring authority via assertTargetRole.
 *
 * @derives(ADR-0026)
 * @derives(ADR-0025)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { Prisma } from '@prisma/client';
import type { Role } from '@axhy/shared-schema';

import { TargetRoleError, assertTargetRole } from '../../middleware/role-gates.js';
import { recordAuditEvent } from '../audit-event.js';

/** @derives(ADR-0026) */
export type AdminCreateMembershipServiceInput = {
  callerRole: Role;
  callerCompanyId: string;
  callerUserId: string;
  body: {
    phone: string;
    name: string;
    role: 'HR' | 'SUPERVISOR';
    baseSalaryPaise: number;
    bankIfsc?: string;
    bankAcct?: string;
    podId?: string;
  };
};

/** @derives(ADR-0026) */
export type AdminCreateMembershipServiceOutput =
  | { kind: 'OK'; membershipId: string; userId: string; role: 'HR' | 'SUPERVISOR' }
  | { kind: 'FORBIDDEN_TARGET_ROLE'; callerRole: Role; targetRole: Role }
  | { kind: 'ALREADY_EXISTS' };

/** @derives(ADR-0026) */
export async function adminCreateMembershipService(
  tx: Prisma.TransactionClient,
  input: AdminCreateMembershipServiceInput,
): Promise<AdminCreateMembershipServiceOutput> {
  try {
    assertTargetRole(input.callerRole, input.body.role);
  } catch (err) {
    if (err instanceof TargetRoleError) {
      return {
        kind: 'FORBIDDEN_TARGET_ROLE',
        callerRole: err.callerRole,
        targetRole: err.targetRole,
      };
    }
    throw err;
  }

  // Upsert User by phone — exclude anonymised rows (auth.ts:87 pattern).
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
        companyId: input.callerCompanyId,
        userId: user.id,
        role: input.body.role,
        baseSalaryPaise: input.body.baseSalaryPaise,
        bankIfsc: input.body.bankIfsc ?? null,
        bankAcct: input.body.bankAcct ?? null,
        podId: input.body.role === 'HR' ? (input.body.podId ?? null) : null,
        status: 'ACTIVE',
      },
    });

    await recordAuditEvent(tx, {
      companyId: input.callerCompanyId,
      kind: 'MEMBERSHIP_CREATED',
      actorId: input.callerUserId,
      targetId: user.id,
      payload: {
        targetUserId: user.id,
        targetRole: input.body.role,
        membershipId: membership.id,
        createdName: input.body.name,
      },
    });

    // GAP 7 (docs/locked/security-gaps-to-fix.md:59-63) — notify every
    // ACTIVE OWNER when an admin adds an HR/SUPERVISOR membership, in the
    // SAME tx as the create (rollback leaves no orphan rows). Mirrors the
    // policy-write emission in policy-service.ts:124-164, including the
    // actor-skip: an owner adding someone is not notified about themself.
    const owners = await tx.membership.findMany({
      where: { companyId: input.callerCompanyId, role: 'OWNER', status: 'ACTIVE' },
      select: { userId: true },
    });
    if (owners.length > 0) {
      await tx.notification.createMany({
        data: owners
          .filter((m) => m.userId !== input.callerUserId)
          .map((m) => ({
            companyId: input.callerCompanyId,
            audienceUserId: m.userId,
            kind: 'membership_created',
            channel: 'in_app_banner',
            priority: 'STANDARD',
            payload: {
              membershipId: membership.id,
              targetUserId: user.id,
              targetRole: input.body.role,
              createdName: input.body.name,
              actorUserId: input.callerUserId,
            },
          })),
      });
    }

    return {
      kind: 'OK',
      membershipId: membership.id,
      userId: user.id,
      role: input.body.role,
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
