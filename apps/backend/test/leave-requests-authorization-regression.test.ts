/**
 * Cluster A (P0) regression tests — leave-request approve/reject authorization.
 *
 * These tests assert the post-fix behaviour. They would have FAILED on the
 * pre-fix code (which had no role gate, no portfolio gate, and silently
 * discarded the supervisor's reason). The fact that prior Wave 2 tests
 * passed without these is exactly what `feedback_tests_must_prove_the_bug_existed.md`
 * (locked 2026-05-18) is here to prevent.
 *
 * Buggy paths exercised here (each `it()` block names the symptom from the
 * deep-review findings doc):
 *   - Cluster A.1 — non-supervisor caller must be rejected (was: any
 *     authenticated user could decide any leave).
 *   - Cluster A.2 — supervisor without portfolio for the worker's site
 *     must be rejected (was: portfolio check absent — within-tenant
 *     privilege escalation).
 *   - Cluster A.3 — reject WITHOUT a reason must be 400 REASON_REQUIRED
 *     (was: reason silently discarded, audit recorded worker's reason
 *     instead of supervisor's).
 *   - Cluster A.4 — supervisor's `reason` field is persisted as
 *     `decisionReason` in the AuditEvent payload, distinct from the
 *     worker's `workerReason`.
 *   - Cluster A.5 — concurrent deciders: exactly one succeeds with 200,
 *     the other gets 409 ALREADY_DECIDED (was: check-then-act race let
 *     both succeed).
 *
 * Runs against the Railway sandbox. Cleanup via `withMultipleTenants`'s
 * finally block.
 *
 * @derives(2026-05-18-sprint-1-deep-review.md Cluster A)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 * @derives(master-plan §G — supervisor surface)
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Cluster A regression — leave-requests approve/reject authorization', () => {
  test('full coverage of all five symptoms', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 2, prisma, prefix: `cluster-a-${Date.now()}-` },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const responsibleSupervisor = tenant.supervisors[0]!;
        const unrelatedSupervisor = tenant.supervisors[1]!;

        // ── Seed a worker bound to a site that the responsible supervisor
        // supervises (and the unrelated supervisor does NOT). ─────────────
        const baseTs = Date.now();
        const workerPhone = `+9188${String(baseTs + 1).slice(-8)}`;
        const workerUser = await prisma.user.create({
          data: { phone: workerPhone, name: 'Cluster A Worker', locale: 'en' },
        });
        await prisma.membership.create({
          data: {
            companyId: tenant.companyId,
            userId: workerUser.id,
            role: 'WORKER',
            status: 'ACTIVE',
          },
        });
        const worker = await prisma.worker.create({
          data: {
            companyId: tenant.companyId,
            userId: workerUser.id,
            name: 'Cluster A Worker',
            phone: workerPhone,
            state: 'ACTIVE',
          },
        });

        const supervisedSite = await prisma.site.create({
          data: {
            companyId: tenant.companyId,
            name: 'Cluster A Site (responsible-supervisor portfolio)',
            address: 'Cluster A Addr',
          },
        });

        // Bind responsibleSupervisor to the site (permanent binding —
        // actingForUserId NULL) so `getSitesSupervisedByUser` returns it.
        // The unrelatedSupervisor has zero bindings — they should fail
        // the portfolio gate.
        await prisma.siteSupervisorBinding.create({
          data: {
            companyId: tenant.companyId,
            siteId: supervisedSite.id,
            userId: responsibleSupervisor.userId,
            actingForUserId: null,
            effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
            effectiveUntil: null,
            reason: 'Cluster A regression test fixture',
            createdBy: responsibleSupervisor.userId,
          },
        });

        // Assign the worker to the supervised site so
        // `deriveWorkerPrimarySiteId` returns it.
        await prisma.assignment.create({
          data: {
            companyId: tenant.companyId,
            workerId: worker.id,
            siteId: supervisedSite.id,
            shiftStart: '09:00',
            shiftEnd: '17:00',
            dayMask: 'MTWTFS_',
            validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
            validUntil: null,
            state: 'ACTIVE',
          },
        });

        // ── Helper: issue a fresh LeaveRequest in REQUESTED state ─────────
        // Note: `LeaveRequest` has no `supervisorId` column — workers
        // own the request, supervisors only decide. Portfolio gate is
        // the sole responsibility check.
        const newLeave = async (): Promise<string> => {
          const leave = await prisma.leaveRequest.create({
            data: {
              companyId: tenant.companyId,
              workerId: worker.id,
              fromDate: new Date('2026-06-01'),
              toDate: new Date('2026-06-02'),
              reason: 'sister wedding',
              state: 'REQUESTED',
            },
          });
          return leave.id;
        };

        // ── Helper: issue a worker access token (non-supervisor role) ─────
        const { issueAccessToken } = await import('../src/lib/jwt.js');
        const workerToken = await issueAccessToken({
          userId: workerUser.id,
          companyId: tenant.companyId,
          role: 'WORKER',
          availableRoles: ['WORKER'],
          locale: 'en',
        });

        // ── Cluster A.1 — non-supervisor caller (WORKER role) must be 403 ─
        // PRE-FIX: this would have returned 200 (no role check at all).
        // POST-FIX: 403 SUPERVISOR_ROLE_REQUIRED.
        {
          const leaveId = await newLeave();
          const res = await app.inject({
            method: 'POST',
            url: `/leave-requests/${leaveId}/approve`,
            headers: { authorization: `Bearer ${workerToken}` },
            payload: {},
          });
          expect(res.statusCode).toBe(403);
          expect((res.json() as { error: string }).error).toBe('SUPERVISOR_ROLE_REQUIRED');
          // DB state: leave is still REQUESTED.
          const after = await prisma.leaveRequest.findFirstOrThrow({ where: { id: leaveId } });
          expect(after.state).toBe('REQUESTED');
        }

        // ── Cluster A.2 — supervisor without portfolio for worker's site → 403 ─
        // PRE-FIX: would have returned 200 (no portfolio check).
        // POST-FIX: 403 NOT_RESPONSIBLE.
        {
          const leaveId = await newLeave();
          const res = await app.inject({
            method: 'POST',
            url: `/leave-requests/${leaveId}/approve`,
            headers: { authorization: `Bearer ${unrelatedSupervisor.accessToken}` },
            payload: {},
          });
          expect(res.statusCode).toBe(403);
          expect((res.json() as { error: string }).error).toBe('NOT_RESPONSIBLE');
          // DB state: leave is still REQUESTED.
          const after = await prisma.leaveRequest.findFirstOrThrow({ where: { id: leaveId } });
          expect(after.state).toBe('REQUESTED');
        }

        // ── Cluster A.3 — reject without a reason → 400 REASON_REQUIRED ───
        // PRE-FIX: reject without reason would have succeeded with the
        // worker's `reason` overwriting whatever the supervisor was
        // supposed to provide.
        // POST-FIX: 400 REASON_REQUIRED.
        {
          const leaveId = await newLeave();
          const res = await app.inject({
            method: 'POST',
            url: `/leave-requests/${leaveId}/reject`,
            headers: { authorization: `Bearer ${responsibleSupervisor.accessToken}` },
            payload: {},
          });
          expect(res.statusCode).toBe(400);
          expect((res.json() as { error: string }).error).toBe('REASON_REQUIRED');
          const after = await prisma.leaveRequest.findFirstOrThrow({ where: { id: leaveId } });
          expect(after.state).toBe('REQUESTED');
        }

        // ── Cluster A.4 — supervisor's `reason` persisted as decisionReason ─
        // PRE-FIX: audit payload had `reason: leave.reason` (worker's
        // reason). The supervisor's reason was silently discarded.
        // POST-FIX: audit payload has `decisionReason` (supervisor's) +
        // `workerReason` (worker's original).
        {
          const leaveId = await newLeave();
          const supervisorReason = 'Saturday is short-staffed, cannot release.';
          const res = await app.inject({
            method: 'POST',
            url: `/leave-requests/${leaveId}/reject`,
            headers: { authorization: `Bearer ${responsibleSupervisor.accessToken}` },
            payload: { reason: supervisorReason },
          });
          expect(res.statusCode).toBe(200);
          const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
              companyId: tenant.companyId,
              kind: 'LEAVE_REJECTED',
              targetId: leaveId,
            },
          });
          const payload = audit.payload as {
            workerReason?: string;
            decisionReason?: string;
            reason?: string;
          };
          expect(payload.decisionReason).toBe(supervisorReason);
          expect(payload.workerReason).toBe('sister wedding');
          // No top-level `reason` collision (would mask which is which).
          expect(payload.reason).toBeUndefined();
        }

        // ── Cluster A.5 — concurrent deciders: exactly one wins ───────────
        // PRE-FIX: check-then-act race let both succeed. Both audit rows
        // would land, double notification fired.
        // POST-FIX: conditional updateMany guards the transition;
        // one returns 200, the other 409 ALREADY_DECIDED.
        {
          const leaveId = await newLeave();
          const approveReason = 'OK go';
          const rejectReason = 'No, short-staffed';
          const [aResp, bResp] = await Promise.all([
            app.inject({
              method: 'POST',
              url: `/leave-requests/${leaveId}/approve`,
              headers: { authorization: `Bearer ${responsibleSupervisor.accessToken}` },
              payload: { reason: approveReason },
            }),
            app.inject({
              method: 'POST',
              url: `/leave-requests/${leaveId}/reject`,
              headers: { authorization: `Bearer ${responsibleSupervisor.accessToken}` },
              payload: { reason: rejectReason },
            }),
          ]);
          const statuses = [aResp.statusCode, bResp.statusCode].sort();
          expect(statuses).toEqual([200, 409]);
          const loser = aResp.statusCode === 409 ? aResp : bResp;
          expect((loser.json() as { error: string }).error).toBe('ALREADY_DECIDED');
          // DB state: exactly one terminal state, NOT both audited.
          const audits = await prisma.auditEvent.count({
            where: {
              companyId: tenant.companyId,
              targetId: leaveId,
              kind: { in: ['LEAVE_APPROVED', 'LEAVE_REJECTED'] },
            },
          });
          expect(audits).toBe(1);
        }
      },
    );
  }, 90000);
});
