/**
 * HR Updates authoring routes — /hr/updates.
 *
 *   POST /hr/updates — HR/OWNER publishes a short broadcast to supervisors
 *     (company-wide or targeted at one supervisor), optionally requiring a
 *     5-word own-voice acknowledgement.
 *   GET  /hr/updates — the caller's published updates, newest first, with the
 *     target supervisor's name and ack status resolved.
 *
 * The supervisor read + 5-word ack side already exists (supervisor-updates.ts);
 * this is the HR authoring side the v6 UpdatesScreen needs. Additive — reuses
 * the existing HRUpdate model, no schema change.
 *
 * Ack reporting note: HRUpdate stores a single `acknowledgedBy` UUID on the row
 * (v0 — no per-supervisor ack join table). So targeted-update acks are exact,
 * but company-wide who-acked reporting stays a design preview client-side, as
 * v6 honestly states. acknowledgmentPhrase holds the optional HR prompt hint at
 * create time and is overwritten by the supervisor's typed words on ack.
 *
 * Auth: requireRole(OWNER, HR). Reads in withTenantRead; the create writes in
 * withTenantContext (RLS GUC + Company.status gate).
 *
 * @derives(_design-handoff/axhy-hr-v6 oversight2.jsx UpdatesScreen)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';

/** The four update types v6 offers; kind doubles as the supervisor-facing title. */
const UPDATE_KINDS = ['GENERAL', 'POLICY_CHANGE', 'URGENT_NOTICE', 'PAYROLL_REMINDER'] as const;

const CreateUpdateInput = z
  .object({
    kind: z.enum(UPDATE_KINDS),
    content: z.string().trim().min(1).max(2000),
    audience: z.enum(['all', 'one']),
    targetSupervisorId: z.string().uuid().nullish(),
    acknowledgmentRequired: z.boolean().default(false),
    /** Optional HR prompt hint shown above the supervisor's reply box. */
    acknowledgmentPhrase: z.string().trim().max(200).nullish(),
  })
  .refine((d) => d.audience === 'all' || !!d.targetSupervisorId, {
    message: 'targetSupervisorId is required when audience is "one"',
    path: ['targetSupervisorId'],
  });

/**
 * Registers the HR updates route.
 * @derives(master-plan §G)
 */
export async function registerHrUpdatesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/hr/updates',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = CreateUpdateInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const d = parsed.data;
      const targetSupervisorId = d.audience === 'one' ? d.targetSupervisorId! : null;

      try {
        const created = await withTenantContext(prisma, auth.companyId, async (tx) => {
          if (targetSupervisorId) {
            const sup = await tx.membership.findFirst({
              where: { companyId: auth.companyId, userId: targetSupervisorId, role: 'SUPERVISOR' },
              select: { id: true },
            });
            if (!sup) {
              const err = new Error('Target is not a supervisor in this company') as Error & {
                statusCode?: number;
              };
              err.statusCode = 400;
              throw err;
            }
          }
          const row = await tx.hRUpdate.create({
            data: {
              companyId: auth.companyId,
              hrId: auth.userId,
              kind: d.kind,
              content: d.content,
              targetSupervisorId,
              acknowledgmentRequired: d.acknowledgmentRequired,
              acknowledgmentPhrase: d.acknowledgmentRequired
                ? (d.acknowledgmentPhrase ?? null)
                : null,
            },
            select: { id: true, createdAt: true },
          });
          await tx.auditEvent.create({
            data: {
              companyId: auth.companyId,
              kind: 'HR_UPDATE_PUBLISHED',
              actorId: auth.userId,
              targetId: row.id,
              payload: { kind: d.kind, audience: d.audience },
            },
          });
          return row;
        });
        reply.code(201).send({ id: created.id, createdAt: created.createdAt.toISOString() });
      } catch (err) {
        if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 400) {
          reply
            .code(400)
            .send({
              error: 'TARGET_NOT_SUPERVISOR',
              message: 'Target is not a supervisor in this company',
            });
          return;
        }
        if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 403) {
          reply.code(403).send({ error: 'COMPANY_NOT_ACTIVE', message: 'Company is not ACTIVE' });
          return;
        }
        throw err;
      }
    },
  );

  app.get(
    '/hr/updates',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const rows = await tx.hRUpdate.findMany({
          // HR sees the updates they authored; OWNER sees the whole tenant's.
          where:
            auth.role === 'HR'
              ? { companyId: auth.companyId, hrId: auth.userId }
              : { companyId: auth.companyId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            kind: true,
            content: true,
            targetSupervisorId: true,
            acknowledgmentRequired: true,
            acknowledgmentPhrase: true,
            acknowledgedBy: true,
            acknowledgedAt: true,
            createdAt: true,
          },
        });

        const userIds = [
          ...new Set(
            rows
              .flatMap((r) => [r.targetSupervisorId, r.acknowledgedBy])
              .filter((x): x is string => !!x),
          ),
        ];
        const members = userIds.length
          ? await tx.membership.findMany({
              where: { companyId: auth.companyId, userId: { in: userIds } },
              select: { userId: true, user: { select: { name: true } } },
            })
          : [];
        const nameById = new Map(members.map((m) => [m.userId, m.user?.name ?? '—']));

        return rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          content: r.content,
          targetSupervisorId: r.targetSupervisorId,
          targetSupervisorName: r.targetSupervisorId
            ? (nameById.get(r.targetSupervisorId) ?? '—')
            : null,
          acknowledgmentRequired: r.acknowledgmentRequired,
          acknowledgmentPhrase: r.acknowledgmentPhrase,
          acknowledgedBy: r.acknowledgedBy,
          acknowledgedByName: r.acknowledgedBy ? (nameById.get(r.acknowledgedBy) ?? '—') : null,
          acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        }));
      });
      reply.send({ updates: out });
    },
  );
}
