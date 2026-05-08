/**
 * One-shot dev seed for Slice 1 smoke test.
 *
 * Idempotent: creates Company "Reddy Cleaning Services" + supervisor User
 * "Suresh Kumar" (+919999999999) + Membership(SUPERVISOR), or updates
 * names if existing rows drift from the canonical archetype.
 *
 * Naming follows the master-plan personas (Mr. Reddy / Suresh / Kavitha
 * archetypes) — no "sandbox" or "test" wording so the smoke-test surface
 * looks like real data the founder can ship-walk.
 *
 * Run: cd apps/backend && pnpm exec tsx --env-file=.env.local scripts/seed-sandbox.ts
 *
 * @derives(master-plan §B.1 — owner / supervisor archetypes)
 */

import { PrismaClient } from '@prisma/client';

// Internal lookup slug. Stays "axhy-sandbox" for cross-script stability;
// not displayed in UI.
const COMPANY_SLUG = 'axhy-sandbox';
const COMPANY_NAME = 'Reddy Cleaning Services';
const OWNER_NAME = 'Karthik Reddy';
const OWNER_PHONE = '+919999988888'; // Mr. Reddy archetype phone

const SUPERVISOR_PHONE = '+919999999999'; // documented test phone for slice 1
const SUPERVISOR_NAME = 'Suresh Kumar';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    let company = await prisma.company.findUnique({ where: { slug: COMPANY_SLUG } });
    if (!company) {
      company = await prisma.company.create({
        data: {
          name: COMPANY_NAME,
          slug: COMPANY_SLUG,
          ownerPhone: OWNER_PHONE,
          ownerName: OWNER_NAME,
        },
      });
      console.log(`[seed] created Company ${company.id} (${company.name})`);
    } else if (
      company.name !== COMPANY_NAME ||
      company.ownerName !== OWNER_NAME ||
      company.ownerPhone !== OWNER_PHONE
    ) {
      company = await prisma.company.update({
        where: { id: company.id },
        data: { name: COMPANY_NAME, ownerName: OWNER_NAME, ownerPhone: OWNER_PHONE },
      });
      console.log(`[seed] updated Company → ${company.name} (owner ${company.ownerName})`);
    } else {
      console.log(`[seed] Company ${company.id} (${company.name}) already up-to-date`);
    }

    let user = await prisma.user.findUnique({ where: { phone: SUPERVISOR_PHONE } });
    if (!user) {
      user = await prisma.user.create({
        data: { phone: SUPERVISOR_PHONE, name: SUPERVISOR_NAME, locale: 'en' },
      });
      console.log(`[seed] created User ${user.id} (${user.name})`);
    } else if (user.name !== SUPERVISOR_NAME) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: SUPERVISOR_NAME },
      });
      console.log(`[seed] updated User name → ${user.name}`);
    } else {
      console.log(`[seed] User ${user.id} (${user.name}) already up-to-date`);
    }

    const existingMembership = await prisma.membership.findFirst({
      where: { companyId: company.id, userId: user.id, role: 'SUPERVISOR' },
    });
    if (!existingMembership) {
      const m = await prisma.membership.create({
        data: { companyId: company.id, userId: user.id, role: 'SUPERVISOR', status: 'ACTIVE' },
      });
      console.log(`[seed] created Membership ${m.id} (SUPERVISOR)`);
    } else {
      console.log(`[seed] Membership ${existingMembership.id} (SUPERVISOR) already exists`);
    }

    console.log(
      `\n[seed] DONE. Sign in with phone "${SUPERVISOR_PHONE.slice(3)}" and OTP "123456".`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
