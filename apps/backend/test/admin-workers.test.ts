/**
 * Integration tests for POST /admin/workers + /admin/workers/:id/anonymize.
 *
 * R2 (create worker):
 *  - 401 without Authorization
 *  - 403 caller is OWNER (only HR allowed)
 *  - 200 HR creates Worker (PENDING_ACTIVATION + Membership(WORKER))
 *
 * R3 (anonymize):
 *  - 404 worker not found
 *  - 200 HR anonymizes Worker (state=TERMINATED, userId=null, phone=anon:..., audit)
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

async function issueTokenAs(args: {
  userId: string;
  companyId: string;
  role: 'OWNER' | 'HR' | 'SUPERVISOR' | 'WORKER' | 'SUPER_ADMIN';
}): Promise<string> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  return issueAccessToken({
    userId: args.userId,
    companyId: args.companyId,
    role: args.role,
    availableRoles: [args.role],
    locale: 'en',
  });
}

describe('POST /admin/workers (R2)', () => {
  it('401 without Authorization header', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `wkr-noauth-${Date.now()}-`, prisma },
      async ({ app }) => {
        const res = await app.inject({
          method: 'POST',
          url: '/admin/workers',
          headers: { 'content-type': 'application/json' },
          payload: { phone: '+919999999991', name: 'Test W', baseSalaryPaise: 1_200_000 },
        });
        expect(res.statusCode).toBe(401);
      },
    );
  });

  it('403 caller is OWNER (HR-only route)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `wkr-owner-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'OWNER',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/admin/workers',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { phone: '+919999999992', name: 'Test W', baseSalaryPaise: 1_200_000 },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('FORBIDDEN_WRONG_ROLE');
      },
    );
  });

  it('200 HR creates Worker in PENDING_ACTIVATION', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `wkr-happy-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'HR',
        });
        const phone = `+9199${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, '0')}`;
        const res = await app.inject({
          method: 'POST',
          url: '/admin/workers',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            phone,
            name: 'Ramesh Kumar',
            baseSalaryPaise: 1_300_000,
            preferredLanguage: 'te',
          },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.state).toBe('PENDING_ACTIVATION');
        const created = await prisma.worker.findUnique({ where: { id: body.workerId } });
        expect(created!.state).toBe('PENDING_ACTIVATION');
        expect(created!.preferredLanguage).toBe('te');
        const membership = await prisma.membership.findUnique({ where: { id: body.membershipId } });
        expect(membership!.baseSalaryPaise).toBe(1_300_000);
        expect(membership!.role).toBe('WORKER');

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.worker.deleteMany({ where: { id: body.workerId } });
        await prisma.membership.deleteMany({ where: { id: body.membershipId } });
        await prisma.user.deleteMany({ where: { phone } });
      },
    );
  });
});

describe('POST /admin/workers/:id/anonymize (R3)', () => {
  it('404 when worker not found', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `wkr-anon-404-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'HR',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/admin/workers/00000000-0000-0000-0000-000000000000/anonymize',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { reason: 'left the job' },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe('WORKER_NOT_FOUND');
      },
    );
  });

  it('200 HR anonymizes Worker (state=TERMINATED, userId=null, phone hashed)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `wkr-anon-h-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const hrToken = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'HR',
        });
        const phone = `+9199${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, '0')}`;
        // Create the worker first via R2
        const createRes = await app.inject({
          method: 'POST',
          url: '/admin/workers',
          headers: { authorization: `Bearer ${hrToken}`, 'content-type': 'application/json' },
          payload: { phone, name: 'Resigner', baseSalaryPaise: 1_200_000 },
        });
        expect(createRes.statusCode).toBe(200);
        const { workerId, userId } = createRes.json();

        // Anonymize
        const anonRes = await app.inject({
          method: 'POST',
          url: `/admin/workers/${workerId}/anonymize`,
          headers: { authorization: `Bearer ${hrToken}`, 'content-type': 'application/json' },
          payload: { reason: 'employee resigned 2026-05-25' },
        });
        expect(anonRes.statusCode).toBe(200);

        const after = await prisma.worker.findUnique({ where: { id: workerId } });
        expect(after!.state).toBe('TERMINATED');
        expect(after!.userId).toBeNull();
        const user = await prisma.user.findUnique({ where: { id: userId } });
        expect(user!.phone.startsWith('anon:')).toBe(true);
        const membership = await prisma.membership.findFirst({
          where: { userId, companyId: tenant.companyId, role: 'WORKER' },
        });
        expect(membership!.status).toBe('INACTIVE');

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.worker.deleteMany({ where: { id: workerId } });
        await prisma.membership.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      },
    );
  });
});
