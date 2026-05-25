/**
 * Role-gate primitives for admin/HR routes.
 *
 * Two gates per route:
 *   1. requireRole(...) — Fastify preHandler that 401s without JWT and
 *      403s if the caller's role isn't allowed to call this route at all.
 *   2. assertTargetRole(callerRole, targetRole) — pure function that
 *      checks (callerRole, targetRole) against HIRING_AUTHORITY.
 *
 * HIRING_AUTHORITY mirrors docs/locked/hiring-hierarchy.md.
 * The role-gates.test.ts parses the locked doc and asserts the const
 * matches byte-for-byte. Drift fails the build.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Role } from '@axhy/shared-schema';

/**
 * Who-creates-whom authority table. Mirrors docs/locked/hiring-hierarchy.md.
 *
 * - SUPER_ADMIN bootstraps tenants (creates OWNER).
 * - OWNER (the tenant owner) creates HR (and may create a co-owner).
 * - HR creates SUPERVISOR + WORKER.
 * - SUPERVISOR + WORKER create nobody.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */
export const HIRING_AUTHORITY = {
  SUPER_ADMIN: ['OWNER'],
  OWNER: ['HR', 'OWNER'],
  HR: ['SUPERVISOR', 'WORKER'],
  SUPERVISOR: [],
  WORKER: [],
} as const satisfies Record<Role, ReadonlyArray<Role>>;

/**
 * Thrown by assertTargetRole when the caller is not authorised to create
 * the requested target role. Route handlers catch and translate to
 * 403 FORBIDDEN_TARGET_ROLE.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */
export class TargetRoleError extends Error {
  constructor(
    public readonly callerRole: Role,
    public readonly targetRole: Role,
  ) {
    super(`Role ${callerRole} is not allowed to create members of role ${targetRole}`);
    this.name = 'TargetRoleError';
  }
}

/**
 * Pure function. Throws TargetRoleError if (callerRole, targetRole) is not
 * permitted by HIRING_AUTHORITY. Otherwise returns void.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */
export function assertTargetRole(callerRole: Role, targetRole: Role): void {
  const allowed = HIRING_AUTHORITY[callerRole] ?? [];
  if (!(allowed as ReadonlyArray<Role>).includes(targetRole)) {
    throw new TargetRoleError(callerRole, targetRole);
  }
}

/**
 * Fastify preHandler factory. Returns a hook that:
 *   - 401 AUTH_REQUIRED if no JWT on the request
 *   - 403 FORBIDDEN_WRONG_ROLE if the caller's role is not in allowedRoles
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */
export function requireRole(...allowedRoles: Role[]): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }
    if (!allowedRoles.includes(req.auth.role)) {
      reply.code(403).send({
        error: 'FORBIDDEN_WRONG_ROLE',
        message: `Role ${req.auth.role} is not permitted on this route. Required: ${allowedRoles.join(' or ')}`,
      });
      return;
    }
  };
}
