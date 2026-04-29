/**
 * apps/backend/src/middleware/tenant-context.ts
 *
 * Sets the `axhy.current_company_id` Postgres GUC for the duration of every
 * authenticated request. Postgres RLS policies on `axhy_graph.tenant_chunks`
 * and `axhy_audit.events` filter on this GUC.
 *
 * Contract:
 *   - Inbound: Fastify request with verified JWT containing `companyId`
 *   - Behavior: opens a Prisma transaction, sets the GUC, runs handler, commits
 *   - Outbound: GUC is reset on transaction end (transaction-scoped)
 *
 * Without this middleware, `current_setting('axhy.current_company_id', true)`
 * returns NULL inside RLS policies, and every protected query returns 0 rows.
 *
 * @derives(ADR-0004) — Backend stack
 * @derives(master-plan §E) — Multi-tenant invariants
 */

export const MIDDLEWARE_NAME = 'tenant-context' as const;

/**
 * Set the per-tenant Postgres GUC for the current connection.
 * Implementation lands during build phase 1, week 2 (auth + JWT verify).
 *
 * Usage sketch:
 *   await prisma.$transaction(async (tx) => {
 *     await tx.$executeRawUnsafe(
 *       `SET LOCAL axhy.current_company_id = '${companyId}'`
 *     );
 *     return handler(tx);
 *   });
 */
export type TenantContext = {
  companyId: string;
  userId: string;
  role: 'WORKER' | 'SUPERVISOR' | 'OWNER' | 'HR' | 'SUPER_ADMIN';
  availableRoles: ReadonlyArray<TenantContext['role']>;
};
