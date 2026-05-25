/**
 * Integration tests for POST /admin/memberships (R1).
 *
 * Covers:
 *  - 401 without Authorization header
 *  - 403 wrong caller role (SUPERVISOR tries to call /admin/memberships)
 *  - 403 FORBIDDEN_TARGET_ROLE (HR tries to create HR target, not allowed by hierarchy)
 *  - 200 happy path: OWNER creates HR
 *  - 200 happy path: HR creates SUPERVISOR
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { randomUUID } from 'node:crypto';

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

describe('POST /admin/memberships (R1)', () => {
  it('401 without Authorization header', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `mem-noauth-${Date.now()}-`, prisma },
      async ({ app }) => {
        const res = await app.inject({
          method: 'POST',
          url: '/admin/memberships',
          headers: { 'content-type': 'application/json' },
          payload: {
            phone: `+9199${randomUUID()
              .slice(0, 8)
              .replace(/[a-f-]/g, '0')}`,
            name: 'Test HR',
            role: 'HR',
            baseSalaryPaise: 5_000_000,
          },
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().error).toBe('AUTH_REQUIRED');
      },
    );
  });

  it('403 FORBIDDEN_WRONG_ROLE when caller is SUPERVISOR', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `mem-supcal-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const token = await issueTokenAs({
          userId,
          companyId: tenant.companyId,
          role: 'SUPERVISOR',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            phone: `+9199${randomUUID()
              .slice(0, 8)
              .replace(/[a-f-]/g, '0')}`,
            name: 'Test HR',
            role: 'HR',
            baseSalaryPaise: 5_000_000,
          },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('FORBIDDEN_WRONG_ROLE');
      },
    );
  });

  it('403 FORBIDDEN_TARGET_ROLE when HR tries to create HR', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `mem-hrhr-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const token = await issueTokenAs({ userId, companyId: tenant.companyId, role: 'HR' });
        const res = await app.inject({
          method: 'POST',
          url: '/admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            phone: `+9199${randomUUID()
              .slice(0, 8)
              .replace(/[a-f-]/g, '0')}`,
            name: 'Test HR',
            role: 'HR',
            baseSalaryPaise: 5_000_000,
          },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('FORBIDDEN_TARGET_ROLE');
      },
    );
  });

  it('200 OWNER creates HR (happy path)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `mem-ohh-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const token = await issueTokenAs({ userId, companyId: tenant.companyId, role: 'OWNER' });
        const newPhone = `+9199${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, '0')}`;
        const res = await app.inject({
          method: 'POST',
          url: '/admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            phone: newPhone,
            name: 'New HR',
            role: 'HR',
            baseSalaryPaise: 5_000_000,
            bankIfsc: 'SBIN0000123',
            bankAcct: '0000123456',
          },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.role).toBe('HR');
        expect(body.status).toBe('ACTIVE');
        const created = await prisma.membership.findUnique({ where: { id: body.membershipId } });
        expect(created).not.toBeNull();
        expect(created!.baseSalaryPaise).toBe(5_000_000);
        expect(created!.bankIfsc).toBe('SBIN0000123');

        // Cleanup
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.membership.deleteMany({ where: { id: body.membershipId } });
        await prisma.user.deleteMany({ where: { phone: newPhone } });
      },
    );
  });

  it('200 HR creates SUPERVISOR (happy path)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `mem-hsv-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const token = await issueTokenAs({ userId, companyId: tenant.companyId, role: 'HR' });
        const newPhone = `+9199${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, '0')}`;
        const res = await app.inject({
          method: 'POST',
          url: '/admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            phone: newPhone,
            name: 'New Supervisor',
            role: 'SUPERVISOR',
            baseSalaryPaise: 2_500_000,
          },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().role).toBe('SUPERVISOR');

        // Cleanup
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.membership.deleteMany({
          where: { companyId: tenant.companyId, role: 'SUPERVISOR', user: { phone: newPhone } },
        });
        await prisma.user.deleteMany({ where: { phone: newPhone } });
      },
    );
  });
});
