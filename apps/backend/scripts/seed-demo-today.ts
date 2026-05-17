/**
 * seed-demo-today.ts — populate Suresh's portfolio with demo workers + visits
 * so the Today screen has real content to render.
 *
 * Run (from repo root):
 *   pnpm --filter @axhy/backend tsx --env-file=.env.local scripts/seed-demo-today.ts
 *
 * Idempotent: re-running detects existing demo rows by phone-number prefix
 * and skips duplicates.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface demo seed
 */

import { PrismaClient } from '@prisma/client';

const SUPERVISOR_ID = 'fca29a46-667d-4880-ad35-c67aa4316793';
const COMPANY_ID = 'd72409ce-fc2a-4f87-b6a8-92bbda7a1848';
const DEMO_PREFIX = '+919999000';

async function main() {
  const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL / DATABASE_PUBLIC_URL');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  // 1. Find Suresh's bound sites. Pick the first one (Apollo per the sandbox).
  const bindings = await prisma.siteSupervisorBinding.findMany({
    where: {
      companyId: COMPANY_ID,
      userId: SUPERVISOR_ID,
      endedAt: null,
    },
    include: { site: { select: { id: true, name: true } } },
    orderBy: { site: { name: 'asc' } },
  });
  if (bindings.length === 0) {
    throw new Error(`Suresh has no bindings in ${COMPANY_ID}`);
  }
  console.log(
    `Found ${bindings.length} bound sites: ${bindings.map((b) => b.site.name).join(', ')}`,
  );

  // Pick the first site (alphabetically Apollo) for the demo data.
  const site = bindings[0]!.site;
  console.log(`Seeding into: ${site.name}`);

  // 2. Create 3 demo workers, idempotent on phone.
  const demoWorkers = [
    { name: 'Demo Worker One', phone: `${DEMO_PREFIX}001` },
    { name: 'Demo Worker Two', phone: `${DEMO_PREFIX}002` },
    { name: 'Demo Worker Three', phone: `${DEMO_PREFIX}003` },
  ];

  const workerIds: string[] = [];
  for (const dw of demoWorkers) {
    const existing = await prisma.worker.findFirst({
      where: { companyId: COMPANY_ID, phone: dw.phone },
    });
    if (existing) {
      console.log(`  ↻ Worker already exists: ${dw.name} (${existing.id})`);
      workerIds.push(existing.id);
    } else {
      const created = await prisma.worker.create({
        data: {
          companyId: COMPANY_ID,
          name: dw.name,
          phone: dw.phone,
          state: 'ACTIVE',
          baseSalaryPaise: 1300000,
        },
      });
      console.log(`  ✓ Created worker: ${dw.name} (${created.id})`);
      workerIds.push(created.id);
    }
  }

  // 3. Create active assignments (all-week dayMask so they always show today).
  const farPast = new Date('2026-01-01');
  for (let i = 0; i < workerIds.length; i++) {
    const workerId = workerIds[i]!;
    const existing = await prisma.assignment.findFirst({
      where: {
        companyId: COMPANY_ID,
        workerId,
        siteId: site.id,
        state: 'ACTIVE',
      },
    });
    if (existing) {
      console.log(`  ↻ Assignment already exists for ${workerId}`);
      continue;
    }
    await prisma.assignment.create({
      data: {
        companyId: COMPANY_ID,
        workerId,
        siteId: site.id,
        shiftStart: '09:00',
        shiftEnd: '18:00',
        dayMask: 'MTWTFSS',
        validFrom: farPast,
        state: 'ACTIVE',
      },
    });
    console.log(`  ✓ Assignment: ${workerId} → ${site.name}`);
  }

  // 4. Seed visits for today, mapping the canonical Visit machine.
  //    Worker 1 → IN_PROGRESS (currently on-site)
  //    Worker 2 → VERIFIED (clocked out, AI cleared)
  //    Worker 3 → no visit yet (PENDING state in Today)
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const ensureVisit = async (
    workerId: string,
    state: string,
    extras: {
      startedAt?: Date;
      completedAt?: Date;
      flagged?: boolean;
      verificationText?: string;
    } = {},
  ) => {
    const existing = await prisma.visit.findFirst({
      where: {
        companyId: COMPANY_ID,
        workerId,
        siteId: site.id,
        scheduledFor: { gte: todayStart, lt: todayEnd },
      },
    });
    if (existing) {
      console.log(`  ↻ Visit already exists for ${workerId} today`);
      return existing.id;
    }
    const created = await prisma.visit.create({
      data: {
        companyId: COMPANY_ID,
        workerId,
        siteId: site.id,
        state,
        scheduledFor: now,
        ...extras,
        photosBefore: extras.flagged ? 2 : 0,
        photosAfter: extras.flagged ? 3 : 0,
      },
    });
    console.log(`  ✓ Visit ${state}: worker=${workerId} visit=${created.id}`);
    return created.id;
  };

  await ensureVisit(workerIds[0]!, 'IN_PROGRESS', { startedAt: now });
  await ensureVisit(workerIds[1]!, 'VERIFIED', {
    startedAt: new Date(now.getTime() - 4 * 3600_000),
    completedAt: now,
  });

  console.log('\n✅ Demo data seeded.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
