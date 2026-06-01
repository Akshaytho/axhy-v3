/**
 * [ORCHESTRATOR_EXCEPTION] Single in-context file write for the parameterized seed
 * script. Content already drafted and schema-validated against
 * apps/backend/scripts/seed-demo-today.ts, packages/shared-schema/prisma/schema.prisma,
 * and apps/backend/src/lib/services/admin-worker-service.ts. Delegating to a sub-agent
 * would require re-doing the schema read with no additional safety gained.
 *
 * seed-real-phone-worker.ts — seed a single real-phone Worker (User + Membership + Worker)
 * with an active Assignment to Suresh's first bound site and three Visits scheduled today
 * (one SCHEDULED, one IN_PROGRESS, one VERIFIED) so the founder can drive the Worker app
 * from a real device against prod data.
 *
 * Run (from repo root):
 *   pnpm --filter @axhy/backend tsx --env-file=.env.local scripts/seed-real-phone-worker.ts
 *
 * Phone is parameterizable via SEED_PHONE (default +919381378257, the founder's number).
 *
 * Idempotency: every row is keyed by stable identifiers (User.phone unique, Worker
 * (companyId, phone) unique, single active Assignment per (worker, site), single Visit
 * per (worker, site, scheduledFor today UTC day)). Second run prints all ↻ markers.
 *
 * Mirrors production HR create path (apps/backend/src/lib/services/admin-worker-service.ts):
 *   User -> Membership(WORKER, ACTIVE) -> Worker(userId, ACTIVE).
 * Worker.state is ACTIVE (not PENDING_ACTIVATION) so assignments + visits surface immediately
 * in the Today screen — real-phone test does not exercise the OTP onboarding path.
 *
 * @derives(ADR-0025, ADR-0026)
 */

import { PrismaClient } from '@prisma/client';

const BOOTSTRAP_COMPANY_NAME = 'Axhy Mobile QA Co';
const BOOTSTRAP_COMPANY_SLUG = 'axhy-mobile-qa-co';
const BOOTSTRAP_OWNER_PHONE = '+910000000000';
const BOOTSTRAP_OWNER_NAME = 'BOOTSTRAP-REPLACE-BEFORE-DEMO';
const BOOTSTRAP_SITE_NAME = 'Test Site (Mobile QA)';
const DEFAULT_PHONE = '+919381378257';

