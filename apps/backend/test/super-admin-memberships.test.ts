/**
 * Integration tests for POST /super-admin/memberships.
 *
 * Covers:
 *  - 401 without Authorization header
 *  - 403 FORBIDDEN_WRONG_ROLE when caller is OWNER (not SUPER_ADMIN)
 *  - 200 happy path: SUPER_ADMIN creates OWNER in an existing tenant
 *  - 404 COMPANY_NOT_FOUND when companyId does not exist
 *  - 409 MEMBERSHIP_ALREADY_EXISTS on repeated call
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

function randPhone(): string {
  return `+9199${Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0')}`;
}

describe('POST /super-admin/memberships', () => {
  it('401 without Authorization header', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sao-noauth-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const res = await app.inject({
          method: 'POST',
          url: '/super-admin/memberships',
          headers: { 'content-type': 'application/json' },
          payload: {
            companyId: tenant.companyId,
            phone: randPhone(),
            name: 'New Owner',
            baseSalaryPaise: 10_000_000,
          },
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().error).toBe('AUTH_REQUIRED');
      },
    );
  });

  it('403 FORBIDDEN_WRONG_ROLE when caller is OWNER', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sao-owncal-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const token = await issueTokenAs({ userId, companyId: tenant.companyId, role: 'OWNER' });
        const res = await app.inject({
          method: 'POST',
          url: '/super-admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            companyId: tenant.companyId,
            phone: randPhone(),
            name: 'New Owner',
            baseSalaryPaise: 10_000_000,
          },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('FORBIDDEN_WRONG_ROLE');
      },
    );
  });

  it('200 SUPER_ADMIN creates OWNER (happy path)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sao-ok-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        // SUPER_ADMIN has no tenant — use a synthetic userId for the token.
        const callerUserId = randomUUID();
        const token = await issueTokenAs({
          userId: callerUserId,
          companyId: tenant.companyId,
          role: 'SUPER_ADMIN',
        });
        const newPhone = randPhone();
        const res = await app.inject({
          method: 'POST',
          url: '/super-admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            companyId: tenant.companyId,
            phone: newPhone,
            name: 'Bootstrap Owner',
            baseSalaryPaise: 10_000_000,
            bankIfsc: 'SBIN0000999',
            bankAcct: '0000999999',
          },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.role).toBe('OWNER');
        expect(body.status).toBe('ACTIVE');
        expect(body.companyId).toBe(tenant.companyId);

        const created = await prisma.membership.findUnique({ where: { id: body.membershipId } });
        expect(created).not.toBeNull();
        expect(created!.role).toBe('OWNER');
        expect(created!.baseSalaryPaise).toBe(10_000_000);
        expect(created!.bankIfsc).toBe('SBIN0000999');

        const audit = await prisma.auditEvent.findFirst({
          where: { companyId: tenant.companyId, kind: 'MEMBERSHIP_CREATED' },
        });
        expect(audit).not.toBeNull();

        // Cleanup
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.membership.deleteMany({ where: { id: body.membershipId } });
        await prisma.user.deleteMany({ where: { phone: newPhone } });
      },
    );
  });

  it('404 COMPANY_NOT_FOUND when companyId does not exist', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sao-404-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: randomUUID(),
          companyId: tenant.companyId,
          role: 'SUPER_ADMIN',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/super-admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            companyId: randomUUID(),
            phone: randPhone(),
            name: 'Ghost Owner',
            baseSalaryPaise: 10_000_000,
          },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe('COMPANY_NOT_FOUND');
      },
    );
  });

  it('409 MEMBERSHIP_ALREADY_EXISTS on repeated bootstrap', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sao-dup-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: randomUUID(),
          companyId: tenant.companyId,
          role: 'SUPER_ADMIN',
        });
        const newPhone = randPhone();
        const payload = {
          companyId: tenant.companyId,
          phone: newPhone,
          name: 'First Owner',
          baseSalaryPaise: 10_000_000,
        };
        const first = await app.inject({
          method: 'POST',
          url: '/super-admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload,
        });
        expect(first.statusCode).toBe(200);

        const second = await app.inject({
          method: 'POST',
          url: '/super-admin/memberships',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload,
        });
        expect(second.statusCode).toBe(409);
        expect(second.json().error).toBe('MEMBERSHIP_ALREADY_EXISTS');

        // Cleanup
        const firstBody = first.json();
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.membership.deleteMany({ where: { id: firstBody.membershipId } });
        await prisma.user.deleteMany({ where: { phone: newPhone } });
      },
    );
  });
});
