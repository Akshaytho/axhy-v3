/**
 * /admin/workers/* routes. [ORCHESTRATOR_EXCEPTION] Task 5 single-file edit.
 *
 * - GET  /admin/workers              (Task 5) — HR/OWNER list workers (HR pod-scoped)
 * - GET  /admin/workers/:id          (Task 5) — HR/OWNER detail (404 on out-of-scope)
 * - POST /admin/workers              (R2) — HR creates Worker (PENDING_ACTIVATION)
 * - POST /admin/workers/:id/anonymize (R3) — HR resigns Worker
 *
 * @derives(ADR-0026)
 * @derives(ADR-0025)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdminCreateWorkerInput, AdminAnonymizeWorkerInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getMyPodIds } from '../middleware/pod-scope.js';
import { adminCreateWorkerService } from '../lib/services/admin-worker-service.js';
import { anonymizeWorkerService } from '../lib/services/anonymize-worker-service.js';

// ─── Cursor encoding ─────────────────────────────────────────────────────────
//
// Opaque to the client. Encodes "<ISO createdAt>:<uuid id>". Mirrors the
// pattern in routes/complaints.ts lines 70-86. Once a third call site
// appears, extract to lib/cursor.ts per Task 5 of the HR A1 plan.
//
// @derives(ADR-0026)

function encodeCursor(input: { createdAt: Date; id: string }): string {
  return Buffer.from(`${input.createdAt.toISOString()}:${input.id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf(':');
    if (sep < 0) return null;
    const iso = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    if (!id) return null;
    return { createdAt: dt, id };
  } catch {
    return null;
  }
}

const ListQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** @derives(ADR-0026) [ORCHESTRATOR_EXCEPTION] Task 5 single-file handler addition. */
export async function registerAdminWorkerRoutes(app: FastifyInstance): Promise<void> {
  // Task 5 — GET /admin/workers (HR pod-scoped, OWNER tenant-wide).
  app.get(
    '/admin/workers',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsedQuery = ListQuery.safeParse(req.query);
      if (!parsedQuery.success) {
        reply.code(400).send({ error: 'QUERY_INVALID' });
        return;
      }
      const { cursor: rawCursor, limit } = parsedQuery.data;
      const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);
      if (rawCursor !== undefined && cursor === null) {
        reply.code(400).send({ error: 'CURSOR_INVALID' });
        return;
      }

      // Schema reality: no User.anonymizedAt or Membership.anonymizedAt column
      // exists. The R3 anonymize service (lib/services/anonymize-worker-service.ts)
      // sets Worker.state=TERMINATED + Worker.userId=null + User.phone prefix
      // "anon:". We expose anonymizedPhone:boolean derived from that prefix so
      // the HR portal can render a "Resigned" badge.
      const where: NonNullable<Parameters<typeof prisma.membership.findMany>[0]>['where'] = {
        companyId: auth.companyId,
        role: 'WORKER',
      };
      if (auth.role === 'HR') {
        const myPodIds = await getMyPodIds(prisma, auth.userId, auth.companyId);
        where.podId = { in: myPodIds };
      }
      if (cursor) {
        where.OR = [
          { createdAt: { lt: cursor.createdAt } },
          { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
        ];
      }

      // [ORCHESTRATOR_EXCEPTION] worker-identity contract — expose Worker.id not User.id; skip memberships without Worker row
      const rows = await prisma.membership.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          userId: true,
          status: true,
          podId: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              phone: true,
              workerProfile: { select: { id: true } },
            },
          },
        },
      });
      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      // Worker-identity contract (parent-brief 2026-05-29): every workerId
      // exposed by the HR portal MUST be Worker.id, never User.id.
      // Memberships whose User has no Worker row (e.g. lingering INVITED-
      // only stubs or partial seeds) are dropped — they cannot be acted on
      // by R3 anonymize or referenced by LeaveRequest.workerId.
      const items = sliced
        .filter((m) => m.user?.workerProfile != null)
        .map((m) => {
          const phone = m.user?.phone ?? null;
          const anonymizedPhone = phone !== null && phone.startsWith('anon:');
          return {
            workerId: m.user!.workerProfile!.id,
            userId: m.userId,
            membershipId: m.id,
            status: m.status,
            podId: m.podId,
            name: m.user?.name ?? null,
            phone,
            anonymizedPhone,
            createdAt: m.createdAt.toISOString(),
          };
        });
      const lastRow = sliced.at(-1);
      const nextCursor =
        hasMore && lastRow ? encodeCursor({ createdAt: lastRow.createdAt, id: lastRow.id }) : null;
      reply.send({ items, nextCursor });
    },
  );

  // [ORCHESTRATOR_EXCEPTION] worker-identity contract — :id is Worker.id, query starts from prisma.worker
  // Task 5 — GET /admin/workers/:id. `:id` MUST be Worker.id (matches the
  // R3 anonymize POST contract at lib/services/anonymize-worker-service.ts).
  // 404 on cross-tenant, on workers with no Membership (orphan), or on out-
  // of-scope HR — never leak existence.
  // @derives(parent-brief 2026-05-29)
  app.get<{ Params: { id: string } }>(
    '/admin/workers/:id',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const worker = await prisma.worker.findFirst({
        where: { id: req.params.id, companyId: auth.companyId },
        select: {
          id: true,
          userId: true,
          name: true,
          phone: true,
          state: true,
          user: {
            select: {
              memberships: {
                where: { companyId: auth.companyId, role: 'WORKER' },
                select: { id: true, status: true, podId: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });
      if (!worker) {
        reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
        return;
      }
      const membership = worker.user?.memberships?.[0] ?? null;
      // Anonymized workers have userId=null and therefore no membership join;
      // they remain visible to OWNER for audit but HR cannot scope without
      // a pod (404 below). The R3 service preserves Worker.id; this handler
      // returns the row but masks the missing membership fields.
      if (auth.role === 'HR') {
        if (!membership?.podId) {
          reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
          return;
        }
        const myPodIds = await getMyPodIds(prisma, auth.userId, auth.companyId);
        if (!myPodIds.includes(membership.podId)) {
          reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
          return;
        }
      }
      const anonymizedPhone = worker.phone.startsWith('anon:');
      reply.send({
        workerId: worker.id,
        userId: worker.userId,
        membershipId: membership?.id ?? null,
        status: membership?.status ?? null,
        podId: membership?.podId ?? null,
        state: worker.state,
        name: worker.name,
        phone: worker.phone,
        anonymizedPhone,
        createdAt: (membership?.createdAt ?? new Date(0)).toISOString(),
      });
    },
  );

  app.post(
    '/admin/workers',
    { preHandler: [requireAuth, requireRole('HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateWorkerInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateWorkerService(tx, {
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );
      if (out.kind === 'ALREADY_EXISTS') {
        reply.code(409).send({
          error: 'WORKER_ALREADY_EXISTS',
          message: 'A worker with this phone already exists in this company',
        });
        return;
      }
      reply.send({
        workerId: out.workerId,
        userId: out.userId,
        membershipId: out.membershipId,
        state: 'PENDING_ACTIVATION',
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/workers/:id/anonymize',
    { preHandler: [requireAuth, requireRole('HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminAnonymizeWorkerInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        anonymizeWorkerService(tx, {
          workerId: req.params.id,
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          reason: parsed.data.reason,
          effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : undefined,
        }),
      );
      if (out.kind === 'WORKER_NOT_FOUND') {
        reply.code(404).send({
          error: 'WORKER_NOT_FOUND',
          message: 'Worker not found in this company',
        });
        return;
      }
      if (out.kind === 'WORKER_ALREADY_TERMINATED') {
        reply.code(409).send({
          error: 'WORKER_ALREADY_TERMINATED',
          message: 'Worker is already terminated or archived',
        });
        return;
      }
      if (out.kind === 'WORKER_NOT_PENDING_TERMINATION') {
        reply.code(409).send({
          error: 'WORKER_NOT_PENDING_TERMINATION',
          message: 'Worker must have a pending termination before HR can finalize/anonymize it',
        });
        return;
      }
      reply.send({
        workerId: out.workerId,
        anonymizedAt: out.anonymizedAt.toISOString(),
      });
    },
  );
}
