/**
 * Integration tests for POST /super-admin/companies (customer onboarding).
 *
 * Covers:
 *  - 401 without Authorization header
 *  - 403 FORBIDDEN_WRONG_ROLE when caller is OWNER (not SUPER_ADMIN)
 *  - 200 happy path: SUPER_ADMIN creates a Company AND its first OWNER, owner
 *    is loginable (User row exists by ownerPhone), COMPANY_CREATED audit written
 *  - 409 SLUG_EXISTS on a duplicate slug
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
  role: 'OWNER' | 'SUPER_ADMIN';
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

async function cleanupCompany(companyId: string, ownerUserId: string): Promise<void> {
  await prisma.auditEvent.deleteMany({ where: { companyId } });
  await prisma.membership.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: ownerUserId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

describe('POST /super-admin/companies', () => {
  it('401 without Authorization header', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sac-noauth-${Date.now()}-`, prisma },
      async ({ app }) => {
        const res = await app.inject({
          method: 'POST',
          url: '/super-admin/companies',
          headers: { 'content-type': 'application/json' },
          payload: { name: 'Acme Cleaning', ownerPhone: randPhone(), ownerName: 'Owner' },
        });
        expect(res.statusCode).toBe(401);
      },
    );
  });

  it('403 FORBIDDEN_WRONG_ROLE when caller is OWNER', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sac-role-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: tenant.supervisors[0]!.userId,
          companyId: tenant.companyId,
          role: 'OWNER',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/super-admin/companies',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { name: 'Acme Cleaning', ownerPhone: randPhone(), ownerName: 'Owner' },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('FORBIDDEN_WRONG_ROLE');
      },
    );
  });

  it('200 SUPER_ADMIN creates company + bootstraps OWNER (happy path)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sac-ok-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: randomUUID(),
          companyId: tenant.companyId,
          role: 'SUPER_ADMIN',
        });
        const ownerPhone = randPhone();
        const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const res = await app.inject({
          method: 'POST',
          url: '/super-admin/companies',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: {
            name: `Test Cleaning ${uniq}`,
            slug: `test-cleaning-${uniq}`,
            ownerPhone,
            ownerName: 'Test Owner',
          },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.companyId).toBeTruthy();
        expect(body.ownerMembershipId).toBeTruthy();
        expect(body.ownerUserId).toBeTruthy();

        const company = await prisma.company.findUnique({ where: { id: body.companyId } });
        expect(company).not.toBeNull();
        expect(company!.status).toBe('ACTIVE');
        expect(company!.ownerPhone).toBe(ownerPhone);

        const owner = await prisma.membership.findUnique({ where: { id: body.ownerMembershipId } });
        expect(owner!.role).toBe('OWNER');
        expect(owner!.status).toBe('ACTIVE');

        // Owner is loginable: a User row exists for ownerPhone and matches.
        const user = await prisma.user.findFirst({ where: { phone: ownerPhone } });
        expect(user!.id).toBe(body.ownerUserId);

        const audit = await prisma.auditEvent.findFirst({
          where: { companyId: body.companyId, kind: 'COMPANY_CREATED' },
        });
        expect(audit).not.toBeNull();

        await cleanupCompany(body.companyId, body.ownerUserId);
      },
    );
  });

  it('409 SLUG_EXISTS on duplicate slug', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `sac-dup-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const token = await issueTokenAs({
          userId: randomUUID(),
          companyId: tenant.companyId,
          role: 'SUPER_ADMIN',
        });
        const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const slug = `dup-slug-${uniq}`;
        const first = await app.inject({
          method: 'POST',
          url: '/super-admin/companies',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { name: `Dup A ${uniq}`, slug, ownerPhone: randPhone(), ownerName: 'A' },
        });
        expect(first.statusCode).toBe(200);
        const fb = first.json();

        const second = await app.inject({
          method: 'POST',
          url: '/super-admin/companies',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          payload: { name: `Dup B ${uniq}`, slug, ownerPhone: randPhone(), ownerName: 'B' },
        });
        expect(second.statusCode).toBe(409);
        expect(second.json().error).toBe('SLUG_EXISTS');

        await cleanupCompany(fb.companyId, fb.ownerUserId);
      },
    );
  });
});
