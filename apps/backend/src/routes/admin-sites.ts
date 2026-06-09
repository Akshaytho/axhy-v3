/**
 * /admin/sites/* routes (R4 + R5 + Task 6 reads). [ORCHESTRATOR_EXCEPTION] Task 6 single-file edit.
 *
 * - GET  /admin/sites                (Task 6) — OWNER/HR list sites (tenant-scoped)
 * - GET  /admin/sites/:id            (Task 6) — OWNER/HR site detail (404 cross-tenant)
 * - GET  /admin/sites/:id/bindings   (Task 6) — OWNER/HR bindings list (404 cross-tenant)
 * - POST /admin/sites                (R4) — OWNER or HR creates Site
 * - POST /admin/sites/:id/bindings   (R5) — OWNER or HR binds Supervisor to Site
 *
 * @derives(ADR-0026)
 * @derives(ADR-0003)
 * @derives(docs/locked/hiring-hierarchy.md)
 * @derives(docs/plans/2026-05-29-hr-a1-implementation.md Task 6)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdminCreateSiteInput, AdminCreateBindingInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import {
  adminCreateSiteService,
  adminCreateBindingService,
  adminAssignSiteHrService,
} from '../lib/services/admin-site-service.js';

// ─── Cursor encoding ─────────────────────────────────────────────────────────
//
// Opaque to the client. Encodes "<ISO createdAt>:<uuid id>". Mirrors the
// pattern in routes/admin-workers.ts lines 33-51 and routes/complaints.ts
// lines 70-86. Plan note: now 3rd call site; future refactor may extract
// to lib/cursor.ts but doing so changes 3 existing files — out of A1 scope.
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
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

/** @derives(ADR-0026) [ORCHESTRATOR_EXCEPTION] Task 6 single-file handler additions. */
export async function registerAdminSiteRoutes(app: FastifyInstance): Promise<void> {
  // Task 6 — GET /admin/sites. Tenant-scoped (no pod filter per spec §2);
  // both OWNER and HR can read. Cursor pagination matches admin-workers
  // and admin-memberships pattern.
  app.get(
    '/admin/sites',
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

      const where: NonNullable<Parameters<typeof prisma.site.findMany>[0]>['where'] = {
        companyId: auth.companyId,
      };
      if (cursor) {
        where.OR = [
          { createdAt: { lt: cursor.createdAt } },
          { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
        ];
      }

      const rows = await withTenantRead(prisma, auth.companyId, (tx) =>
        tx.site.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: {
            id: true,
            name: true,
            state: true,
            address: true,
            latitude: true,
            longitude: true,
            workdays: true,
            createdAt: true,
          },
        }),
      );
      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const items = sliced.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        address: s.address,
        latitude: s.latitude !== null ? s.latitude.toString() : null,
        longitude: s.longitude !== null ? s.longitude.toString() : null,
        workdays: s.workdays,
        createdAt: s.createdAt.toISOString(),
      }));
      const lastRow = sliced.at(-1);
      const nextCursor =
        hasMore && lastRow ? encodeCursor({ createdAt: lastRow.createdAt, id: lastRow.id }) : null;
      reply.send({ items, nextCursor });
    },
  );

  // Task 6 — GET /admin/sites/:id. Tenant-scoped detail; 404 cross-tenant
  // (no existence leak). OWNER and HR same scope per spec §2.
  app.get<{ Params: { id: string } }>(
    '/admin/sites/:id',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const site = await withTenantRead(prisma, auth.companyId, (tx) =>
        tx.site.findFirst({
          where: { id: req.params.id, companyId: auth.companyId },
          select: {
            id: true,
            name: true,
            state: true,
            address: true,
            latitude: true,
            longitude: true,
            workdays: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      );
      if (!site) {
        reply.code(404).send({ error: 'SITE_NOT_FOUND' });
        return;
      }
      reply.send({
        id: site.id,
        name: site.name,
        state: site.state,
        address: site.address,
        latitude: site.latitude !== null ? site.latitude.toString() : null,
        longitude: site.longitude !== null ? site.longitude.toString() : null,
        workdays: site.workdays,
        createdAt: site.createdAt.toISOString(),
        updatedAt: site.updatedAt.toISOString(),
      });
    },
  );

  // Task 6 — GET /admin/sites/:id/bindings. Tenant-scoped via siteId
  // pre-check; 404 if site not in caller tenant (do not leak). Joins User
  // for supervisor name+phone display.
  app.get<{ Params: { id: string } }>(
    '/admin/sites/:id/bindings',
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

      // Tenant gate via site existence — 404 if cross-tenant or missing.
      const site = await withTenantRead(prisma, auth.companyId, (tx) =>
        tx.site.findFirst({
          where: { id: req.params.id, companyId: auth.companyId },
          select: { id: true, ownerHrUserId: true },
        }),
      );
      if (!site) {
        reply.code(404).send({ error: 'SITE_NOT_FOUND' });
        return;
      }
      // Site-anchored: an HR may only read bindings for a site they own
      // (OWNER is company-wide). Same opaque 404 — never leak another HR's roster.
      if (auth.role === 'HR' && site.ownerHrUserId !== auth.userId) {
        reply.code(404).send({ error: 'SITE_NOT_FOUND' });
        return;
      }

      const where: NonNullable<
        Parameters<typeof prisma.siteSupervisorBinding.findMany>[0]
      >['where'] = {
        companyId: auth.companyId,
        siteId: req.params.id,
      };
      if (cursor) {
        where.OR = [
          { createdAt: { lt: cursor.createdAt } },
          { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
        ];
      }

      const rows = await withTenantRead(prisma, auth.companyId, (tx) =>
        tx.siteSupervisorBinding.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: {
            id: true,
            siteId: true,
            userId: true,
            actingForUserId: true,
            effectiveFrom: true,
            effectiveUntil: true,
            endedAt: true,
            reason: true,
            createdAt: true,
            supervisor: { select: { name: true, phone: true } },
          },
        }),
      );
      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const items = sliced.map((b) => ({
        id: b.id,
        siteId: b.siteId,
        supervisorUserId: b.userId,
        actingForUserId: b.actingForUserId,
        effectiveFrom: b.effectiveFrom.toISOString(),
        effectiveUntil: b.effectiveUntil ? b.effectiveUntil.toISOString() : null,
        endedAt: b.endedAt ? b.endedAt.toISOString() : null,
        reason: b.reason,
        createdAt: b.createdAt.toISOString(),
        supervisorName: b.supervisor?.name ?? null,
        supervisorPhone: b.supervisor?.phone ?? null,
      }));
      const lastRow = sliced.at(-1);
      const nextCursor =
        hasMore && lastRow ? encodeCursor({ createdAt: lastRow.createdAt, id: lastRow.id }) : null;
      reply.send({ items, nextCursor });
    },
  );

  app.post(
    '/admin/sites',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateSiteInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateSiteService(tx, {
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );
      reply.send({ siteId: out.siteId, state: 'DRAFT' });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/sites/:id/bindings',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateBindingInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      // Site-anchored: an HR may only bind supervisors on a site they own
      // (OWNER is company-wide). Same opaque 404 as a missing site.
      if (auth.role === 'HR') {
        const site = await withTenantRead(prisma, auth.companyId, (tx) =>
          tx.site.findFirst({
            where: { id: req.params.id, companyId: auth.companyId },
            select: { ownerHrUserId: true },
          }),
        );
        if (!site || site.ownerHrUserId !== auth.userId) {
          reply.code(404).send({ error: 'SITE_NOT_FOUND' });
          return;
        }
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateBindingService(tx, {
          siteId: req.params.id,
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );
      if (out.kind === 'SITE_NOT_FOUND') {
        reply
          .code(404)
          .send({ error: 'SITE_NOT_FOUND', message: 'Site not found in this company' });
        return;
      }
      if (out.kind === 'SUPERVISOR_NOT_FOUND') {
        reply.code(404).send({
          error: 'SUPERVISOR_NOT_FOUND',
          message: 'Supervisor with that userId is not an active member of this company',
        });
        return;
      }
      reply.send({ bindingId: out.bindingId });
    },
  );

  // PATCH /admin/sites/:id/hr — OWNER-only direct site→HR ownership assignment.
  // The high-stakes boundary the owner keeps (HR proposes via wave 5b; OWNER
  // commits here). Body { hrUserId: uuid | null } (null = unassign).
  app.patch<{ Params: { id: string } }>(
    '/admin/sites/:id/hr',
    { preHandler: [requireAuth, requireRole('OWNER')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = z.object({ hrUserId: z.string().uuid().nullable() }).safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminAssignSiteHrService(tx, {
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          siteId: req.params.id,
          hrUserId: parsed.data.hrUserId,
        }),
      );
      if (out.kind === 'SITE_NOT_FOUND') {
        reply
          .code(404)
          .send({ error: 'SITE_NOT_FOUND', message: 'Site not found in this company' });
        return;
      }
      if (out.kind === 'HR_NOT_FOUND') {
        reply.code(404).send({
          error: 'HR_NOT_FOUND',
          message: 'That user is not an active HR in this company',
        });
        return;
      }
      if (out.kind === 'WOULD_SPLIT_WORKER') {
        reply.code(409).send({
          error: 'WOULD_SPLIT_WORKER',
          message:
            'Reassigning this site would put a worker under two HRs. Move their other sites first.',
          workerIds: out.workerIds,
        });
        return;
      }
      reply.send({ siteId: out.siteId, hrUserId: out.hrUserId });
    },
  );
}
