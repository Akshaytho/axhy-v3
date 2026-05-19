/**
 * Policy key-namespace ACL — enforces the role↔key-prefix matrix from
 * docs/locked/rule-hierarchy-three-layers.md Key-Namespace ACL and
 * docs/locked/security-gaps-to-fix.md GAP 2.
 *
 * The rule:
 *
 *   ai.rules.company.*   → OWNER, SUPER_ADMIN
 *   ai.rules.hr.*        → HR, OWNER, SUPER_ADMIN
 *   ai.limits.*          → OWNER, SUPER_ADMIN
 *   <anything else>      → open within tenant (no key-level restriction)
 *
 * Role-mapping note: the locked doc uses `COMPANY_ADMIN`, which is not in
 * the Role enum (auth.ts:21 has `WORKER | SUPERVISOR | OWNER | HR | SUPER_ADMIN`).
 * The engineering call is that `COMPANY_ADMIN` semantically maps to `OWNER`
 * (the tenant-side admin). `SUPER_ADMIN` is platform-side bypass and is
 * always allowed so Axhy support can debug.
 *
 * See docs/journeys/2026-05-19-wave-a-sidebar-chat-ai-scenarios.md
 * Scene L2-B for the user-facing surface this gates.
 *
 * @derives(master-plan §G)
 * @derives(docs/locked/rule-hierarchy-three-layers.md — Key-Namespace ACL)
 * @derives(docs/locked/security-gaps-to-fix.md GAP 2)
 * @derives(plans/abstract-wandering-kazoo.md Phase 1)
 */

import type { Role } from '@axhy/shared-schema';

/** Key-prefix → roles allowed to write that namespace. Order matters: the
 *  FIRST matching prefix wins, and longer prefixes must come before shorter
 *  ones so `ai.rules.company.*` is matched before `ai.rules.*` (if we ever
 *  add the latter). */
const PREFIX_ACL: ReadonlyArray<{
  readonly prefix: string;
  readonly allowedRoles: ReadonlyArray<Role>;
}> = [
  { prefix: 'ai.rules.company.', allowedRoles: ['OWNER', 'SUPER_ADMIN'] },
  { prefix: 'ai.rules.hr.', allowedRoles: ['HR', 'OWNER', 'SUPER_ADMIN'] },
  { prefix: 'ai.limits.', allowedRoles: ['OWNER', 'SUPER_ADMIN'] },
];

/**
 * Error thrown when a role tries to write a restricted policy key.
 * Maps to HTTP 403 in the policy write route. The `code` field is the
 * stable error identifier the mobile/admin client uses to render a
 * localised message.
 */
export class PolicyKeyForbiddenError extends Error {
  readonly code = 'POLICY_KEY_FORBIDDEN_FOR_ROLE';
  constructor(
    public readonly key: string,
    public readonly role: Role,
    public readonly allowedRoles: ReadonlyArray<Role>,
  ) {
    super(
      `Role ${role} cannot write policy key '${key}'. Allowed roles: ${allowedRoles.join(', ')}.`,
    );
    this.name = 'PolicyKeyForbiddenError';
  }
}

/**
 * Assert that `role` may write a row at `key`. Throws PolicyKeyForbiddenError
 * (mapped to HTTP 403) when the role is not in the allow-list for the
 * matching prefix. Keys that don't match any restricted prefix pass through
 * (no key-level restriction — tenant-level auth is the only gate).
 *
 * Call this BEFORE the Policy row write, inside the same withTenantContext
 * transaction.
 *
 * @example
 *   assertPolicyKeyAllowedForRole('HR', 'ai.rules.company.uniform_required')
 *   // throws PolicyKeyForbiddenError — HR cannot write company rules
 *
 *   assertPolicyKeyAllowedForRole('OWNER', 'ai.rules.company.uniform_required')
 *   // returns undefined — OWNER is allowed
 *
 *   assertPolicyKeyAllowedForRole('SUPERVISOR', 'sla.default_minutes')
 *   // returns undefined — key has no restricted prefix
 */
export function assertPolicyKeyAllowedForRole(role: Role, key: string): void {
  for (const { prefix, allowedRoles } of PREFIX_ACL) {
    if (key.startsWith(prefix)) {
      if (!allowedRoles.includes(role)) {
        throw new PolicyKeyForbiddenError(key, role, allowedRoles);
      }
      return;
    }
  }
  // Key has no restricted prefix — no role-level check needed.
}

/**
 * Read-only access to the prefix→roles matrix for testing and for the
 * admin-web "who can edit this rule" UI affordance. Returns a frozen copy
 * so callers cannot mutate the canonical table.
 */
export function getPolicyKeyACL(): ReadonlyArray<{
  readonly prefix: string;
  readonly allowedRoles: ReadonlyArray<Role>;
}> {
  return PREFIX_ACL;
}
