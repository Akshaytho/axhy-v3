/**
 * Policy write service — append a new Policy row + emit POLICY_CHANGED audit.
 *
 * Per docs/locked/operational-invariants.md INV 8 (Policy is append-only),
 * every "update" is a new row. The previous current value is captured in
 * `previousValueSnapshot` for audit-chain reconstruction.
 *
 * Per docs/locked/rule-hierarchy-three-layers.md Key-Namespace ACL +
 * docs/locked/security-gaps-to-fix.md GAP 2, every write is gated by
 * `assertPolicyKeyAllowedForRole(role, key)` BEFORE the insert.
 *
 * Must run inside withTenantContext — caller's responsibility — so:
 *   (a) Postgres GUC axhy.current_company_id is set for RLS
 *   (b) Company.status='ACTIVE' is enforced at the wrapper
 *
 * @derives(master-plan §G)
 * @derives(docs/locked/operational-invariants.md INV 8 — append-only Policy)
 * @derives(docs/locked/security-gaps-to-fix.md GAP 2 — key-namespace ACL)
 * @derives(plans/abstract-wandering-kazoo.md Phase 1)
 */

import type { Prisma } from '@prisma/client';
import type { PolicyCategory, Role } from '@axhy/shared-schema';

import { recordPolicyChanged } from './audit-event.js';
import { assertPolicyKeyAllowedForRole } from './policy-write-acl.js';

export type SetPolicyServiceInput = {
  companyId: string;
  key: string;
  value: unknown;
  category: PolicyCategory;
};

export type SetPolicyServiceCtx = {
  /** Role of the caller (for ACL). */
  role: Role;
  /** User.id of the caller (recorded as setBy + audit actor). */
  userId: string;
};

export type SetPolicyServiceResult = {
  policyId: string;
  setAt: Date;
  previousValueSnapshot: unknown;
};

/**
 * Append a new Policy row with the given key/value/category. Looks up the
 * current value (if any) for `previousValueSnapshot`, then inserts the new
 * row, then emits POLICY_CHANGED audit. All in the caller's tx.
 *
 * @throws PolicyKeyForbiddenError when `ctx.role` cannot write `input.key`
 *   per the ACL.
 */
export async function setPolicy(
  tx: Prisma.TransactionClient,
  input: SetPolicyServiceInput,
  ctx: SetPolicyServiceCtx,
): Promise<SetPolicyServiceResult> {
  assertPolicyKeyAllowedForRole(ctx.role, input.key);

  // Lookup current value for previousValueSnapshot — Policy is append-only,
  // so the "current" value is the most-recent row for (companyId, key).
  const previous = await tx.policy.findFirst({
    where: { companyId: input.companyId, key: input.key },
    orderBy: { setAt: 'desc' },
    select: { value: true },
  });
  const previousValueSnapshot = previous?.value ?? null;

  const created = await tx.policy.create({
    data: {
      companyId: input.companyId,
      key: input.key,
      value: input.value as Prisma.InputJsonValue,
      setBy: ctx.userId,
      previousValueSnapshot: previousValueSnapshot as Prisma.InputJsonValue,
      category: input.category,
    },
    select: { id: true, setAt: true },
  });

  await recordPolicyChanged(tx, {
    companyId: input.companyId,
    actorId: ctx.userId,
    policyId: created.id,
    payload: {
      key: input.key,
      category: input.category,
      value: input.value,
      previousValueSnapshot,
    },
  });

  // GAP 7 — Notify every active OWNER of this tenant when a Policy row
  // is written. Per docs/locked/security-gaps-to-fix.md GAP 7 the OWNER
  // is the "eyes on admin actions" backstop — an OWNER who never logs in
  // still needs to know when their admin / HR changes a rule.
  //
  // Skip the actor themself: if Mr. Reddy (OWNER) writes a rule, we don't
  // bother notifying him about his own write. This still notifies any
  // co-owners (multi-owner tenants per closure §4 are rare but legal).
  //
  // Notifications are emitted in the SAME tx as the Policy write, so a
  // rollback (e.g. ACL throw upstream) leaves no orphan notification.
  await emitOwnerNotificationsForPolicyChange(tx, {
    companyId: input.companyId,
    actorUserId: ctx.userId,
    policyId: created.id,
    key: input.key,
    category: input.category,
    value: input.value,
    previousValueSnapshot,
  });

  return {
    policyId: created.id,
    setAt: created.setAt,
    previousValueSnapshot,
  };
}

async function emitOwnerNotificationsForPolicyChange(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    actorUserId: string;
    policyId: string;
    key: string;
    category: PolicyCategory;
    value: unknown;
    previousValueSnapshot: unknown;
  },
): Promise<void> {
  const owners = await tx.membership.findMany({
    where: {
      companyId: input.companyId,
      role: 'OWNER',
      status: 'ACTIVE',
    },
    select: { userId: true },
  });
  if (owners.length === 0) return;
  await tx.notification.createMany({
    data: owners
      .filter((m) => m.userId !== input.actorUserId)
      .map((m) => ({
        companyId: input.companyId,
        audienceUserId: m.userId,
        kind: 'policy_changed',
        channel: 'in_app_banner',
        priority: 'STANDARD',
        payload: {
          policyId: input.policyId,
          key: input.key,
          category: input.category,
          actorUserId: input.actorUserId,
          newValue: input.value as Prisma.InputJsonValue,
          previousValueSnapshot: input.previousValueSnapshot as Prisma.InputJsonValue,
        } satisfies Prisma.InputJsonObject,
      })),
  });
}

/**
 * Read the current (most-recent) value for a key. Returns null when the
 * key has never been set OR when the most-recent row's value is null
 * (which per INV 8 is the "deleted" sentinel).
 */
export async function getCurrentPolicyValue(
  tx: Prisma.TransactionClient,
  input: { companyId: string; key: string },
): Promise<unknown> {
  const row = await tx.policy.findFirst({
    where: { companyId: input.companyId, key: input.key },
    orderBy: { setAt: 'desc' },
    select: { value: true },
  });
  return row?.value ?? null;
}
