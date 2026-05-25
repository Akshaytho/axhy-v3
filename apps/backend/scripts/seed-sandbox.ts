/**
 * One-shot dev seed for Slice 1 + Slice 2 smoke tests.
 *
 * Idempotent: creates Company "Reddy Cleaning Services" + supervisor
 * Suresh Kumar + 3 sites + 5 workers + 3 leave requests + a couple of
 * visits scheduled for today. Re-running this script on top of existing
 * rows updates names where they drift, otherwise no-ops.
 *
 * Naming follows the master-plan personas (Mr. Reddy / Suresh / Kavitha
 * archetypes) — no "sandbox" or "test" wording in any displayed field.
 *
 * Run: cd apps/backend && pnpm exec tsx --env-file=.env.local scripts/seed-sandbox.ts
 *
 * @derives(master-plan §B.1 — owner / supervisor archetypes)
 * @derives(panel-2026-05-08 — Phase B.2: realistic data for Tier 1 routes)
 */

import { PrismaClient } from '@prisma/client';

const COMPANY_SLUG = 'axhy-sandbox';
const COMPANY_NAME = 'Reddy Cleaning Services';
const OWNER_NAME = 'Karthik Reddy';
const OWNER_PHONE = '+919999988888';

const SUPERVISOR_PHONE = '+919999999999';
const SUPERVISOR_NAME = 'Suresh Kumar';

type SeedSite = {
  name: string;
  address: string;
  state: string;
};

const SITES: SeedSite[] = [
  { name: 'IT Park C', address: 'Plot 7, Hi-Tech City, Hyderabad', state: 'ACTIVE' },
  { name: 'Mall Lobby', address: 'GVK One, Banjara Hills, Hyderabad', state: 'ACTIVE' },
  { name: 'Hospital A', address: 'Apollo, Jubilee Hills, Hyderabad', state: 'ACTIVE' },
];

type SeedWorker = {
  name: string;
  phone: string;
  state: string;
  baseSalaryPaise: number;
};

const WORKERS: SeedWorker[] = [
  { name: 'Mukesh Yadav', phone: '+919900000001', state: 'ACTIVE', baseSalaryPaise: 1200000 },
  { name: 'Ravi Kumar', phone: '+919900000002', state: 'ACTIVE', baseSalaryPaise: 1200000 },
  { name: 'Lakshmi Devi', phone: '+919900000003', state: 'ACTIVE', baseSalaryPaise: 1300000 },
  { name: 'Ramesh Babu', phone: '+919900000004', state: 'ACTIVE', baseSalaryPaise: 1200000 },
  { name: 'Priya Reddy', phone: '+919900000005', state: 'ACTIVE', baseSalaryPaise: 1300000 },
];

