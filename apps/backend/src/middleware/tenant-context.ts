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
import { RoleSchema, type Role } from '@axhy/shared-schema';

import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

const HTTP_FORBIDDEN = 403;

export type TenantAuth = {
  userId: string;
  companyId: string;
  role: Role;
  availableRoles: ReadonlyArray<Role>;
  locale: string;
  /** F1 trust model — present when token carries F1 claims. */
  membershipId?: string;
  /** F1 — true after SUPER_ADMIN trust verified against User.is_platform_admin. */
  isPlatformAdmin?: boolean;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: TenantAuth;
  }
}

/**
 * Verify JWT and attach `req.auth`. Dual-mode during the 30-day F1 cutover:
 *
 *   - Legacy mode (no `epoch` claim): trust the JWT outright (pre-2026-05-27).
 *   - Strict mode (`epoch` present):
 *       * SUPER_ADMIN: User.is_platform_admin must be true.
 *       * Other roles: Membership row exists, status=ACTIVE, role matches
 *         token, token_epoch matches token, userId+companyId match.
 *
 * Any DB mismatch → 401. Flip to strict-only at the f1-d slice.
 *
 * @derives(ADR-0004)
 * @derives(F1 trust model NEXT_SESSION.md 2026-05-27)
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
  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    reply.code(401).send({ error: 'AUTH_INVALID', message: 'Token invalid or expired' });
    return;
  }

  // Legacy mode — no DB check; preserve pre-cutover behavior.
  if (claims.epoch === undefined) {
    req.auth = {
      userId: claims.sub,
      companyId: claims.companyId,
      role: claims.role,
      availableRoles: claims.availableRoles,
      locale: claims.locale,
    };
    return;
  }

  // Strict mode — DB verification.
  if (claims.role === RoleSchema.enum.SUPER_ADMIN) {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { is_platform_admin: true },
    });
    if (!user?.is_platform_admin) {
      reply.code(401).send({ error: 'AUTH_INVALID', message: 'Platform admin trust failed' });
      return;
    }
    req.auth = {
      userId: claims.sub,
      companyId: claims.companyId,
      role: claims.role,
      availableRoles: claims.availableRoles,
      locale: claims.locale,
      isPlatformAdmin: true,
    };
    return;
  }

  if (!claims.membershipId) {
    reply.code(401).send({ error: 'AUTH_INVALID', message: 'Membership id missing' });
    return;
  }
  const membership = await prisma.membership.findUnique({
    where: { id: claims.membershipId },
    select: { status: true, role: true, tokenEpoch: true, userId: true, companyId: true },
  });
  if (
    !membership ||
    membership.status !== 'ACTIVE' ||
    membership.role !== claims.role ||
    membership.tokenEpoch !== claims.epoch ||
    membership.userId !== claims.sub ||
    membership.companyId !== claims.companyId
  ) {
    reply.code(401).send({ error: 'AUTH_INVALID', message: 'Membership trust failed' });
    return;
  }
  req.auth = {
    userId: claims.sub,
    companyId: claims.companyId,
    role: claims.role,
    availableRoles: claims.availableRoles,
    locale: claims.locale,
    membershipId: claims.membershipId,
  };
}

/**
 * preHandler hook. Throws 401 if no token; 403 if caller is not WORKER.
 *
 * @derives(ADR-0004)
 */
export async function requireWorkerRole(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await requireAuth(req, reply);
  } catch (err) {
    reply.code(500).send({ error: 'AUTH_FAILED', message: 'Authentication error.' });
    return;
  }
  if (reply.sent) return;
  const auth = req.auth;
  if (!auth || auth.role !== RoleSchema.enum.WORKER) {
    reply
      .code(HTTP_FORBIDDEN)
      .send({ error: 'WRONG_ROLE', message: 'Only worker accounts can access this endpoint.' });
  }
}

/**
 * Resolve the active Worker for an authenticated request.
 *
 * Worker.userId is `String? @unique` at the column level (verified in
 * schema.prisma:188), so a `findUnique({ where: { userId } })` lookup
 * returns at most ONE Worker row globally. The returned row's companyId
 * is the authoritative tenant context for the request — every subsequent
 * read/write in the handler MUST filter by THAT derived companyId, not by
 * auth.companyId from the JWT (which can be stale during company switches).
 *
 * ## Anonymization model (founder direction 2026-05-25)
 *
 * When a worker leaves a company, the Worker row is anonymized: PII columns
 * are scrubbed and `userId` is set to null. The User is then free to attach
 * to a new Worker row in their next employing company. So a User without an
 * active employment has ZERO matching rows; a User with an active employment
 * has EXACTLY ONE row, in the current company. There is never an "active in
 * two companies simultaneously" state.
 *
 * ## Tenant safety guarantee
 *
 * Cross-tenant leak is structurally impossible because the @unique constraint
 * guarantees at most one matching row. This pattern SUPERSEDES the need for
 * `withTenantContext` on worker READS — Worker / Visit / VisitPhoto tables
 * do not have RLS enabled today (only `axhy_chat.turn_embeddings` does, per
 * migration 20260527_017), so `withTenantContext` would add only a
 * `Company.status === 'ACTIVE'` check that conflicts with the product UX
 * of "no assignments today" when the customer's contract ends.
 *
 * `withTenantContext` IS still used for worker WRITES (worker-submit creates
 * VisitPhoto + Visit rows that belong to a company; the ACTIVE check there
 * legitimately blocks contract-ended writes).
 *
 * ## Audit recognition
 *
 * `session-audit.ts` Phase 4 recognizes calls to `resolveWorkerFromAuth(...)`
 * inside worker route handlers as a tenant-safe pattern and does NOT flag
 * the surrounding `prisma.*.findMany / findUnique` calls as "raw prisma
 * outside transaction." Adding a new worker route that bypasses this helper
 * will still trip the audit.
 *
 * @derives(schema.prisma:188 Worker.userId @unique)
 * @derives(2026-05-25 founder direction on cluster B — anonymization model)
 * @derives(ENTERPRISE_PRODUCTION_STANDARD.md E2 — tenant ownership)
 */
export type ResolveWorkerResult =
  | { kind: 'OK'; workerId: string; companyId: string }
  | { kind: 'NO_WORKER' };

export async function resolveWorkerFromAuth(
  db: import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient,
  auth: { userId: string },
): Promise<ResolveWorkerResult> {
  const worker = await db.worker.findUnique({
    where: { userId: auth.userId },
    select: { id: true, companyId: true },
  });
  if (!worker) return { kind: 'NO_WORKER' };
  return { kind: 'OK', workerId: worker.id, companyId: worker.companyId };
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

      // security-gaps-to-fix.md Gap 1: reject requests for SUSPENDED companies.
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { status: true },
      });
      if (!company || company.status !== 'ACTIVE') {
        throw Object.assign(new Error('Company is not ACTIVE'), { statusCode: 403 });
      }

      return await fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
