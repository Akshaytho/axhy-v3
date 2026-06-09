/**
 * Service for POST /super-admin/companies.
 *
 * Creates a Company (tenant) and bootstraps its first OWNER membership in
 * one transaction — the entry point of customer onboarding. The slug
 * defaults to a slugified name; a duplicate slug returns SLUG_EXISTS. The
 * OWNER is created via superAdminCreateOwnerService so hiring-authority
 * checks and audit emission stay identical to the standalone owner route.
 *
 * baseSalaryPaise is 0 for the OWNER: the business owner is the paying
 * customer, not a salaried worker.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { createHash } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';

import { superAdminCreateOwnerService } from './super-admin-owner-service.js';

/** @derives(ADR-0026) */
export type SuperAdminCreateCompanyServiceInput = {
  callerUserId: string;
  body: { name: string; slug?: string; ownerPhone: string; ownerName: string };
};

/** @derives(ADR-0026) */
export type SuperAdminCreateCompanyServiceOutput =
  | { kind: 'OK'; companyId: string; slug: string; ownerMembershipId: string; ownerUserId: string }
  | { kind: 'SLUG_EXISTS'; slug: string };

/** Lowercase, hyphenate, trim to the Company.slug shape. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (base.length >= 2) return base;
  // Non-ASCII (e.g. all-Hindi/Telugu) or too-short names slugify to '' or a
  // single char, which would collide across ALL such tenants (the 2nd one
  // could never onboard). Derive a stable, unique fallback from the name.
  return `co-${createHash('sha256').update(name).digest('hex').slice(0, 10)}`;
}

/** @derives(ADR-0026) */
export async function superAdminCreateCompanyService(
  tx: Prisma.TransactionClient,
  input: SuperAdminCreateCompanyServiceInput,
): Promise<SuperAdminCreateCompanyServiceOutput> {
  const slug = input.body.slug ?? slugify(input.body.name);

  let company: { id: string };
  try {
    company = await tx.company.create({
      data: {
        name: input.body.name,
        slug,
        ownerPhone: input.body.ownerPhone,
        ownerName: input.body.ownerName,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return { kind: 'SLUG_EXISTS', slug };
    }
    throw err;
  }

  // RLS: now that the new company row exists, scope the rest of this tx to it so the
  // COMPANY_CREATED audit + the bootstrap OWNER Membership INSERTs satisfy
  // tenant_isolation WITH CHECK when the app connects as axhy_app. No-op under postgres.
  await tx.$executeRawUnsafe(`SELECT set_config('axhy.current_company_id', $1, true)`, company.id);

  await recordAuditEvent(tx, {
    companyId: company.id,
    kind: 'COMPANY_CREATED',
    actorId: input.callerUserId,
    targetId: company.id,
    payload: {
      name: input.body.name,
      slug,
      ownerPhone: input.body.ownerPhone,
      ownerName: input.body.ownerName,
      bootstrappedBy: 'SUPER_ADMIN',
    },
  });

  // Bootstrap the first OWNER so the company is immediately usable: the owner
  // can log in via OTP to ownerPhone and start adding sites/workers.
  const owner = await superAdminCreateOwnerService(tx, {
    callerUserId: input.callerUserId,
    body: {
      companyId: company.id,
      phone: input.body.ownerPhone,
      name: input.body.ownerName,
      baseSalaryPaise: 0,
    },
  });

  if (owner.kind !== 'OK') {
    // Any non-OK owner bootstrap (ALREADY_EXISTS / FORBIDDEN_TARGET_ROLE /
    // COMPANY_NOT_* — none of which should legitimately occur for a company we
    // just created ACTIVE in this same tx) must roll back the company row so we
    // never leave an owner-less orphan tenant. Throw -> $transaction rollback.
    throw new Error(`OWNER bootstrap failed during company onboarding: ${owner.kind}`);
  }

  return {
    kind: 'OK',
    companyId: company.id,
    slug,
    ownerMembershipId: owner.membershipId,
    ownerUserId: owner.userId,
  };
}
