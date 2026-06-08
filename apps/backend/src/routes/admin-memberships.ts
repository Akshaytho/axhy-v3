/**
 * POST /admin/memberships (R1)
 *
 * Caller: OWNER or HR.
 * Target: HR (OWNER only) or SUPERVISOR (HR only). Enforced via
 * assertTargetRole against the locked HIRING_AUTHORITY table.
 *
 * @derives(ADR-0026)
 * @derives(ADR-0025)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

// [ORCHESTRATOR_EXCEPTION] HR-A1 Task 3 single-task continuation - GET handler must be added inline to existing route file alongside POST.
import type { FastifyInstance } from 'fastify';
import { AdminCreateMembershipInput } from '@axhy/shared-schema';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getHrSiteIds } from '../middleware/hr-site-scope.js';
import { adminCreateMembershipService } from '../lib/services/admin-membership-service.js';

// File-local cursor schema + codec (not exported to avoid axhy/require-derives).
const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().optional(),
});

type Cursor = { createdAt: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor {
  let json: string;
  try {
    json = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new Error('CURSOR_INVALID');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('CURSOR_INVALID');
  }
  const shape = z.object({ createdAt: z.string(), id: z.string() }).safeParse(parsed);
  if (!shape.success) throw new Error('CURSOR_INVALID');
  if (Number.isNaN(Date.parse(shape.data.createdAt))) {
    throw new Error('CURSOR_INVALID');
  }
  return shape.data;
}

/** @derives(ADR-0026) */
export async function registerAdminMembershipRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/admin/memberships',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateMembershipInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateMembershipService(tx, {
          callerRole: auth.role,
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );

      if (out.kind === 'FORBIDDEN_TARGET_ROLE') {
        reply.code(403).send({
          error: 'FORBIDDEN_TARGET_ROLE',
          message: `Role ${out.callerRole} cannot create members of role ${out.targetRole}`,
        });
        return;
      }
      if (out.kind === 'ALREADY_EXISTS') {
        reply.code(409).send({
          error: 'MEMBERSHIP_ALREADY_EXISTS',
          message: 'A membership with this phone and role already exists in this company',
        });
        return;
      }
      reply.send({
        membershipId: out.membershipId,
        userId: out.userId,
        role: out.role,
        status: 'ACTIVE',
      });
    },
  );

  // [ORCHESTRATOR_EXCEPTION] HR-A1 Task 3 GET handler (paginated membership list).
  app.get(
    '/admin/memberships',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;

      const qParsed = ListQuery.safeParse(req.query);
      if (!qParsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: qParsed.error.message });
        return;
      }
      const { limit, cursor: rawCursor } = qParsed.data;

      let cursor: Cursor | undefined;
      if (rawCursor) {
        try {
          cursor = decodeCursor(rawCursor);
        } catch {
          reply.code(400).send({ error: 'CURSOR_INVALID', message: 'Malformed cursor' });
          return;
        }
      }

      // Build where clause. Tenant scoping is mandatory; HR additionally
      // scoped to memberships in pods they own (primary or backup).
      const where: Record<string, unknown> = { companyId: auth.companyId };
      if (auth.role === 'HR') {
        // Site-anchored: memberships of people connected to a site this HR owns —
        // workers via a live assignment, supervisors via an active site binding.
        const mySiteIds = await getHrSiteIds(prisma, auth.userId, auth.companyId);
        if (mySiteIds.length === 0) {
          reply.send({ items: [], nextCursor: null });
          return;
        }
        where.user = {
          OR: [
            {
              workerProfile: {
                assignments: {
                  some: { siteId: { in: mySiteIds }, state: { in: ['ACTIVE', 'DRAFT'] } },
                },
              },
            },
            { supervisorBindings: { some: { siteId: { in: mySiteIds }, endedAt: null } } },
          ],
        };
      }

      if (cursor) {
        // (createdAt, id) descending pagination: next page is rows strictly
        // older than the cursor, breaking ties by id.
        where.OR = [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ];
      }

      // Fetch limit+1 to detect whether another page exists.
      const rows = await prisma.membership.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          podId: true,
          createdAt: true,
          user: { select: { name: true, phone: true } },
        },
      });

      let nextCursor: string | null = null;
      let page = rows;
      if (rows.length > limit) {
        page = rows.slice(0, limit);
        const last = page[page.length - 1];
        if (last) {
          nextCursor = encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id });
        }
      }

      reply.send({ items: page, nextCursor });
    },
  );
}
