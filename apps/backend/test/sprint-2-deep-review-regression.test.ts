/**
 * Sprint 2 deep-review P0 regression tests — Clusters A + B + C.
 *
 * Each test would FAIL on the pre-fix code (per
 * `feedback_tests_must_prove_the_bug_existed.md`, 2026-05-18 lock). They
 * pass on the post-fix code shipped in the root-level fix-PR.
 *
 * - **Cluster A** (chat amend mode is decorative). Pre-fix: backend
 *   silently discarded `amend.targetDecisionId`; response had no
 *   `didAmend`; user-row's `toolCalls` did NOT persist the amend target.
 *   Post-fix: backend validates the amend target belongs to the caller,
 *   400s on missing target, persists `amendTargetDecisionId` on the
 *   user-row's toolCalls JSON, and returns `didAmend: true` on success.
 *
 * - **Cluster B** (withIdempotency routeKey omits resource id). Pre-fix:
 *   routeKey was the literal `POST:/visits/:id/resolve`. Same
 *   Idempotency-Key on two different visits would return the cached body
 *   for the FIRST visit. Post-fix: routeKey embeds the substituted id;
 *   two different visits never collide even under the same key.
 *
 * - **Cluster C** (reverse compensators lack inverse-notification). Pre-
 *   fix: `LEAVE_APPROVED` reverse fired the audit but no outbox; worker
 *   never learned the leave was withdrawn. Same gap on the 3 other
 *   reverse kinds. Post-fix: each reverse branch enqueues a kind-
 *   specific `worker.<inverse>` outbox row inside the same tx as the
 *   audit.
 *
 * Runs against the Railway sandbox via `withMultipleTenants`. Cleanup is
 * handled by the helper's finally block.
 *
 * @derives(2026-05-18-sprint-2-deep-review.md Clusters A + B + C)
 * @derives(feedback_tests_must_prove_the_bug_existed.md, 2026-05-18)
 * @derives(feedback_orchestrator_pre_merge_gate.md, 2026-05-18)
 * @derives(master-plan §G) — supervisor surface
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { reverseActivity } from '../src/lib/services/activity-reverse-service.js';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Sprint 2 deep-review P0 regressions — Clusters A + B + C', () => {
  test('Cluster B — withIdempotency routeKey embeds the resource id', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prisma, prefix: `cluster-b-${Date.now()}-` },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const supervisor = tenant.supervisors[0]!;

        // Seed two distinct flagged visits in the SAME tenant. The
        // pre-fix routeKey would collide them under one Idempotency-Key.
        const baseTs = Date.now();
        const site = await prisma.site.create({
          data: {
            companyId: tenant.companyId,
            name: 'Cluster B Site',
            address: 'Cluster B Addr',
          },
        });
        const worker = await prisma.worker.create({
          data: {
            companyId: tenant.companyId,
            name: 'B Worker',
            phone: `+9188${String(baseTs).slice(-8)}`,
            state: 'ACTIVE',
          },
        });
        const visit1 = await prisma.visit.create({
          data: {
            companyId: tenant.companyId,
            siteId: site.id,
            workerId: worker.id,
            scheduledFor: new Date(),
            state: 'COMPLETED',
            flagged: true,
          },
        });
        const visit2 = await prisma.visit.create({
          data: {
            companyId: tenant.companyId,
            siteId: site.id,
            workerId: worker.id,
            scheduledFor: new Date(),
            state: 'COMPLETED',
            flagged: true,
          },
        });

        // Same Idempotency-Key on two different visits. Pre-fix the
        // second call would return the cached body for visit1. Post-fix
        // each visit has its own cache key (routeKey embeds the id).
        const sharedKey = randomUUID();
        const { buildServer } = await import('../src/server.js');
        const app = await buildServer();
        await app.ready();

        try {
          const r1 = await app.inject({
            method: 'POST',
            url: `/visits/${visit1.id}/resolve`,
            headers: {
              authorization: `Bearer ${supervisor.accessToken}`,
              'idempotency-key': sharedKey,
            },
            payload: { supervisorReason: 'Resolved visit 1' },
          });
          const r2 = await app.inject({
            method: 'POST',
            url: `/visits/${visit2.id}/resolve`,
            headers: {
              authorization: `Bearer ${supervisor.accessToken}`,
              'idempotency-key': sharedKey,
            },
            payload: { supervisorReason: 'Resolved visit 2' },
          });

          expect(r1.statusCode).toBe(200);
          expect(r2.statusCode).toBe(200);

          // Both visits should now be unflagged. Pre-fix r2 would return
          // r1's cached body and visit2 in DB would still be flagged.
          const v1 = await prisma.visit.findFirstOrThrow({ where: { id: visit1.id } });
          const v2 = await prisma.visit.findFirstOrThrow({ where: { id: visit2.id } });
          expect(v1.flagged).toBe(false);
          expect(v2.flagged).toBe(false);

          // The IdempotencyKey table should have TWO rows — one per
          // resource. Pre-fix it had one (collision).
          const cacheRows = await prisma.idempotencyKey.findMany({
            where: { companyId: tenant.companyId, idempotencyKey: sharedKey },
          });
          expect(cacheRows.length).toBe(2);
          const routeKeys = cacheRows.map((r) => r.routeKey).sort();
          expect(routeKeys).toEqual(
            [`POST:/visits/${visit1.id}/resolve`, `POST:/visits/${visit2.id}/resolve`].sort(),
          );
        } finally {
          await app.close();
        }
      },
    );
  }, 60000);

  test('Cluster C — LEAVE_APPROVED reverse emits worker.leave_reverted outbox', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prisma, prefix: `cluster-c-${Date.now()}-` },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const supervisor = tenant.supervisors[0]!;

        // Seed: worker + leave-request approved 1 minute ago.
        const baseTs = Date.now();
        const worker = await prisma.worker.create({
          data: {
            companyId: tenant.companyId,
            name: 'C Worker',
            phone: `+9188${String(baseTs + 1).slice(-8)}`,
            state: 'ACTIVE',
          },
        });
        const leave = await prisma.leaveRequest.create({
          data: {
            companyId: tenant.companyId,
            workerId: worker.id,
            fromDate: new Date('2026-06-01'),
            toDate: new Date('2026-06-02'),
            reason: 'sister wedding',
            state: 'APPROVED',
            decidedBy: supervisor.userId,
            decidedAt: new Date(Date.now() - 60_000),
          },
        });
        // Audit row that activity-reverse looks up to drive the
        // compensator. createdAt within the 30-min window.
        const auditRow = await prisma.auditEvent.create({
          data: {
            companyId: tenant.companyId,
            kind: 'LEAVE_APPROVED',
            actorId: supervisor.userId,
            targetId: leave.id,
            payload: { leaveRequestId: leave.id, workerId: worker.id } as object,
            createdAt: new Date(Date.now() - 60_000),
          },
        });

        // Reverse via service (bypassing route to isolate the compensator
        // contract).
        const before = await prisma.outbox.count({
          where: { companyId: tenant.companyId, topic: 'worker.leave_reverted' },
        });
        const out = await reverseActivity(prisma, {
          companyId: tenant.companyId,
          auditEventId: auditRow.id,
          supervisorUserId: supervisor.userId,
          now: new Date(),
        });
        expect(out.kind).toBe('OK');

        // Audit chain: LEAVE_REVERSED was created (existing assertion).
        const reverseAudit = await prisma.auditEvent.findFirst({
          where: {
            companyId: tenant.companyId,
            kind: 'LEAVE_REVERSED',
            targetId: leave.id,
          },
        });
        expect(reverseAudit).not.toBeNull();

        // Inverse-notification outbox: pre-fix this was missing.
        const after = await prisma.outbox.count({
          where: { companyId: tenant.companyId, topic: 'worker.leave_reverted' },
        });
        expect(after).toBe(before + 1);

        // Payload completeness — worker contact data + lineage so the
        // dispatcher can fan to push / SMS / WhatsApp.
        const outboxRow = await prisma.outbox.findFirstOrThrow({
          where: { companyId: tenant.companyId, topic: 'worker.leave_reverted' },
          orderBy: { createdAt: 'desc' },
        });
        const payload = outboxRow.payload as {
          leaveRequestId: string;
          workerId: string;
          workerPhone: string | null;
          reversedBy: string;
          sourceAuditEventId: string;
        };
        expect(payload.leaveRequestId).toBe(leave.id);
        expect(payload.workerId).toBe(worker.id);
        expect(payload.reversedBy).toBe(supervisor.userId);
        expect(payload.sourceAuditEventId).toBe(auditRow.id);
      },
    );
  }, 60000);

  test('Cluster A — chat amend backend validates + persists + returns didAmend', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prisma, prefix: `cluster-a-${Date.now()}-` },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const supervisor = tenant.supervisors[0]!;
        const { buildServer } = await import('../src/server.js');
        const app = await buildServer();
        await app.ready();

        try {
          // 1. amend.targetDecisionId that doesn't exist → 404 AMEND_TARGET_NOT_FOUND.
          // Pre-fix: would have passed through silently with `didAmend` undefined.
          const ghostId = randomUUID();
          const r1 = await app.inject({
            method: 'POST',
            url: '/chat/messages',
            headers: {
              authorization: `Bearer ${supervisor.accessToken}`,
              'idempotency-key': randomUUID(),
            },
            payload: {
              text: 'mark Suresh absent',
              amend: { targetDecisionId: ghostId },
            },
          });
          expect(r1.statusCode).toBe(404);
          expect((r1.json() as { error: string }).error).toBe('AMEND_TARGET_NOT_FOUND');

          // 2. amend.targetDecisionId belonging to a DIFFERENT supervisor in same
          // tenant → still 404 (route filters supervisorId = caller).
          // We seed a foreign-supervisor SupervisorDecision and assert isolation.
          const foreignSupervisorUser = await prisma.user.create({
            data: {
              phone: `+9197${String(Date.now() + 2).slice(-8)}`,
              name: 'Foreign Sup',
              locale: 'en',
            },
          });
          await prisma.membership.create({
            data: {
              companyId: tenant.companyId,
              userId: foreignSupervisorUser.id,
              role: 'SUPERVISOR',
              status: 'ACTIVE',
            },
          });
          const foreignDecision = await prisma.supervisorDecision.create({
            data: {
              companyId: tenant.companyId,
              supervisorId: foreignSupervisorUser.id,
              kind: 'MARK_ABSENT',
              tier: 'OPERATIONAL',
              targetId: null,
              payload: {} as object,
            },
          });
          const r2 = await app.inject({
            method: 'POST',
            url: '/chat/messages',
            headers: {
              authorization: `Bearer ${supervisor.accessToken}`,
              'idempotency-key': randomUUID(),
            },
            payload: {
              text: 'mark Suresh absent',
              amend: { targetDecisionId: foreignDecision.id },
            },
          });
          expect(r2.statusCode).toBe(404);

          // 3. Without amend → success path returns didAmend: false.
          //    Help-trigger short-circuit keeps this test cheap (no OpenAI call).
          const r3 = await app.inject({
            method: 'POST',
            url: '/chat/messages',
            headers: {
              authorization: `Bearer ${supervisor.accessToken}`,
              'idempotency-key': randomUUID(),
            },
            payload: { text: 'help' },
          });
          expect(r3.statusCode).toBe(200);
          const r3body = r3.json() as { didAmend: boolean };
          expect(r3body.didAmend).toBe(false);

          // 4. Valid amend.targetDecisionId (caller-owned) → didAmend: true +
          //    persisted on the user-row's toolCalls JSON.
          const ownDecision = await prisma.supervisorDecision.create({
            data: {
              companyId: tenant.companyId,
              supervisorId: supervisor.userId,
              kind: 'MARK_ABSENT',
              tier: 'OPERATIONAL',
              targetId: null,
              payload: {} as object,
            },
          });
          const r4 = await app.inject({
            method: 'POST',
            url: '/chat/messages',
            headers: {
              authorization: `Bearer ${supervisor.accessToken}`,
              'idempotency-key': randomUUID(),
            },
            payload: {
              text: 'help',
              amend: { targetDecisionId: ownDecision.id },
            },
          });
          expect(r4.statusCode).toBe(200);
          const r4body = r4.json() as { didAmend: boolean; chatMessageId: string };
          expect(r4body.didAmend).toBe(true);

          // Verify persistence on the user-row's toolCalls JSON.
          // r4body.chatMessageId is the ASSISTANT message; find its
          // sibling user message via thread + role.
          const assistantMsg = await prisma.chatMessage.findFirstOrThrow({
            where: { id: r4body.chatMessageId, companyId: tenant.companyId },
          });
          const userMsg = await prisma.chatMessage.findFirstOrThrow({
            where: {
              companyId: tenant.companyId,
              threadId: assistantMsg.threadId,
              role: 'user',
            },
            orderBy: { createdAt: 'desc' },
          });
          const userToolCalls = userMsg.toolCalls as { amendTargetDecisionId?: string } | null;
          expect(userToolCalls?.amendTargetDecisionId).toBe(ownDecision.id);
        } finally {
          await app.close();
        }
      },
    );
  }, 120000);
});