function todayDateOnly(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function tomorrowDateOnly(): Date {
  const d = todayDateOnly();
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // 1. Company (upsert by slug; rename display fields if drifted)
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
      console.log(`[seed] updated Company → ${company.name}`);
    } else {
      console.log(`[seed] Company ${company.id} (${company.name}) up-to-date`);
    }

    // 2. Supervisor user (upsert by phone)
    let supervisor = await prisma.user.findUnique({ where: { phone: SUPERVISOR_PHONE } });
    if (!supervisor) {
      supervisor = await prisma.user.create({
        data: { phone: SUPERVISOR_PHONE, name: SUPERVISOR_NAME, locale: 'en' },
      });
      console.log(`[seed] created User ${supervisor.id} (${supervisor.name})`);
    } else if (supervisor.name !== SUPERVISOR_NAME) {
      supervisor = await prisma.user.update({
        where: { id: supervisor.id },
        data: { name: SUPERVISOR_NAME },
      });
      console.log(`[seed] updated User name → ${supervisor.name}`);
    } else {
      console.log(`[seed] User ${supervisor.id} (${supervisor.name}) up-to-date`);
    }

    // 3. Membership (upsert by composite unique [companyId, userId, role])
    const existingMembership = await prisma.membership.findFirst({
      where: { companyId: company.id, userId: supervisor.id, role: 'SUPERVISOR' },
    });
    if (!existingMembership) {
      const m = await prisma.membership.create({
        data: {
          companyId: company.id,
          userId: supervisor.id,
          role: 'SUPERVISOR',
          status: 'ACTIVE',
        },
      });
      console.log(`[seed] created Membership ${m.id} (SUPERVISOR)`);
    } else {
      console.log(`[seed] Membership ${existingMembership.id} (SUPERVISOR) exists`);
    }

    // 4. Sites (3 — idempotent by name within company)
    const siteRows = await Promise.all(
      SITES.map(async (s) => {
        const existing = await prisma.site.findFirst({
          where: { companyId: company.id, name: s.name },
        });
        if (!existing) {
          const created = await prisma.site.create({
            data: {
              companyId: company.id,
              name: s.name,
              address: s.address,
              state: s.state,
            },
          });
          console.log(`[seed] created Site ${s.name}`);
          return created;
        }
        if (existing.state !== s.state || existing.address !== s.address) {
          return prisma.site.update({
            where: { id: existing.id },
            data: { address: s.address, state: s.state },
          });
        }
        return existing;
      }),
    );

    // 5. Workers (5 — idempotent by [companyId, phone] unique key)
    const workerRows = await Promise.all(
      WORKERS.map(async (w) => {
        const existing = await prisma.worker.findUnique({
          where: { companyId_phone: { companyId: company.id, phone: w.phone } },
        });
        if (!existing) {
          const created = await prisma.worker.create({
            data: {
              companyId: company.id,
              name: w.name,
              phone: w.phone,
              state: w.state,
              // ADR-0025: salary moved to Membership. Sandbox workers are User-less;
              // baseSalaryPaise in WORKERS[] is preserved for future migration when
              // this seed grows User+Membership creation. mark-absent against these
              // workers returns 0 deduction (acceptable for smoke tests).
            },
          });
          console.log(`[seed] created Worker ${w.name}`);
          return created;
        }
        if (existing.name !== w.name || existing.state !== w.state) {
          return prisma.worker.update({
            where: { id: existing.id },
            data: { name: w.name, state: w.state },
          });
        }
        return existing;
      }),
    );

    // 6. Leave requests (3 — different states for the supervisor's
    //    "Approve leave" / "Reject leave" buttons to land on)
    //    Idempotent by (workerId, fromDate) heuristic.
    const today = todayDateOnly();
    const tomorrow = tomorrowDateOnly();
    const leaveScenarios = [
      { worker: workerRows[2], state: 'REQUESTED', from: tomorrow, reason: 'Family function' }, // Lakshmi
      { worker: workerRows[3], state: 'REQUESTED', from: tomorrow, reason: 'Medical' }, // Ramesh
      { worker: workerRows[4], state: 'APPROVED', from: today, reason: 'Already on leave' }, // Priya (already approved)
    ];
    for (const scenario of leaveScenarios) {
      if (!scenario.worker) continue;
      const existing = await prisma.leaveRequest.findFirst({
        where: { workerId: scenario.worker.id, fromDate: scenario.from },
      });
      if (!existing) {
        await prisma.leaveRequest.create({
          data: {
            companyId: company.id,
            workerId: scenario.worker.id,
            fromDate: scenario.from,
            toDate: scenario.from,
            reason: scenario.reason,
            state: scenario.state,
            decidedBy: scenario.state === 'APPROVED' ? supervisor.id : null,
            decidedAt: scenario.state === 'APPROVED' ? new Date() : null,
          },
        });
        console.log(`[seed] created LeaveRequest for ${scenario.worker.name} (${scenario.state})`);
      }
    }

    // 7. Today's visits (4 — schedule each morning so Suresh has
    //    something to mark-done). Idempotent by (workerId, scheduledFor).
    const visitScenarios = [
      { worker: workerRows[0], site: siteRows[0], hour: 7 }, // Mukesh @ IT Park C 7AM
      { worker: workerRows[1], site: siteRows[0], hour: 7 }, // Ravi @ IT Park C 7AM
      { worker: workerRows[2], site: siteRows[1], hour: 9 }, // Lakshmi @ Mall Lobby 9AM
      { worker: workerRows[3], site: siteRows[2], hour: 11 }, // Ramesh @ Hospital A 11AM
    ];
    for (const v of visitScenarios) {
      if (!v.worker || !v.site) continue;
      const scheduledFor = new Date(today);
      scheduledFor.setUTCHours(v.hour, 0, 0, 0);
      const existing = await prisma.visit.findFirst({
        where: { workerId: v.worker.id, scheduledFor },
      });
      if (!existing) {
        await prisma.visit.create({
          data: {
            companyId: company.id,
            workerId: v.worker.id,
            siteId: v.site.id,
            scheduledFor,
            state: 'SCHEDULED',
          },
        });
        console.log(`[seed] created Visit ${v.worker.name} → ${v.site.name} ${v.hour}:00`);
      }
    }

    console.log(
      `\n[seed] DONE. Sign in with phone "${SUPERVISOR_PHONE.slice(3)}" and OTP "123456".`,
    );
    console.log(
      `[seed] Sites: ${siteRows.length}, Workers: ${workerRows.length}, Leaves: 3, Visits: 4`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
