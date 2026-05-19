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

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { setPolicy } from '../lib/policy-service.js';
import { PolicyKeyForbiddenError } from '../lib/policy-write-acl.js';

const SetPolicyRouteInput = z.object({
  key: z.string().min(1).max(200),
  value: z.unknown(),
  category: PolicyCategorySchema,
});

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
}
