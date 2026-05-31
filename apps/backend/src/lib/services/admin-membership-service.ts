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

import { randomUUID } from 'node:crypto';

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

  // User by phone — atomic INSERT ... ON CONFLICT DO UPDATE.
  // Prisma's tx.user.upsert is NOT atomic at SQL (SELECT-then-INSERT),
  // so it races under parallel load identically to the original findFirst+create.
  // Raw INSERT ... ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
  // RETURNING id is atomic at the Postgres level. The no-op SET is required
  // because ON CONFLICT DO NOTHING + RETURNING does not return existing rows.
  // Anonymised rows have phone 'anon:<uuid>' so they never collide with a
  // real E.164 phone lookup.
  const newId = randomUUID();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "axhy"."User" ("id", "phone", "locale", "status", "is_platform_admin", "createdAt", "updatedAt")
    VALUES (${newId}::uuid, ${input.body.phone}, 'en', 'ACTIVE', false, NOW(), NOW())
    ON CONFLICT ("phone") DO UPDATE SET "phone" = EXCLUDED."phone"
    RETURNING "id"
  `;
  const userId = rows[0].id;

  try {
    const membership = await tx.membership.create({
      data: {
        companyId: input.callerCompanyId,
        userId,
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
      targetId: userId,
      payload: {
        targetUserId: userId,
        targetRole: input.body.role,
        membershipId: membership.id,
        createdName: input.body.name,
      },
    });

    return {
      kind: 'OK',
      membershipId: membership.id,
      userId,
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
