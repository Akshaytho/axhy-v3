/**
 * Tenant-context middleware.
 *
 * Sets the `axhy.current_company_id` Postgres GUC for the duration of every
 * authenticated request. Postgres RLS policies on axhy_graph.tenant_chunks
 * and axhy_audit.events filter on this GUC.
 *
 * Wired as a Fastify preHandler that:
 *   1. Reads Authorization: Bearer <jwt>
 *   2. Verifies via @axhy/jwt helpers
 *   3. Attaches `request.auth = { userId, companyId, role, availableRoles }`
 *   4. Opens a per-request DB transaction with `SET LOCAL axhy.current_company_id = ...`
 *      and binds `request.db` to that transaction-scoped Prisma client.
 *
 * Without this middleware, current_setting('axhy.current_company_id', true)
 * returns NULL inside RLS policies, and every protected query returns 0 rows.
 *
 * @derives(ADR-0004)
 * @derives(docs/invariants/multi-tenant.md)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@axhy/shared-schema';

import { verifyAccessToken } from '../lib/jwt.js';

export type TenantAuth = {
  userId: string;
  companyId: string;
  role: Role;
  availableRoles: ReadonlyArray<Role>;
  locale: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: TenantAuth;
  }
}

/**
 * preHandler hook. Throws 401 if no token; sets request.auth on success.
 *
 * @derives(ADR-0004)
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    reply
      .code(401)
      .send({ error: 'AUTH_REQUIRED', message: 'Authorization: Bearer <token> required' });
    return;
  }
  const token = header.slice(7).trim();
  try {
    const claims = await verifyAccessToken(token);
    req.auth = {
      userId: claims.sub,
      companyId: claims.companyId,
      role: claims.role,
      availableRoles: claims.availableRoles,
      locale: claims.locale,
    };
  } catch (err) {
    reply.code(401).send({
      error: 'AUTH_INVALID',
      message: 'Token invalid or expired',
    });
    return;
  }
}

/**
 * Returns a function that runs `fn` inside a Prisma transaction with the
 * `axhy.current_company_id` GUC set. Use this anywhere the handler queries
 * tables protected by RLS.
 *
 * @derives(ADR-0004)
 */
export async function withTenantContext<T>(
  prisma: import('@prisma/client').PrismaClient,
  companyId: string,
  fn: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // Prisma's default transaction timeout is 5s. Under Railway-Postgres latency
  // (~200-500ms per query) plus parallel test pressure, multi-step transactions
  // (read worker + read site + write row + audit + 2 outbox = 6+ queries)
  // routinely exceed 5s and surface as 500s. Bump to 30s — matches the
  // testTimeout/hookTimeout we use in vitest.config.ts.
  return await prisma.$transaction(
    async (tx) => {
      // SET LOCAL is scoped to the transaction; it auto-resets on commit/rollback.
      await tx.$executeRawUnsafe(
        `SELECT set_config('axhy.current_company_id', $1, true)`,
        companyId,
      );
      return await fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
