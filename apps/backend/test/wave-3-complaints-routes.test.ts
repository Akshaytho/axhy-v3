/**
 * Wave 3 — complaint thread routes integration tests.
 *
 * Exercises:
 *   1. Cross-tenant isolation on all five endpoints
 *        (GET /complaints, GET /complaints/:id, POST messages,
 *         POST messages/:msgId/read, POST resolve).
 *   2. Happy path: create → list → fetch thread → reply → resolve.
 *   3. Race-safe read receipts: concurrent mark-read returns
 *      `wasAlreadyRead=true` on the second caller without underflow.
 *   4. Append-message terminal-state guard.
 *
 * Uses real Railway Postgres. Auto-cleanup at the end of the run.
 *
 * @derives(panel-2026-05-18) — Wave 3 backend
 */

import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { injectAuthed } from './_helpers/route-helpers.js';
import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `wave3-${Date.now()}-`;

afterAll(async () => {
  await prisma.complaintMessageRead.deleteMany({
    where: { companyId: { in: [] } },
  });
  await prisma.$disconnect();
});

describe('Wave 3 — complaint thread routes', () => {
  it('cross-tenant isolation + happy path + race-safe read receipts', async () => {
    await withMultipleTenants(
      { count: 2, supervisorsPerTenant: 1, prefix: TEST_PREFIX, prisma },
      async ({ tenants, app }) => {
        const [tenantA, tenantB] = tenants;
        if (!tenantA || !tenantB) throw new Error('seed produced fewer tenants than expected');
        const supA = tenantA.supervisors[0]!;
        const supB = tenantB.supervisors[0]!;

        // Seed a site in tenant A; create a complaint via the existing
        // direct-button route (covers the unchanged sites.ts path under
        // Wave 3 schema additions).
        const siteA = await prisma.site.create({
          data: { companyId: tenantA.companyId, name: 'Aparna A-block', state: 'ACTIVE' },
        });
        const siteB = await prisma.site.create({
          data: { companyId: tenantB.companyId, name: 'Other tenant site', state: 'ACTIVE' },
        });

        const createRes = await injectAuthed(app, supA, {
          method: 'POST',
          url: `/sites/${siteA.id}/complaints`,
          body: {
            text: 'lobby missed at 11 AM, client complained',
            severity: 'MEDIUM',
          },
        });
        expect(createRes.statusCode).toBe(200);
        const created = createRes.json() as { complaintId: string };
        const complaintId = created.complaintId;
        expect(typeof complaintId).toBe('string');

        // Verify schema-level state defaulted to OPEN.
        const row = await prisma.complaint.findUnique({ where: { id: complaintId } });
        expect(row?.state).toBe('OPEN');
        expect(row?.kind).toBe('other');
        expect(row?.createdByUserId).toBe(supA.userId);

        // GET /complaints — supervisor A sees their own complaint.
        const listA = await injectAuthed(app, supA, {
          method: 'GET',
          url: `/complaints?limit=10`,
        });
        expect(listA.statusCode).toBe(200);
        const listABody = listA.json() as {
          complaints: Array<{ id: string; siteName: string; state: string }>;
        };
        expect(listABody.complaints.some((c) => c.id === complaintId)).toBe(true);

        // Cross-tenant: supervisor B sees zero rows.
        const listB = await injectAuthed(app, supB, {
          method: 'GET',
          url: `/complaints?limit=10`,
        });
        expect(listB.statusCode).toBe(200);
        const listBBody = listB.json() as { complaints: Array<{ id: string }> };
        expect(listBBody.complaints.find((c) => c.id === complaintId)).toBeUndefined();

        // Cross-tenant: supervisor B cannot fetch supervisor A's complaint.
        const fetchBOnA = await injectAuthed(app, supB, {
          method: 'GET',
          url: `/complaints/${complaintId}`,
        });
        expect(fetchBOnA.statusCode).toBe(404);

        // Supervisor A fetches their own complaint thread.
        const fetchA = await injectAuthed(app, supA, {
          method: 'GET',
          url: `/complaints/${complaintId}`,
        });
        expect(fetchA.statusCode).toBe(200);
        const thread = fetchA.json() as {
          complaint: { id: string };
          messages: Array<{ id: string; authorRole: string }>;
        };
        // sites.ts direct-button route did NOT create an initial
        // ComplaintMessage in Wave 3 schema (it predates threading). The
        // thread starts empty; chat-route flow seeds the initial message.
        expect(thread.complaint.id).toBe(complaintId);

        // Supervisor A appends a reply.
        const replyA = await injectAuthed(app, supA, {
          method: 'POST',
          url: `/complaints/${complaintId}/messages`,
          body: { body: 'Called client back, they are calmer now.' },
        });
        expect(replyA.statusCode).toBe(201);
        const replyABody = replyA.json() as { messageId: string };
        const messageId = replyABody.messageId;
        expect(typeof messageId).toBe('string');

        // Cross-tenant: supervisor B cannot reply.
        const replyB = await injectAuthed(app, supB, {
          method: 'POST',
          url: `/complaints/${complaintId}/messages`,
          body: { body: 'should not write' },
        });
        expect(replyB.statusCode).toBe(404);

        // Cross-tenant: supervisor B cannot mark-read.
        const readB = await injectAuthed(app, supB, {
          method: 'POST',
          url: `/complaints/${complaintId}/messages/${messageId}/read`,
        });
        expect(readB.statusCode).toBe(404);

        // Race-safe mark-read: kick off two concurrent reads from supervisor A.
        // Both should succeed (HTTP 200); exactly one returns
        // wasAlreadyRead=false and the other returns wasAlreadyRead=true.
        const [r1, r2] = await Promise.all([
          injectAuthed(app, supA, {
            method: 'POST',
            url: `/complaints/${complaintId}/messages/${messageId}/read`,
          }),
          injectAuthed(app, supA, {
            method: 'POST',
            url: `/complaints/${complaintId}/messages/${messageId}/read`,
          }),
        ]);
        expect(r1.statusCode).toBe(200);
        expect(r2.statusCode).toBe(200);
        const r1b = r1.json() as { wasAlreadyRead: boolean };
        const r2b = r2.json() as { wasAlreadyRead: boolean };
        // Exactly one race-winner; the other returns the idempotent flag.
        // Order between the two is non-deterministic — assert XOR.
        expect(r1b.wasAlreadyRead !== r2b.wasAlreadyRead).toBe(true);

        // Cross-tenant: supervisor B cannot resolve.
        const resolveB = await injectAuthed(app, supB, {
          method: 'POST',
          url: `/complaints/${complaintId}/resolve`,
        });
        expect(resolveB.statusCode).toBe(404);

        // Supervisor A resolves.
        const resolveA = await injectAuthed(app, supA, {
          method: 'POST',
          url: `/complaints/${complaintId}/resolve`,
        });
        expect(resolveA.statusCode).toBe(200);
        const resolveABody = resolveA.json() as { resolvedAt: string };
        expect(typeof resolveABody.resolvedAt).toBe('string');

        // Second resolve attempt returns ALREADY_TERMINAL.
        const resolveA2 = await injectAuthed(app, supA, {
          method: 'POST',
          url: `/complaints/${complaintId}/resolve`,
        });
        expect(resolveA2.statusCode).toBe(409);

        // Append after resolve returns COMPLAINT_TERMINAL.
        const replyAfterResolve = await injectAuthed(app, supA, {
          method: 'POST',
          url: `/complaints/${complaintId}/messages`,
          body: { body: 'late reply should fail' },
        });
        expect(replyAfterResolve.statusCode).toBe(409);

        // FK-aware cleanup for rows the test helper does not know about.
        await prisma.complaintMessageRead.deleteMany({
          where: { companyId: { in: [tenantA.companyId, tenantB.companyId] } },
        });
        await prisma.complaintMessage.deleteMany({
          where: { companyId: { in: [tenantA.companyId, tenantB.companyId] } },
        });
        await prisma.complaint.deleteMany({
          where: { companyId: { in: [tenantA.companyId, tenantB.companyId] } },
        });
        await prisma.site.deleteMany({
          where: { id: { in: [siteA.id, siteB.id] } },
        });
      },
    );
  }, 120_000);
});
