/**
 * Real-DB regression test — POST /activity/:id/reverse + soft-flag.
 *
 * Wave 4 compliance flow (2026-05-18). Proves the bugs the placeholder
 * ReverseModal ("Reverse coming with routing slice") was hiding:
 *   - In-window reverse on WORKER_MARKED_ABSENT deletes the underlying
 *     Attendance row AND emits ATTENDANCE_REVERSED + ACTIVITY_REVERSED audits.
 *   - Beyond-window soft-flag creates a LATE_REVERSAL_REQUEST
 *     SupervisorDecision row (OPERATIONAL tier) + emits
 *     ACTIVITY_LATE_REVERSAL_REQUESTED audit.
 *   - Cross-tenant attempts return 404.
 *   - Non-own-event returns 403.
 *   - Unsupported kind returns 422 KIND_NOT_REVERSIBLE.
 *   - Window-open soft-flag attempt returns 422 WINDOW_OPEN.
 *   - Duplicate reverse (same source) returns 409 ALREADY_REVERSED.
 *   - Idempotency-Key: a retry with the same key returns the cached
 *     response and does NOT emit a second audit row.
 *
 * Per feedback_tests_must_prove_the_bug_existed.md: every assertion proves
 * a property — response BODY shape (envelope), DB state, audit payload —
 * not just the HTTP status code.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  ActivityReversedPayloadSchema,
  ActivityLateReversalRequestedPayloadSchema,
} from '@axhy/shared-schema';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Wave 4 — POST /activity/:id/{reverse,soft-flag} regression', () => {
  test('full lifecycle: reverse + soft-flag + cross-tenant + idempotency-key', async () => {
    await withMultipleTenants(
      { count: 2, supervisorsPerTenant: 1, prisma, prefix: `w4-activity-${Date.now()}-` },
      async ({ tenants, app }) => {
        const tenantA = tenants[0]!;
        const tenantB = tenants[1]!;
        const supA = tenantA.supervisors[0]!;
        const supB = tenantB.supervisors[0]!;

        // ── Seed: worker on tenant A, no-op tenant B for cross-tenant ────
        const seedWorker = async (companyId: string, tag: string) => {
          const phone = `+9177${String(Date.now() + Math.floor(Math.random() * 1_000_000)).slice(-8)}`;
          const user = await prisma.user.create({
            data: { phone, name: `${tag}-worker`, locale: 'en' },
          });
          await prisma.membership.create({
            data: { companyId, userId: user.id, role: 'WORKER', status: 'ACTIVE' },
          });
          const worker = await prisma.worker.create({
            data: {
              companyId,
              userId: user.id,
              name: `${tag}-worker`,
              phone,
              state: 'ACTIVE',
            },
          });
          return worker.id;
        };
        const workerAId = await seedWorker(tenantA.companyId, 'A');

        const site = await prisma.site.create({
          data: { companyId: tenantA.companyId, name: 'S', address: 'Hyd' },
        });

        // Helper — create an Attendance row + matching WORKER_MARKED_ABSENT
        // audit row, mimicking what markAbsentService does in production.
        const seedAbsence = async (
          actorUserId: string,
          createdAt: Date,
          date: string,
        ): Promise<string> => {
          await prisma.attendance.create({
            data: {
              companyId: tenantA.companyId,
              workerId: workerAId,
              date: new Date(date),
              status: 'ABSENT_NO_CALL',
              markedBySupervisorId: actorUserId,
              reason: 'no-call no-show',
              payDeductPaise: 50000,
            },
          });
          const audit = await prisma.auditEvent.create({
            data: {
              companyId: tenantA.companyId,
              kind: 'WORKER_MARKED_ABSENT',
              actorId: actorUserId,
              targetId: workerAId,
              payload: {
                date,
                status: 'ABSENT_NO_CALL',
                reason: 'no-call no-show',
                payDeductPaise: 50000,
                workerName: 'A-worker',
              },
              createdAt,
            },
          });
          return audit.id;
        };

        // ── 1. In-window Reverse on WORKER_MARKED_ABSENT ────────────────
        const today = new Date().toISOString().slice(0, 10);
        const recent = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
        const recentAuditId = await seedAbsence(supA.userId, recent, today);

        const reverseRes = await app.inject({
          method: 'POST',
          url: `/activity/${recentAuditId}/reverse`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `reverse-${recentAuditId}-1`,
          },
          payload: {},
        });
        expect(reverseRes.statusCode).toBe(200);
        const reverseBody = reverseRes.json() as {
          ok: true;
          sourceAuditEventId: string;
          sourceKind: string;
          reverseAuditEventId: string;
          compensatingAuditEventId: string;
        };
        expect(reverseBody.sourceKind).toBe('WORKER_MARKED_ABSENT');
        expect(reverseBody.sourceAuditEventId).toBe(recentAuditId);
        expect(reverseBody.reverseAuditEventId).toBeTruthy();
        expect(reverseBody.compensatingAuditEventId).toBeTruthy();
        expect(reverseBody.reverseAuditEventId).not.toBe(reverseBody.compensatingAuditEventId);

        // DB: Attendance row deleted
        const attRow = await prisma.attendance.findUnique({
          where: { workerId_date: { workerId: workerAId, date: new Date(today) } },
        });
        expect(attRow).toBeNull();

        // Compensating audit row exists with correct payload shape
        const compRow = await prisma.auditEvent.findUniqueOrThrow({
          where: { id: reverseBody.compensatingAuditEventId },
        });
        expect(compRow.kind).toBe('ATTENDANCE_REVERSED');
        expect(compRow.targetId).toBe(workerAId);

        // ACTIVITY_REVERSED audit row exists with correct payload shape
        const revRow = await prisma.auditEvent.findUniqueOrThrow({
          where: { id: reverseBody.reverseAuditEventId },
        });
        expect(revRow.kind).toBe('ACTIVITY_REVERSED');
        const revPayloadParse = ActivityReversedPayloadSchema.safeParse(revRow.payload);
        expect(revPayloadParse.success).toBe(true);
        if (revPayloadParse.success) {
          expect(revPayloadParse.data.sourceAuditEventId).toBe(recentAuditId);
          expect(revPayloadParse.data.sourceKind).toBe('WORKER_MARKED_ABSENT');
          expect(revPayloadParse.data.reversedBy).toBe(supA.userId);
        }

        // ── 2. Idempotency-Key retry returns cached, no second audit row ─
        const reverseRetry = await app.inject({
          method: 'POST',
          url: `/activity/${recentAuditId}/reverse`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `reverse-${recentAuditId}-1`,
          },
          payload: {},
        });
        expect(reverseRetry.statusCode).toBe(200);
        const reversedCount = await prisma.auditEvent.count({
          where: {
            companyId: tenantA.companyId,
            kind: 'ACTIVITY_REVERSED',
            targetId: recentAuditId,
          },
        });
        expect(reversedCount).toBe(1);

        // ── 3. Duplicate reverse with a different key → 409 ───────────
        const reverseDup = await app.inject({
          method: 'POST',
          url: `/activity/${recentAuditId}/reverse`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `reverse-${recentAuditId}-2`,
          },
          payload: {},
        });
        expect(reverseDup.statusCode).toBe(409);
        expect((reverseDup.json() as { error: string }).error).toBe('ALREADY_REVERSED');

        // ── 4. Cross-tenant: Sup B can't reverse Tenant A audit ───────
        const xTenant = await app.inject({
          method: 'POST',
          url: `/activity/${recentAuditId}/reverse`,
          headers: { authorization: `Bearer ${supB.accessToken}` },
          payload: {},
        });
        expect(xTenant.statusCode).toBe(404);
        expect((xTenant.json() as { error: string }).error).toBe('ACTIVITY_NOT_FOUND');

        // ── 5. NOT_OWN_EVENT — supervisor A can't reverse an event whose ─
        //      actorId is someone else.
        const otherAudit = await prisma.auditEvent.create({
          data: {
            companyId: tenantA.companyId,
            kind: 'WORKER_MARKED_ABSENT',
            actorId: tenantA.companyId, // not supA.userId — synthetic foreign actor
            targetId: workerAId,
            payload: { date: today, status: 'ABSENT_NO_CALL', workerName: 'A-worker' },
            createdAt: new Date(Date.now() - 60 * 1000),
          },
        });
        const notOwn = await app.inject({
          method: 'POST',
          url: `/activity/${otherAudit.id}/reverse`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {},
        });
        expect(notOwn.statusCode).toBe(403);
        expect((notOwn.json() as { error: string }).error).toBe('NOT_OWN_EVENT');

        // ── 6. Unsupported kind → 422 KIND_NOT_REVERSIBLE ──────────────
        const unsupportedAudit = await prisma.auditEvent.create({
          data: {
            companyId: tenantA.companyId,
            kind: 'CHAT_MESSAGE_CREATED',
            actorId: supA.userId,
            targetId: workerAId,
            payload: {},
            createdAt: new Date(Date.now() - 60 * 1000),
          },
        });
        const unsupportedRes = await app.inject({
          method: 'POST',
          url: `/activity/${unsupportedAudit.id}/reverse`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {},
        });
        expect(unsupportedRes.statusCode).toBe(422);
        const unsupportedBody = unsupportedRes.json() as { error: string; sourceKind: string };
        expect(unsupportedBody.error).toBe('KIND_NOT_REVERSIBLE');
        expect(unsupportedBody.sourceKind).toBe('CHAT_MESSAGE_CREATED');

        // ── 7. Window-closed → soft-flag happy path ────────────────────
        const oldAuditCreatedAt = new Date(Date.now() - 45 * 60 * 1000); // 45 min ago
        const oldDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const oldAuditId = await seedAbsence(supA.userId, oldAuditCreatedAt, oldDate);

        // Trying to reverse past-window first → 422 WINDOW_CLOSED.
        const reverseClosed = await app.inject({
          method: 'POST',
          url: `/activity/${oldAuditId}/reverse`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {},
        });
        expect(reverseClosed.statusCode).toBe(422);
        const closedBody = reverseClosed.json() as { error: string; windowMs: number };
        expect(closedBody.error).toBe('WINDOW_CLOSED');
        expect(closedBody.windowMs).toBe(30 * 60 * 1000);

        // Soft-flag the same row.
        const softRes = await app.inject({
          method: 'POST',
          url: `/activity/${oldAuditId}/soft-flag`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `soft-${oldAuditId}-1`,
          },
          payload: { note: 'Worker just called — please reverse.' },
        });
        expect(softRes.statusCode).toBe(200);
        const softBody = softRes.json() as {
          ok: true;
          decisionId: string;
          sourceAuditEventId: string;
          sourceKind: string;
        };
        expect(softBody.sourceAuditEventId).toBe(oldAuditId);
        expect(softBody.sourceKind).toBe('WORKER_MARKED_ABSENT');
        expect(softBody.decisionId).toBeTruthy();

        // SupervisorDecision row created with correct kind + tier + payload
        const decisionRow = await prisma.supervisorDecision.findUniqueOrThrow({
          where: { id: softBody.decisionId },
        });
        expect(decisionRow.kind).toBe('LATE_REVERSAL_REQUEST');
        expect(decisionRow.tier).toBe('OPERATIONAL');
        expect(decisionRow.targetId).toBe(oldAuditId);
        const decisionPayload = decisionRow.payload as Record<string, unknown>;
        expect(decisionPayload.sourceAuditEventId).toBe(oldAuditId);
        expect(decisionPayload.sourceKind).toBe('WORKER_MARKED_ABSENT');
        expect(decisionPayload.note).toBe('Worker just called — please reverse.');

        // Compensating audit row
        const lateReversalAudit = await prisma.auditEvent.findFirstOrThrow({
          where: {
            companyId: tenantA.companyId,
            kind: 'ACTIVITY_LATE_REVERSAL_REQUESTED',
            targetId: oldAuditId,
          },
        });
        const latePayloadParse = ActivityLateReversalRequestedPayloadSchema.safeParse(
          lateReversalAudit.payload,
        );
        expect(latePayloadParse.success).toBe(true);
        if (latePayloadParse.success) {
          expect(latePayloadParse.data.decisionId).toBe(softBody.decisionId);
          expect(latePayloadParse.data.sourceKind).toBe('WORKER_MARKED_ABSENT');
        }

        // ── 8. Window-OPEN soft-flag attempt → 422 WINDOW_OPEN ─────────
        const freshAuditId = await seedAbsence(
          supA.userId,
          new Date(Date.now() - 60 * 1000),
          new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10),
        );
        const softOpen = await app.inject({
          method: 'POST',
          url: `/activity/${freshAuditId}/soft-flag`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {},
        });
        expect(softOpen.statusCode).toBe(422);
        expect((softOpen.json() as { error: string }).error).toBe('WINDOW_OPEN');

        // ── 8b. C-C dead-end fix (walk 2026-06-11): a NON-reversible kind
        //      INSIDE the window must have a path. Before the fix it hit a
        //      wall on BOTH endpoints — /reverse → 422 KIND_NOT_REVERSIBLE
        //      AND /soft-flag → 422 WINDOW_OPEN — leaving the supervisor with
        //      no way to escalate. HR review is the ONLY path for a kind that
        //      has no direct undo, so soft-flag must accept it regardless of
        //      the window. (Reversible kinds keep the WINDOW_OPEN rejection —
        //      proven by §8 above — so they use Reverse while they can.)
        const inWindowComplaint = await prisma.auditEvent.create({
          data: {
            companyId: tenantA.companyId,
            kind: 'SITE_COMPLAINT_LOGGED', // not in REVERSIBLE_ACTIVITY_KINDS
            actorId: supA.userId,
            targetId: site.id,
            payload: { note: 'gate left unlocked' },
            createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 min ago — in window
          },
        });

        // Wall 1 — /reverse refuses a non-reversible kind (no direct undo).
        const ccReverse = await app.inject({
          method: 'POST',
          url: `/activity/${inWindowComplaint.id}/reverse`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: {},
        });
        expect(ccReverse.statusCode).toBe(422);
        expect((ccReverse.json() as { error: string }).error).toBe('KIND_NOT_REVERSIBLE');

        // Wall 2 (now a door) — /soft-flag accepts it even though the window
        // is open, because HR is the only path for this kind.
        const ccSoft = await app.inject({
          method: 'POST',
          url: `/activity/${inWindowComplaint.id}/soft-flag`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `cc-soft-${inWindowComplaint.id}-1`,
          },
          payload: { note: 'Please review — logged in error.' },
        });
        expect(ccSoft.statusCode).toBe(200);
        const ccSoftBody = ccSoft.json() as {
          ok: true;
          decisionId: string;
          sourceAuditEventId: string;
          sourceKind: string;
        };
        expect(ccSoftBody.sourceAuditEventId).toBe(inWindowComplaint.id);
        expect(ccSoftBody.sourceKind).toBe('SITE_COMPLAINT_LOGGED');

        // The HR-review decision row really exists with the right shape.
        const ccDecision = await prisma.supervisorDecision.findUniqueOrThrow({
          where: { id: ccSoftBody.decisionId },
        });
        expect(ccDecision.kind).toBe('LATE_REVERSAL_REQUEST');
        expect(ccDecision.tier).toBe('OPERATIONAL');
        expect(ccDecision.targetId).toBe(inWindowComplaint.id);
        expect((ccDecision.payload as Record<string, unknown>).sourceKind).toBe(
          'SITE_COMPLAINT_LOGGED',
        );

        // ── 8c. Duplicate guard (adversarial review of 242eb6b): a second
        //      soft-flag of the SAME source — with a DIFFERENT Idempotency-Key,
        //      as the mobile app sends on every deliberate re-tap — must NOT
        //      pile up a second LATE_REVERSAL_REQUEST. It returns the existing
        //      OPEN decision idempotently, leaving exactly one row. (Reverse has
        //      its ALREADY_REVERSED guard; soft-flag had none.)
        const ccSoftAgain = await app.inject({
          method: 'POST',
          url: `/activity/${inWindowComplaint.id}/soft-flag`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `cc-soft-${inWindowComplaint.id}-2`, // DIFFERENT key
          },
          payload: { note: 'tapped again by mistake' },
        });
        expect(ccSoftAgain.statusCode).toBe(200);
        // Same decision returned — not a fresh one.
        expect((ccSoftAgain.json() as { decisionId: string }).decisionId).toBe(
          ccSoftBody.decisionId,
        );
        // DB: exactly ONE LATE_REVERSAL_REQUEST decision for this source.
        const ccDupeCount = await prisma.supervisorDecision.count({
          where: {
            companyId: tenantA.companyId,
            kind: 'LATE_REVERSAL_REQUEST',
            targetId: inWindowComplaint.id,
          },
        });
        expect(ccDupeCount).toBe(1);

        // ── 9. Bad input (extra unknown key) → 400 ─────────────────────
        const badInput = await app.inject({
          method: 'POST',
          url: `/activity/${oldAuditId}/soft-flag`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: { unknownField: 'should reject' },
        });
        expect(badInput.statusCode).toBe(400);
        expect((badInput.json() as { error: string }).error).toBe('BAD_INPUT');

        // Tidy up the audit-and-data fixtures we created. Worker/Site
        // delete cascades will pick up the rest at company-delete time.
        await prisma.attendance.deleteMany({ where: { companyId: tenantA.companyId } });
        await prisma.supervisorDecision.deleteMany({
          where: { companyId: tenantA.companyId },
        });
        await prisma.site.delete({ where: { id: site.id } });
        await prisma.worker.delete({ where: { id: workerAId } });
      },
    );
  }, 120000);
});
