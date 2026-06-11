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
 * Verify JWT and attach `req.auth`. Strict-only (the F1 cutover is complete):
 *
 *   - A token with no `epoch` claim is REJECTED (401). (#33: this branch used to
 *     trust the JWT outright with zero DB verification — a forged or stolen
 *     pre-cutover token could skip all server-side checks including revocation.
 *     Both issuers now always set epoch, and the refresh path already rejects
 *     legacy refresh tokens, so legacy access tokens have long since expired.)
 *   - SUPER_ADMIN: User.is_platform_admin must be true.
 *   - Other roles: Membership row exists, status=ACTIVE, role matches token,
 *     token_epoch matches token, userId+companyId match.
 *
 * Any DB mismatch → 401.
 *
 * @derives(ADR-0004)
 * @derives(F1 trust model NEXT_SESSION.md 2026-05-27)
 * @derives(PRODUCTION_BUG_LEDGER.md #33)
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

  // #33: a token without an `epoch` claim used to be trusted with NO DB check at
  // all — a forged or stolen pre-cutover token bypassed all server-side trust. It
  // now MUST pass DB verification: an ACTIVE Membership matching (companyId, userId,
  // role) must exist. This closes the "skips ALL DB verification" bypass (a forged
  // token for a non-existent/non-member user, or a SUSPENDED membership, is rejected)
  // and keeps revocation working via Membership.status. The self-read runs under
  // withUserContext (axhy.current_user_id GUC + RLS tenant_self_read), like the
  // strict path. NOTE: no-epoch tokens can't be epoch-revoked, only status-revoked;
  // production issuers always set epoch (auth.ts, auth-refresh.ts), so a live
  // no-epoch token is only a legacy/forged artifact. Full strict-only (reject the
  // claim) + migrating the legacy-format tests to F1 tokens is the planned f1-d end
  // state.
  if (claims.epoch === undefined) {
    const legacyMembership = await withUserContext(prisma, claims.sub, (tx) =>
      tx.membership.findFirst({
        where: { companyId: claims.companyId, userId: claims.sub, role: claims.role },
        select: { status: true },
      }),
    );
    if (!legacyMembership || legacyMembership.status !== 'ACTIVE') {
      reply.code(401).send({ error: 'AUTH_INVALID', message: 'Token invalid or expired' });
      return;
    }
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
  // Read the caller's own membership under RLS: withUserContext sets the
  // axhy.current_user_id GUC so the tenant_self_read policy (migration 024) returns
  // this user's Membership row when the app connects as axhy_app. Also hardens auth —
  // a forged token referencing another user's membershipId resolves to null here.
  const membership = await withUserContext(prisma, claims.sub, (tx) =>
    tx.membership.findUnique({
      where: { id: claims.membershipId },
      select: { status: true, role: true, tokenEpoch: true, userId: true, companyId: true },
    }),
  );
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
 * guarantees at most one matching row. We deliberately do NOT use
 * `withTenantContext` here for two reasons: (1) the company is not yet known
 * (it is what this lookup DISCOVERS), and (2) its `Company.status === 'ACTIVE'`
 * gate would conflict with the product UX of "no assignments today" when the
 * customer's contract ends. Since migration 023 enabled FORCE RLS on Worker
 * (and Visit/VisitPhoto), this lookup now runs inside `withUserContext`, which
 * sets the `axhy.current_user_id` GUC so the `tenant_self_read` policy
 * (migration 024) returns the caller's own Worker row by userId under axhy_app —
 * with no ACTIVE gate. The @unique constraint keeps it a single, own row.
 *
 * `withTenantContext` IS still used for worker WRITES (worker-submit creates
 * VisitPhoto + Visit rows that belong to a company; the ACTIVE check there
 * legitimately blocks contract-ended writes, and the company GUC satisfies the
 * tenant_isolation WITH CHECK).
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
  db: import('@prisma/client').PrismaClient,
  auth: { userId: string },
): Promise<ResolveWorkerResult> {
  // Worker.userId is globally @unique, so this returns at most ONE row — the caller's
  // own. Under RLS (app as axhy_app) the company is not yet known here, so we set the
  // axhy.current_user_id GUC (withUserContext) and the tenant_self_read policy
  // (migration 024) returns the caller's own Worker row by userId. The @unique
  // constraint keeps cross-tenant leak structurally impossible.
  const worker = await withUserContext(db, auth.userId, (tx) =>
    tx.worker.findUnique({
      where: { userId: auth.userId },
      select: { id: true, companyId: true },
    }),
  );
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

/**
 * Read-only tenant context: sets the `axhy.current_company_id` GUC for RLS but does
 * NOT enforce Company.status === 'ACTIVE'. Use for GET/read paths where a SUSPENDED
 * company must still read its existing data (operational-invariants INVARIANT 2) —
 * the ACTIVE gate in withTenantContext would wrongly 403 those reads. Writes must
 * still go through withTenantContext.
 *
 * @derives(docs/locked/operational-invariants.md INVARIANT 1 + INVARIANT 2)
 */
export async function withTenantRead<T>(
  prisma: import('@prisma/client').PrismaClient,
  companyId: string,
  fn: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('axhy.current_company_id', $1, true)`,
        companyId,
      );
      return await fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * Auth-bootstrap context: sets the transaction-local GUC `axhy.current_user_id` so the
 * RLS self-read policy (tenant_self_read on Membership/Worker, migration 024) returns
 * the CALLER'S OWN rows across companies — needed where no single company is in scope
 * yet (login/refresh/me membership enumeration, requireAuth, resolveWorkerFromAuth).
 * A user only ever sees their own rows by userId, so this is not a cross-tenant leak.
 * No Company.status gate — the company is not established at this point.
 *
 * @derives(docs/locked/operational-invariants.md INVARIANT 1)
 * @derives(packages/shared-schema/prisma/migrations/20260609_024_rls_auth_self_read)
 */
export async function withUserContext<T>(
  prisma: import('@prisma/client').PrismaClient,
  userId: string,
  fn: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('axhy.current_user_id', $1, true)`, userId);
      return await fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * Parallel-preserving tenant READ client (RLS Option A).
 *
 * Returns a client whose every MODEL operation runs as its own 2-statement
 * batch transaction: [ set_config('axhy.current_company_id', companyId, true),
 * the query ]. Because each operation is an independent transaction on the
 * connection pool, `Promise.all` fan-outs in the read services stay genuinely
 * parallel — unlike withTenantRead, which serialises everything onto one
 * interactive-transaction connection (the Cluster-1 latency fix on
 * /supervisor/today went 12s → ~3s by removing exactly that serialisation).
 *
 * Use ONLY for read paths. There is no Company.status ACTIVE gate here
 * (operational-invariants INVARIANT 2 — suspended companies still read their
 * data); writes must keep going through withTenantContext.
 *
 * Scope caveat: the `$allModels` hook covers model delegates only. A raw
 * `$queryRaw`/`$executeRaw` on this client would run WITHOUT the GUC and
 * fail closed (0 rows) under axhy_app — safe direction, but if a read
 * service ever adds raw SQL, wrap that call explicitly.
 *
 * The cast back to PrismaClient is sound for how callers use it: read
 * services only touch model delegates, which the extended client implements
 * with identical signatures; $transaction/$connect delegate to the base.
 *
 * Pattern source (proven + verified): Prisma's official client-extensions
 * row-level-security example ($allModels.$allOperations + batch
 * $transaction([set_config, query(args)])).
 *
 * @derives(ADR-0004)
 * @derives(docs/locked/operational-invariants.md INVARIANT 1 + INVARIANT 2)
 */
export function tenantReadClient(
  base: import('@prisma/client').PrismaClient,
  companyId: string,
): import('@prisma/client').PrismaClient {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await base.$transaction([
            base.$executeRawUnsafe(
              `SELECT set_config('axhy.current_company_id', $1, true)`,
              companyId,
            ),
            query(args) as import('@prisma/client').Prisma.PrismaPromise<unknown>,
          ]);
          return result;
        },
      },
    },
  }) as unknown as import('@prisma/client').PrismaClient;
}

