/**
 * POST /admin/policy — append a Policy row.
 *
 * The first authenticated write surface for the Policy table — used by
 * admin-web to set company rules, HR rules, AI limits. Gated by the
 * key-namespace ACL (docs/locked/security-gaps-to-fix.md GAP 2).
 *
 * Request body:
 *   {
 *     key: string,         // e.g. "ai.rules.company.uniform_required"
 *     value: unknown,      // JSON value
 *     category: 'sla' | 'notification' | 'worker' | 'hr' | 'ai' | 'owner' | 'handoff'
 *   }
 *
 * Responses:
 *   200 — { policyId, setAt, previousValueSnapshot }
 *   400 — BAD_INPUT (Zod validation)
 *   401 — AUTH_REQUIRED
 *   403 — POLICY_KEY_FORBIDDEN_FOR_ROLE (ACL violation)
 *   403 — COMPANY_NOT_ACTIVE (withTenantContext enforcement of Company.status)
 *
 * @derives(master-plan §G)
 * @derives(plans/abstract-wandering-kazoo.md Phase 1)
 * @derives(docs/locked/security-gaps-to-fix.md GAP 2)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PolicyCategorySchema } from '@axhy/shared-schema';
import type { Role } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { setPolicy } from '../lib/policy-service.js';
import { PolicyKeyForbiddenError, assertPolicyKeyAllowedForRole } from '../lib/policy-write-acl.js';

const SetPolicyRouteInput = z.object({
  key: z.string().min(1).max(200),
  value: z.unknown(),
  category: PolicyCategorySchema,
});

/**
 * Whether `role` may append a new value for `key`. Mirrors the write ACL the
 * POST handler enforces, so the Policies screen can show an Edit vs Owner-only
 * lock per row without a second round-trip. Non-throwing wrapper over
 * assertPolicyKeyAllowedForRole.
 */
function policyEditableForRole(role: Role, key: string): boolean {
  try {
    assertPolicyKeyAllowedForRole(role, key);
    return true;
  } catch {
    return false;
  }
}

export async function registerAdminPolicyRoutes(app: FastifyInstance): Promise<void> {
  app.post('/admin/policy', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }

    const parsed = SetPolicyRouteInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    try {
      const result = await withTenantContext(prisma, auth.companyId, async (tx) =>
        setPolicy(
          tx,
          {
            companyId: auth.companyId,
            key: parsed.data.key,
            value: parsed.data.value,
            category: parsed.data.category,
          },
          { role: auth.role, userId: auth.userId },
        ),
      );
      reply.code(200).send({
        policyId: result.policyId,
        setAt: result.setAt.toISOString(),
        previousValueSnapshot: result.previousValueSnapshot,
      });
    } catch (err) {
      if (err instanceof PolicyKeyForbiddenError) {
        reply.code(403).send({
          error: err.code,
          message: err.message,
          allowedRoles: err.allowedRoles,
        });
        return;
      }
      // withTenantContext throws for SUSPENDED companies with statusCode=403.
      if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 403) {
        reply.code(403).send({
          error: 'COMPANY_NOT_ACTIVE',
          message: 'Company is not ACTIVE',
        });
        return;
      }
      throw err;
    }
  });

  /**
   * GET /admin/policy — current value per policy key for the tenant.
   *
   * Policy is append-only, so "current" is the most-recent row per key. Each
   * row carries the human name of who set it (resolved via Membership→User),
   * the DB category enum (echoed back on edit), and an `editable` flag derived
   * from the same write ACL the POST handler enforces. The screen's display
   * metadata (label / hint / type / unit) lives client-side; this returns the
   * real values + provenance only.
   *
   * Auth: requireRole(OWNER, HR). Read-only inside withTenantRead (RLS GUC).
   */
  app.get(
    '/admin/policy',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const all = await tx.policy.findMany({
          where: { companyId: auth.companyId },
          orderBy: { setAt: 'desc' },
          select: { key: true, value: true, category: true, setBy: true, setAt: true },
        });
        // Most-recent row wins per key (rows already in setAt-desc order).
        const seen = new Set<string>();
        const latest = all.filter((r) => !seen.has(r.key) && seen.add(r.key));

        const setByIds = [...new Set(latest.map((r) => r.setBy))];
        const members = await tx.membership.findMany({
          where: { companyId: auth.companyId, userId: { in: setByIds } },
          select: { userId: true, user: { select: { name: true } } },
        });
        const nameById = new Map(members.map((m) => [m.userId, m.user?.name ?? '—']));

        return latest.map((r) => ({
          key: r.key,
          value: r.value,
          category: r.category,
          setByName: nameById.get(r.setBy) ?? '—',
          setAt: r.setAt.toISOString(),
          editable: policyEditableForRole(auth.role, r.key),
        }));
      });
      reply.send({ policies: out });
    },
  );

  /**
   * GET /admin/policy/:key/history — append-only history for one key, newest
   * first. Each entry includes the value, the previous value snapshot, who set
   * it, and when. Powers the v6 Policy history modal.
   *
   * Auth: requireRole(OWNER, HR). Read-only inside withTenantRead (RLS GUC).
   */
  app.get(
    '/admin/policy/:key/history',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const { key } = req.params as { key: string };
      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const rows = await tx.policy.findMany({
          where: { companyId: auth.companyId, key },
          orderBy: { setAt: 'desc' },
          select: { value: true, previousValueSnapshot: true, setBy: true, setAt: true },
        });
        const setByIds = [...new Set(rows.map((r) => r.setBy))];
        const members = await tx.membership.findMany({
          where: { companyId: auth.companyId, userId: { in: setByIds } },
          select: { userId: true, user: { select: { name: true } } },
        });
        const nameById = new Map(members.map((m) => [m.userId, m.user?.name ?? '—']));
        return rows.map((r) => ({
          value: r.value,
          previousValueSnapshot: r.previousValueSnapshot,
          setByName: nameById.get(r.setBy) ?? '—',
          setAt: r.setAt.toISOString(),
        }));
      });
      reply.send({ history: out });
    },
  );
}
