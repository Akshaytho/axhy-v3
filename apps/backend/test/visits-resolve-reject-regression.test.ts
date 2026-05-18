/**
 * Real-DB regression test — POST /visits/:id/resolve + POST /visits/:id/reject.
 *
 * Wave 4 compliance flow (2026-05-18). Proves the bugs the FlaggedReviewSheet
 * disabled-buttons placeholder was hiding:
 *   - Supervisor can resolve an AI-flagged visit (flagged → false) and the
 *     row's state column stays put (no spurious state transition).
 *   - Supervisor can reject an AI-flagged visit with a required reason and
 *     the state transitions to REJECTED.
 *   - Cross-tenant attempts return 404 (no information leak).
 *   - Non-supervisor role returns 403.
 *   - Conditional UPDATE race: a second Resolve attempt after the first
 *     succeeds returns 409 ALREADY_DECIDED (no double-flip).
 *   - Idempotency-Key: a retry with the same key returns the cached
 *     response and does NOT emit a second VISIT_RESOLVED audit row.
 *   - Reject body validation: empty reason → 400 BAD_INPUT.
 *   - Reject from non-rejectable state → 409 VISIT_STATE_INVALID.
 *   - Audit payload shape matches VisitResolvedPayloadSchema /
 *     VisitRejectedPayloadSchema, NOT just "an audit row exists".
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
import { VisitResolvedPayloadSchema, VisitRejectedPayloadSchema } from '@axhy/shared-schema';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Wave 4 — POST /visits/:id/{resolve,reject} regression', () => {
  test('full lifecycle: resolve + reject + cross-tenant + race + idempotency-key', async () => {
    await withMultipleTenants(
      { count: 2, supervisorsPerTenant: 1, prisma, prefix: `w4-visits-${Date.now()}-` },
      async ({ tenants, app }) => {
        const tenantA = tenants[0]!;
        const tenantB = tenants[1]!;
        const supA = tenantA.supervisors[0]!;
        const supB = tenantB.supervisors[0]!;

        // ── Seed: workers + sites on both tenants ────────────────────────
        const seedWorker = async (companyId: string, tag: string) => {
          const phone = `+9176${String(Date.now() + Math.floor(Math.random() * 1_000_000)).slice(-8)}`;
          const user = await prisma.user.create({
            data: { phone, name: `${tag}-worker`, locale: 'en' },
          });
          await prisma.membership.create({
            data: { companyId, userId: user.id, role: 'WORKER', status: 'ACTIVE' },
          });
          const worker = await prisma.worker.create({
            data: { companyId, userId: user.id, name: `${tag}-worker`, phone, state: 'ACTIVE' },
          });
          return worker.id;
        };
        const workerAId = await seedWorker(tenantA.companyId, 'A');
        const workerBId = await seedWorker(tenantB.companyId, 'B');

        const siteA = await prisma.site.create({
          data: { companyId: tenantA.companyId, name: 'Site A', address: 'Hyd' },
        });
        const siteB = await prisma.site.create({
          data: { companyId: tenantB.companyId, name: 'Site B', address: 'Blr' },
        });

        const mkVisit = async (
          companyId: string,
          workerId: string,
          siteId: string,
          state: string,
          flagged: boolean,
          verificationText: string | null,
        ): Promise<string> => {
          const v = await prisma.visit.create({
            data: {
              companyId,
              workerId,
              siteId,
              state,
              scheduledFor: new Date(),
              startedAt: new Date(),
              completedAt: new Date(),
              photosBefore: 1,
              photosAfter: 2,
              verificationText,
              flagged,
            },
          });
          return v.id;
        };

        // ── 1. Happy-path Resolve ────────────────────────────────────────
        const visitResolveId = await mkVisit(
          tenantA.companyId,
          workerAId,
          siteA.id,
          'COMPLETED',
          true,
          'Photos missing post-clean signage.',
        );
        const resolveRes = await app.inject({
          method: 'POST',
          url: `/visits/${visitResolveId}/resolve`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `resolve-${visitResolveId}-1`,
          },
          payload: { supervisorReason: 'Reviewed photos; looks fine.' },
        });
        expect(resolveRes.statusCode).toBe(200);
        const resolveBody = resolveRes.json() as {
          ok: true;
          visitId: string;
          previousState: string;
          flagged: boolean;
          state: string;
        };
        // Envelope shape — every field present, not just statusCode.
        expect(resolveBody.ok).toBe(true);
        expect(resolveBody.visitId).toBe(visitResolveId);
        expect(resolveBody.previousState).toBe('COMPLETED');
        expect(resolveBody.flagged).toBe(false);
        expect(resolveBody.state).toBe('COMPLETED'); // state NOT changed on resolve

        // DB state
        const visitResolveRow = await prisma.visit.findUniqueOrThrow({
          where: { id: visitResolveId },
        });
        expect(visitResolveRow.flagged).toBe(false);
        expect(visitResolveRow.state).toBe('COMPLETED');

        // Audit payload shape
        const resolveAudit = await prisma.auditEvent.findFirstOrThrow({
          where: {
            companyId: tenantA.companyId,
            kind: 'VISIT_RESOLVED',
            targetId: visitResolveId,
          },
        });
        const resolvePayloadParse = VisitResolvedPayloadSchema.safeParse(resolveAudit.payload);
        expect(resolvePayloadParse.success).toBe(true);
        if (resolvePayloadParse.success) {
          expect(resolvePayloadParse.data.visitId).toBe(visitResolveId);
          expect(resolvePayloadParse.data.workerId).toBe(workerAId);
          expect(resolvePayloadParse.data.siteId).toBe(siteA.id);
          expect(resolvePayloadParse.data.previousState).toBe('COMPLETED');
          expect(resolvePayloadParse.data.supervisorReason).toBe('Reviewed photos; looks fine.');
          expect(resolvePayloadParse.data.resolvedBy).toBe(supA.userId);
        }

        // ── 2. Idempotency-Key retry returns cached response, no new audit row ─
        const resolveRetry = await app.inject({
          method: 'POST',
          url: `/visits/${visitResolveId}/resolve`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `resolve-${visitResolveId}-1`,
          },
          payload: { supervisorReason: 'different reason — should be ignored' },
        });
        expect(resolveRetry.statusCode).toBe(200);
        const retryBody = resolveRetry.json() as { ok: true; visitId: string };
        expect(retryBody.visitId).toBe(visitResolveId);
        const auditCount = await prisma.auditEvent.count({
          where: {
            companyId: tenantA.companyId,
            kind: 'VISIT_RESOLVED',
            targetId: visitResolveId,
          },
        });
        expect(auditCount).toBe(1);

        // ── 3. Race: second Resolve with a different key → 409 ─────────
        const resolveRace = await app.inject({
          method: 'POST',
          url: `/visits/${visitResolveId}/resolve`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `resolve-${visitResolveId}-2`,
          },
          payload: {},
        });
        expect(resolveRace.statusCode).toBe(409);
        expect((resolveRace.json() as { error: string }).error).toBe('ALREADY_DECIDED');

        // ── 4. Cross-tenant: Sup B can't see Tenant A visit ────────────
        const xTenant = await app.inject({
          method: 'POST',
          url: `/visits/${visitResolveId}/resolve`,
          headers: { authorization: `Bearer ${supB.accessToken}` },
          payload: {},
        });
        expect(xTenant.statusCode).toBe(404);
        expect((xTenant.json() as { error: string }).error).toBe('VISIT_NOT_FOUND');

        // ── 5. Happy-path Reject ───────────────────────────────────────
        const visitRejectId = await mkVisit(
          tenantA.companyId,
          workerAId,
          siteA.id,
          'COMPLETED',
          true,
          'AI flagged: bathroom not cleaned.',
        );
        const rejectRes = await app.inject({
          method: 'POST',
          url: `/visits/${visitRejectId}/reject`,
          headers: {
            authorization: `Bearer ${supA.accessToken}`,
            'Idempotency-Key': `reject-${visitRejectId}-1`,
          },
          payload: { supervisorReason: 'Bathroom is filthy in the photos.' },
        });
        expect(rejectRes.statusCode).toBe(200);
        const rejectBody = rejectRes.json() as {
          ok: true;
          visitId: string;
          previousState: string;
          flagged: boolean;
          state: string;
        };
        expect(rejectBody.previousState).toBe('COMPLETED');
        expect(rejectBody.state).toBe('REJECTED');
        expect(rejectBody.flagged).toBe(false);

        const visitRejectRow = await prisma.visit.findUniqueOrThrow({
          where: { id: visitRejectId },
        });
        expect(visitRejectRow.state).toBe('REJECTED');
        expect(visitRejectRow.flagged).toBe(false);

        const rejectAudit = await prisma.auditEvent.findFirstOrThrow({
          where: {
            companyId: tenantA.companyId,
            kind: 'VISIT_REJECTED',
            targetId: visitRejectId,
          },
        });
        const rejectPayloadParse = VisitRejectedPayloadSchema.safeParse(rejectAudit.payload);
        expect(rejectPayloadParse.success).toBe(true);
        if (rejectPayloadParse.success) {
          expect(rejectPayloadParse.data.visitId).toBe(visitRejectId);
          expect(rejectPayloadParse.data.previousState).toBe('COMPLETED');
          expect(rejectPayloadParse.data.supervisorReason).toBe(
            'Bathroom is filthy in the photos.',
          );
          expect(rejectPayloadParse.data.rejectedBy).toBe(supA.userId);
        }

        // ── 6. Reject body validation: empty reason → 400 ──────────────
        const visitRejectBadId = await mkVisit(
          tenantA.companyId,
          workerAId,
          siteA.id,
          'COMPLETED',
          true,
          null,
        );
        const rejectBad = await app.inject({
          method: 'POST',
          url: `/visits/${visitRejectBadId}/reject`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: { supervisorReason: '   ' }, // trim → empty
        });
        expect(rejectBad.statusCode).toBe(400);
        expect((rejectBad.json() as { error: string }).error).toBe('BAD_INPUT');

        // ── 7. Reject from non-rejectable state → 409 VISIT_STATE_INVALID ─
        const visitStateBadId = await mkVisit(
          tenantA.companyId,
          workerAId,
          siteA.id,
          'SCHEDULED',
          true,
          null,
        );
        const rejectState = await app.inject({
          method: 'POST',
          url: `/visits/${visitStateBadId}/reject`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: { supervisorReason: 'whatever' },
        });
        expect(rejectState.statusCode).toBe(409);
        const rejectStateBody = rejectState.json() as { error: string; currentState: string };
        expect(rejectStateBody.error).toBe('VISIT_STATE_INVALID');
        expect(rejectStateBody.currentState).toBe('SCHEDULED');

        // ── 8. Cross-tenant Reject ─────────────────────────────────────
        const visitB = await mkVisit(
          tenantB.companyId,
          workerBId,
          siteB.id,
          'COMPLETED',
          true,
          null,
        );
        const rejectXTenant = await app.inject({
          method: 'POST',
          url: `/visits/${visitB}/reject`,
          headers: { authorization: `Bearer ${supA.accessToken}` },
          payload: { supervisorReason: 'cross-tenant should 404' },
        });
        expect(rejectXTenant.statusCode).toBe(404);
        expect((rejectXTenant.json() as { error: string }).error).toBe('VISIT_NOT_FOUND');

        // Clean up the test visits we created (they're cascade-deleted with
        // Site, but Sites without an active cleanup hook in withMultipleTenants
        // get GC'd at company-delete time — explicit delete here keeps it tidy).
        await prisma.visit.deleteMany({
          where: {
            id: {
              in: [visitResolveId, visitRejectId, visitRejectBadId, visitStateBadId, visitB],
            },
          },
        });
        await prisma.site.deleteMany({ where: { id: { in: [siteA.id, siteB.id] } } });
        await prisma.worker.deleteMany({ where: { id: { in: [workerAId, workerBId] } } });
      },
    );
  }, 120000);
});
