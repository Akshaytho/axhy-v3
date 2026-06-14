/**
 * withMultipleTenants — multi-tenant test scaffold.
 *
 * Default 5 tenants × 2 supervisors. Each tenant has its own Company,
 * Users (one per supervisor), Memberships, and pre-issued JWTs. Use this
 * for ANY test that touches `companyId`-scoped Prisma models so cross-
 * tenant isolation gets proven by construction.
 *
 * Replaces ~50-80 lines of beforeAll/afterAll boilerplate per test file
 * with a single closure. Cleanup is FK-aware: deletes ChatThread →
 * ChatMessage → Outbox → AuditEvent → LivingDoc → Membership → User →
 * Company in the right order.
 *
 * Override per test:
 *   await withMultipleTenants({ count: 50 }, async ({ tenants, app }) => { ... })
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 * @derives(panel-2026-05-10) — Wave 4b Phase 2.5 cleanup
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import { deleteCompanyDeep } from './delete-company-deep.js';

export type Supervisor = {
  userId: string;
  phone: string;
  name: string;
  accessToken: string;
  membershipId: string;
};

export type Tenant = {
  companyId: string;
  companyName: string;
  companySlug: string;
  ownerPhone: string;
  supervisors: Supervisor[];
};

export type WithMultipleTenantsCtx = {
  tenants: Tenant[];
  app: FastifyInstance;
  prisma: PrismaClient;
};

export type WithMultipleTenantsOpts = {
  /** Number of tenant Companies to create. Default 5. */
  count?: number;
  /** Supervisors per tenant. Default 2. */
  supervisorsPerTenant?: number;
  /** Prefix for company/user names (and uniqueness). Default `multi-${Date.now()}-`. */
  prefix?: string;
  /** Existing PrismaClient to reuse (avoids reconnect overhead in test runs). */
  prisma: PrismaClient;
};

const DEFAULT_COUNT = 5;
const DEFAULT_SUPERVISORS_PER_TENANT = 2;

/**
 * Run `fn` with a fresh fleet of tenants. Auto-cleanup runs even if `fn`
 * throws so tests don't leak state.
 */
export async function withMultipleTenants(
  opts: WithMultipleTenantsOpts,
  fn: (ctx: WithMultipleTenantsCtx) => Promise<void>,
): Promise<void> {
  // Set required env BEFORE importing server modules
  process.env.AXHY_OTP_BYPASS = process.env.AXHY_OTP_BYPASS ?? '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const { buildServer } = await import('../../src/server.js');
  const { issueAccessToken } = await import('../../src/lib/jwt.js');

  const count = opts.count ?? DEFAULT_COUNT;
  const supervisorsPerTenant = opts.supervisorsPerTenant ?? DEFAULT_SUPERVISORS_PER_TENANT;
  const prefix = opts.prefix ?? `multi-${Date.now()}-`;
  const { prisma } = opts;

  const app = await buildServer();
  await app.ready();

  const tenants: Tenant[] = [];
  // Track companyIds for cleanup even on partial setup failure.
  const createdCompanyIds: string[] = [];

  try {
    // Sequential creation — Postgres handles parallel inserts fine but
    // sequential keeps the per-test seed log readable in CI failures.
    for (let i = 0; i < count; i++) {
      const companyName = `${prefix}co-${i}`;
      const companySlug = `${prefix}slug-${i}`;
      const ownerPhone = `+9101${String(Date.now() + i).slice(-8)}`;

      const company = await prisma.company.create({
        data: {
          name: companyName,
          slug: companySlug,
          ownerPhone,
          ownerName: `Owner ${i}`,
        },
      });
      createdCompanyIds.push(company.id);

      const supervisors: Supervisor[] = [];
      for (let j = 0; j < supervisorsPerTenant; j++) {
        const phone = `+9199${String(Date.now() + i * 100 + j).slice(-8)}`;
        const name = `Sup ${i}-${j}`;

        const user = await prisma.user.create({
          data: { phone, name, locale: 'en' },
        });

        const membership = await prisma.membership.create({
          data: {
            companyId: company.id,
            userId: user.id,
            role: 'SUPERVISOR',
            status: 'ACTIVE',
          },
        });

        const accessToken = await issueAccessToken({
          userId: user.id,
          companyId: company.id,
          role: 'SUPERVISOR',
          availableRoles: ['SUPERVISOR'],
          locale: 'en',
        });

        supervisors.push({
          userId: user.id,
          phone,
          name,
          accessToken,
          membershipId: membership.id,
        });
      }

      tenants.push({
        companyId: company.id,
        companyName,
        companySlug,
        ownerPhone,
        supervisors,
      });
    }

    await fn({ tenants, app, prisma });
  } finally {
    // FK-aware cleanup (children before parents). Wrapped in try so cleanup
    // never throws (a partial-setup failure shouldn't mask the original error).
    try {
      const companyIdFilter = { in: createdCompanyIds };
      const userIdFilter = {
        in: tenants.flatMap((t) => t.supervisors.map((s) => s.userId)),
      };

      // Order matters: ChatMessage → ChatThread, child rows first.
      await prisma.chatMessage.deleteMany({ where: { companyId: companyIdFilter } });
      await prisma.chatThread.deleteMany({ where: { companyId: companyIdFilter } });
      await prisma.outbox.deleteMany({ where: { companyId: companyIdFilter } });
      await prisma.auditEvent.deleteMany({ where: { companyId: companyIdFilter } });
      await prisma.livingDoc.deleteMany({ where: { companyId: companyIdFilter } });
      await prisma.calendarEntry.deleteMany({ where: { companyId: companyIdFilter } });
      await prisma.assignment.deleteMany({ where: { companyId: companyIdFilter } });
      await prisma.membership.deleteMany({ where: { companyId: companyIdFilter } });
      if (userIdFilter.in.length > 0) {
        await prisma.user.deleteMany({ where: { id: userIdFilter } });
      }
      // Migration 031: Visit/Attendance/AuditEvent company FKs are RESTRICT.
      // deleteCompanyDeep clears those legal-trail tables (e.g. visits a test
      // created inside the closure) before deleting the company.
      await deleteCompanyDeep(prisma, { ids: createdCompanyIds });
    } catch (cleanupErr) {
      // Surface but don't rethrow — leak debugging > masking original error.

      console.error('[withMultipleTenants] cleanup error (non-fatal):', cleanupErr);
    }
    await app.close();
  }
}