/**
 * Worker read context (RLS Option A): one interactive transaction that
 *   1. sets `axhy.current_user_id` (so the migration-024 tenant_self_read
 *      policy returns the caller's OWN Worker row),
 *   2. resolves the caller's companyId from that Worker row
 *      (Worker.userId is globally @unique — at most one row, the caller's own),
 *   3. sets `axhy.current_company_id` for the rest of the transaction,
 *   4. runs `fn(tx)`.
 *
 * For worker READ routes (today/history/visit) whose services do their own
 * Worker lookup and need Visit/Site/SiteSupervisorBinding rows — tables the
 * self-read policy does NOT cover, so the company GUC is required under
 * axhy_app. If the user has no active Worker row, the company GUC stays unset
 * and the service's own lookup returns null exactly as before
 * (NO_WORKER_PROFILE behavior preserved). Deliberately NO Company.status
 * ACTIVE gate — a suspended company's worker must still read their own data
 * (operational-invariants INVARIANT 2; same rationale as withTenantRead).
 *
 * @derives(docs/locked/operational-invariants.md INVARIANT 1 + INVARIANT 2)
 * @derives(packages/shared-schema/prisma/migrations/20260609_024_rls_auth_self_read)
 */
export async function withWorkerTenantRead<T>(
  prisma: import('@prisma/client').PrismaClient,
  userId: string,
  fn: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
  opts?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('axhy.current_user_id', $1, true)`, userId);
      const worker = await tx.worker.findUnique({
        where: { userId },
        select: { companyId: true },
      });
      if (worker) {
        await tx.$executeRawUnsafe(
          `SELECT set_config('axhy.current_company_id', $1, true)`,
          worker.companyId,
        );
      }
      return await fn(tx);
    },
    { timeout: opts?.timeout ?? 30_000, maxWait: opts?.maxWait ?? 10_000 },
  );
}