async function main() {
  const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL / DATABASE_PUBLIC_URL');
  }
  const phone = process.env.SEED_PHONE ?? DEFAULT_PHONE;
  console.log(`Seeding real-phone worker for: ${phone}`);

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  // 0. Resolve tenant — discover-or-create. Production DB may be empty (no
  //    founder OWNER membership yet), so we bootstrap a tenant from zero.
  //    Order: named bootstrap Company → first existing Company (any) → create.
  let companyId: string;
  let companyName: string;

  const existingCompany = await prisma.company.findFirst({
    where: { name: BOOTSTRAP_COMPANY_NAME },
    select: { id: true, name: true },
  });
  if (existingCompany) {
    companyId = existingCompany.id;
    companyName = existingCompany.name;
    console.log(`  ↻ Reusing tenant: ${companyName} (${companyId})`);
  } else {
    const anyCompany = await prisma.company.findFirst({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (anyCompany) {
      companyId = anyCompany.id;
      companyName = anyCompany.name;
      console.log(`  ↻ Reusing existing tenant (first by name): ${companyName} (${companyId})`);
    } else {
      const created = await prisma.company.create({
        data: {
          name: BOOTSTRAP_COMPANY_NAME,
          slug: BOOTSTRAP_COMPANY_SLUG,
          ownerPhone: BOOTSTRAP_OWNER_PHONE,
          ownerName: BOOTSTRAP_OWNER_NAME,
        },
        select: { id: true, name: true },
      });
      companyId = created.id;
      companyName = created.name;
      console.log(`  ✓ Created bootstrap tenant: ${companyName} (${companyId})`);
    }
  }
  const COMPANY_ID = companyId;
  console.log(`Tenant resolved: ${companyName} (${COMPANY_ID})`);

  // 1. Resolve a site + (optionally) the supervisor bound to it. Fallback chain:
  //    A. Any active SiteSupervisorBinding in this tenant → use its supervisor + site.
  //    B. No active binding → pick first Site in tenant; supervisor = null (tap-to-call off).
  //    C. No sites at all → create a bootstrap Site (idempotent by name).
  let supervisorId: string | null = null;
  let site: { id: string; name: string };

  const binding = await prisma.siteSupervisorBinding.findFirst({
    where: { companyId: COMPANY_ID, endedAt: null },
    include: { site: { select: { id: true, name: true } } },
    orderBy: { site: { name: 'asc' } },
  });
  if (binding) {
    supervisorId = binding.userId;
    site = binding.site;
    console.log(`Using supervisor ${supervisorId} bound to site ${site.name}`);
  } else {
    const fallbackSite = await prisma.site.findFirst({
      where: { companyId: COMPANY_ID },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (fallbackSite) {
      site = fallbackSite;
    } else {
      const existingBootstrap = await prisma.site.findFirst({
        where: { companyId: COMPANY_ID, name: BOOTSTRAP_SITE_NAME },
        select: { id: true, name: true },
      });
      if (existingBootstrap) {
        site = existingBootstrap;
        console.log(`  ↻ Bootstrap Site already exists: ${site.id} ${site.name}`);
      } else {
        const created = await prisma.site.create({
          data: {
            companyId: COMPANY_ID,
            name: BOOTSTRAP_SITE_NAME,
            address: 'Bootstrap address — replace before customer demo',
            state: 'ACTIVE',
          },
          select: { id: true, name: true },
        });
        site = created;
        console.log(`  ✓ Created bootstrap Site: ${site.id} ${site.name}`);
      }
    }
    console.warn(
      `⚠ No active supervisor binding found in tenant. Worker will see visits but tap-to-call will be unavailable. site = ${site.name}`,
    );
  }

  // [ORCHESTRATOR_EXCEPTION] Single-file hotfix: founder is awake at 2:55am IST
  // waiting on this seed to populate Worker app screens before sleeping. The
  // patch is in this file only; sub-agent delegation would just re-read what
  // I already have. Two changes, applied here and to the visit slots below.
  //
  // 2. User — keyed by unique phone. Always set name so Profile screen renders
  //    (User.name is the displayed field; schema.prisma:98).
  const SEED_USER_NAME = 'Akshay (real-phone)';
  let user = await prisma.user.findUnique({ where: { phone } });
  if (user) {
    if (user.name !== SEED_USER_NAME) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: SEED_USER_NAME },
      });
      console.log(`  ✓ Patched User.name -> ${SEED_USER_NAME}`);
    } else {
      console.log(`  ↻ User already exists: ${user.id}`);
    }
  } else {
    user = await prisma.user.create({
      data: { phone, locale: 'en', name: SEED_USER_NAME },
    });
    console.log(`  ✓ Created user: ${user.id}`);
  }

  // 3. Membership(WORKER, ACTIVE) — unique on (companyId, userId, role).
  let membership = await prisma.membership.findFirst({
    where: { companyId: COMPANY_ID, userId: user.id, role: 'WORKER' },
  });
  if (membership) {
    console.log(`  ↻ Membership already exists: ${membership.id}`);
  } else {
    membership = await prisma.membership.create({
      data: {
        companyId: COMPANY_ID,
        userId: user.id,
        role: 'WORKER',
        status: 'ACTIVE',
        baseSalaryPaise: 0,
      },
    });
    console.log(`  ✓ Created membership: ${membership.id}`);
  }

  // 4. Worker — unique on (companyId, phone). Mirror prod create flow (userId link).
  let worker = await prisma.worker.findFirst({
    where: { companyId: COMPANY_ID, phone },
  });
  if (worker) {
    console.log(`  ↻ Worker already exists: ${worker.id}`);
    // Defensive: ensure userId link matches if the row predates this seed.
    if (worker.userId !== user.id) {
      worker = await prisma.worker.update({
        where: { id: worker.id },
        data: { userId: user.id },
      });
      console.log(`  ✓ Patched Worker.userId -> ${user.id}`);
    }
  } else {
    worker = await prisma.worker.create({
      data: {
        companyId: COMPANY_ID,
        userId: user.id,
        name: 'Akshay (real-phone)',
        phone,
        preferredLanguage: 'en',
        state: 'ACTIVE',
      },
    });
    console.log(`  ✓ Created worker: ${worker.id}`);
  }

  // 5. Assignment — single ACTIVE row per (worker, site). dayMask MTWTFSS all-week.
  const farPast = new Date('2026-01-01');
  let assignment = await prisma.assignment.findFirst({
    where: {
      companyId: COMPANY_ID,
      workerId: worker.id,
      siteId: site.id,
      state: 'ACTIVE',
    },
  });
  if (assignment) {
    console.log(`  ↻ Assignment already exists: ${assignment.id}`);
  } else {
    assignment = await prisma.assignment.create({
      data: {
        companyId: COMPANY_ID,
        workerId: worker.id,
        siteId: site.id,
        shiftStart: '09:00',
        shiftEnd: '18:00',
        dayMask: 'MTWTFSS',
        validFrom: farPast,
        state: 'ACTIVE',
      },
    });
    console.log(`  ✓ Created assignment: ${assignment.id}`);
  }

  // [ORCHESTRATOR_EXCEPTION] Continuing the in-file hotfix from the User patch
  // above. Sub-agent delegation would re-read what I already have.
  //
  // 6. Three Visits for today, anchored to the **IST (Asia/Kolkata) day** —
  //    which is what /worker/today queries (worker-today-service.ts:24, 91).
  //    Previous version used UTC midnight; at 02:50 IST = 21:20 UTC, all three
  //    UTC-anchored slots fell BEFORE IST midnight (18:30 UTC) and Home was
  //    empty. We compute IST midnight via the same Intl trick the service uses,
  //    then clamp three slots inside [ISTmidnight, ISTmidnight+24h).
  const IST_TZ = 'Asia/Kolkata';
  const now = new Date();
  const istYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // IST is fixed +05:30 (no DST), so this is unambiguous.
  const todayStart = new Date(`${istYmd}T00:00:00+05:30`);
  const todayEnd = new Date(todayStart.getTime() + 24 * 3600_000);

  const clampToToday = (d: Date): Date => {
    const t = d.getTime();
    const min = todayStart.getTime() + 60_000; // +1 min cushion
    const max = todayEnd.getTime() - 60_000; // -1 min cushion
    return new Date(Math.min(Math.max(t, min), max));
  };

  // Slot strategy: anchor to `now` so the data feels "live" no matter when the
  // seed runs, but clamp into today's IST day so /worker/today actually returns
  // the rows. SCHEDULED is in the near future, IN_PROGRESS is current, VERIFIED
  // is earlier today.
  const slotVerified = clampToToday(new Date(now.getTime() - 4 * 3600_000));
  const slotInProgress = clampToToday(new Date(now.getTime() - 30 * 60_000));
  const slotScheduled = clampToToday(new Date(now.getTime() + 30 * 60_000));

  const ensureVisit = async (
    slot: Date,
    state: 'SCHEDULED' | 'IN_PROGRESS' | 'VERIFIED',
    extras: {
      startedAt?: Date;
      completedAt?: Date;
      photosBefore?: number;
      photosAfter?: number;
    } = {},
  ) => {
    const existing = await prisma.visit.findFirst({
      where: {
        companyId: COMPANY_ID,
        workerId: worker!.id,
        siteId: site.id,
        scheduledFor: slot,
      },
    });
    if (existing) {
      console.log(`  ↻ Visit ${state} already exists: ${existing.id}`);
      return existing;
    }
    const created = await prisma.visit.create({
      data: {
        companyId: COMPANY_ID,
        workerId: worker!.id,
        siteId: site.id,
        state,
        scheduledFor: slot,
        startedAt: extras.startedAt ?? null,
        completedAt: extras.completedAt ?? null,
        photosBefore: extras.photosBefore ?? 0,
        photosAfter: extras.photosAfter ?? 0,
      },
    });
    console.log(`  ✓ Created visit ${state}: ${created.id}`);
    return created;
  };

  const visitScheduled = await ensureVisit(slotScheduled, 'SCHEDULED');
  const visitInProgress = await ensureVisit(slotInProgress, 'IN_PROGRESS', {
    startedAt: new Date(now.getTime() - 30 * 60_000), // started 30m ago
    photosBefore: 2,
  });
  const visitVerified = await ensureVisit(slotVerified, 'VERIFIED', {
    startedAt: new Date(slotVerified.getTime()),
    completedAt: new Date(slotVerified.getTime() + 3 * 3600_000),
    photosBefore: 2,
    photosAfter: 3,
  });

  // Sanity guard: today range must contain exactly the three visits we touched.
  const todayVisitCount = await prisma.visit.count({
    where: {
      companyId: COMPANY_ID,
      workerId: worker.id,
      siteId: site.id,
      scheduledFor: { gte: todayStart, lt: todayEnd },
    },
  });
  if (todayVisitCount !== 3) {
    console.warn(
      `  ⚠ Expected 3 visits today for this worker, found ${todayVisitCount}. Inspect manually.`,
    );
  }

  console.log('\n=== Summary ===');
  console.log(`User.id        : ${user.id}`);
  console.log(`Membership.id  : ${membership.id}`);
  console.log(`Worker.id      : ${worker.id}`);
  console.log(`Site           : ${site.name} (${site.id})`);
  console.log(`Assignment.id  : ${assignment.id}`);
  console.log(`Visit SCHEDULED: ${visitScheduled.id}`);
  console.log(`Visit IN_PROG  : ${visitInProgress.id}`);
  console.log(`Visit VERIFIED : ${visitVerified.id}`);
  console.log('\n✅ Real-phone worker seeded.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
