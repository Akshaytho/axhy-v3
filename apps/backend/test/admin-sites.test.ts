/**
 * Integration tests for POST /admin/sites (R4) + POST /admin/sites/:id/bindings (R5).
 *
 * R4:
 *  - 401 without Authorization
 *  - 403 caller is WORKER
 *  - 200 OWNER creates Site (state=DRAFT default)
 *
 * R5:
 *  - 404 site not found in this company
 *  - 404 supervisor not in this company
 *  - 200 HR binds existing Supervisor to Site
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

describe('POST /admin/sites (R4)', () => {
  it('401 without Authorization', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `site-noauth-${Date.now()}-`, prisma },
      async ({ app }) => {
        const res = await app.inject({
          method: 'POST',
          url: '/admin/sites',
          headers: { 'content-type': 'application/json' },
          payload: { name: 'IT Park C' },
        });
        expect(res.statusCode).toBe(401);
      },
    );
  });

  it('403 caller is WORKER', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `site-worker-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'WORKER',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/admin/sites',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { name: 'IT Park C' },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('FORBIDDEN_WRONG_ROLE');
      },
    );
  });

  it('200 OWNER creates Site (state=DRAFT)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `site-owner-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'OWNER',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/admin/sites',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { name: 'Apollo Hospital', address: 'Jubilee Hills' },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.state).toBe('DRAFT');
        const created = await prisma.site.findUnique({ where: { id: body.siteId } });
        expect(created!.name).toBe('Apollo Hospital');
        expect(created!.state).toBe('DRAFT');

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.site.deleteMany({ where: { id: body.siteId } });
      },
    );
  });
});

describe('POST /admin/sites/:id/bindings (R5)', () => {
  it('404 site not found in this company', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `bind-no-site-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'HR',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/admin/sites/00000000-0000-0000-0000-000000000000/bindings',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            supervisorUserId: tenant.supervisors[0]!.userId,
            effectiveFrom: new Date().toISOString(),
            reason: 'test bind',
          },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe('SITE_NOT_FOUND');
      },
    );
  });

  it('404 supervisor not in this company', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `bind-no-sup-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const hrToken = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'HR',
        });
        // Create a site first
        const siteRes = await app.inject({
          method: 'POST',
          url: '/admin/sites',
          headers: { authorization: `Bearer ${hrToken}`, 'content-type': 'application/json' },
          payload: { name: 'Site A' },
        });
        const siteId = siteRes.json().siteId;
        const fakeSupId = '00000000-0000-0000-0000-000000000001';
        const res = await app.inject({
          method: 'POST',
          url: `/admin/sites/${siteId}/bindings`,
          headers: { authorization: `Bearer ${hrToken}`, 'content-type': 'application/json' },
          payload: {
            supervisorUserId: fakeSupId,
            effectiveFrom: new Date().toISOString(),
            reason: 'test bind',
          },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe('SUPERVISOR_NOT_FOUND');

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.site.deleteMany({ where: { id: siteId } });
      },
    );
  });

  it('200 HR binds existing Supervisor to Site', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `bind-happy-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const supId = tenant.supervisors[0]!.userId;
        const hrToken = await issueTokenAs({
          userId: supId,
          companyId: tenant.companyId,
          role: 'HR',
        });
        // Create site
        const siteRes = await app.inject({
          method: 'POST',
          url: '/admin/sites',
          headers: { authorization: `Bearer ${hrToken}`, 'content-type': 'application/json' },
          payload: { name: 'Apollo Hospital' },
        });
        const siteId = siteRes.json().siteId;

        // Bind the supervisor (same User has SUPERVISOR membership from the fixture)
        const res = await app.inject({
          method: 'POST',
          url: `/admin/sites/${siteId}/bindings`,
          headers: { authorization: `Bearer ${hrToken}`, 'content-type': 'application/json' },
          payload: {
            supervisorUserId: supId,
            effectiveFrom: new Date().toISOString(),
            reason: 'Permanent portfolio: Apollo Hospital',
          },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        const binding = await prisma.siteSupervisorBinding.findUnique({
          where: { id: body.bindingId },
        });
        expect(binding!.siteId).toBe(siteId);
        expect(binding!.userId).toBe(supId);
        expect(binding!.createdBy).toBe(supId);

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.siteSupervisorBinding.deleteMany({ where: { id: body.bindingId } });
        await prisma.site.deleteMany({ where: { id: siteId } });
      },
    );
  });
});
