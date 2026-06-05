/**
 * Comprehensive QA seed for exhaustive worker + supervisor device testing.
 *
 * Founder-confirmed 2026-06-05: no paying customers, all prod data is fake,
 * seeding the prod Railway DB is sanctioned (D8 locked rule). This builds a
 * production-SHAPED dataset (real names, real visit histories), not a "sandbox
 * corner".
 *
 * Creates:
 *  - Company "Reddy Cleaning Services" (slug axhy-sandbox)
 *      · Owner Karthik Reddy
 *      · Supervisor Suresh Kumar  — LOGINABLE  (+919999999999 / OTP 123456)
 *      · 3 sites + Suresh bound to all three (permanent portfolio)
 *      · Workers:
 *          Ravi Kumar     +919900000002  LOGINABLE worker (User+Membership+Worker.userId)
 *          Mukesh Yadav   +919900000001  LOGINABLE worker
 *          Lakshmi Devi   +919900000003  ACTIVE, User-less
 *          Ramesh Babu    +919900000004  ACTIVE, User-less
 *          Priya Reddy    +919900000005  ACTIVE, User-less
 *          Sam Suspended  +919900000006  SUSPENDED (edge persona)
 *          राम 🙏 العامل  +919900000007  ACTIVE (unicode/RTL/emoji edge name)
 *      · Visits spanning ALL 12 states + REJECTED (today + history)
 *      · Leaves: REQUESTED / APPROVED / REJECTED
 *  - Company "Surya Facilities Management" (slug surya-fm) — tenant-isolation:
 *      · Supervisor Anil Sharma — LOGINABLE (+918888888888 / OTP 123456)
 *      · 1 site, 1 worker, 1 VERIFIED visit
 *
 * Idempotent: upserts by stable keys; visits/leaves for owned workers are
 * delete-then-recreate so re-runs are deterministic.
 *
 * Run: cd apps/backend && pnpm exec tsx --env-file=.env.local scripts/seed-qa-comprehensive.ts
 */

import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
if (!dbUrl) throw new Error('Missing DATABASE_URL / DATABASE_PUBLIC_URL');
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// ── IST day helpers (matches worker-today-service day window) ────────────────
const IST = 'Asia/Kolkata';
const now = new Date();
const istYmd = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(now);
const todayStart = new Date(`${istYmd}T00:00:00+05:30`);
const todayEnd = new Date(todayStart.getTime() + 24 * 3600_000);
const clampToday = (d: Date) =>
  new Date(
    Math.min(Math.max(d.getTime(), todayStart.getTime() + 60_000), todayEnd.getTime() - 60_000),
  );
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 3600_000);

// ── upsert helpers ───────────────────────────────────────────────────────────
async function upsertCompany(name: string, slug: string, ownerName: string, ownerPhone: string) {
  const existing = await prisma.company.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.company.create({ data: { name, slug, ownerName, ownerPhone } });
}

async function upsertUser(phone: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    if (existing.name !== name)
      return prisma.user.update({ where: { id: existing.id }, data: { name } });
    return existing;
  }
  return prisma.user.create({ data: { phone, name, locale: 'en' } });
}

async function upsertMembership(
  companyId: string,
  userId: string,
  role: string,
  status = 'ACTIVE',
) {
  const existing = await prisma.membership.findFirst({ where: { companyId, userId, role } });
  if (existing) return existing;
  return prisma.membership.create({
    data: { companyId, userId, role, status, baseSalaryPaise: 0 },
  });
}

async function upsertSite(companyId: string, name: string, address: string) {
  const existing = await prisma.site.findFirst({ where: { companyId, name } });
  if (existing) return existing;
  return prisma.site.create({ data: { companyId, name, address, state: 'ACTIVE' } });
}

async function upsertBinding(companyId: string, siteId: string, userId: string, createdBy: string) {
  const existing = await prisma.siteSupervisorBinding.findFirst({
    where: { companyId, siteId, userId, endedAt: null },
  });
  if (existing) return existing;
  return prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId,
      userId,
      actingForUserId: null,
      effectiveFrom: daysAgo(60),
      effectiveUntil: null,
      reason: 'Permanent portfolio',
      createdBy,
    },
  });
}

async function upsertWorker(
  companyId: string,
  name: string,
  phone: string,
  state: string,
  loginableUserId: string | null,
) {
  const existing = await prisma.worker.findUnique({
    where: { companyId_phone: { companyId, phone } },
  });
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (existing.name !== name) patch.name = name;
    if (existing.state !== state) patch.state = state;
    if (loginableUserId && existing.userId !== loginableUserId) patch.userId = loginableUserId;
    if (Object.keys(patch).length)
      return prisma.worker.update({ where: { id: existing.id }, data: patch });
    return existing;
  }
  return prisma.worker.create({
    data: { companyId, name, phone, state, preferredLanguage: 'en', userId: loginableUserId },
  });
}

async function upsertAssignment(companyId: string, workerId: string, siteId: string) {
  const existing = await prisma.assignment.findFirst({
    where: { companyId, workerId, siteId, state: 'ACTIVE' },
  });
  if (existing) return existing;
  return prisma.assignment.create({
    data: {
      companyId,
      workerId,
      siteId,
      shiftStart: '09:00',
      shiftEnd: '18:00',
      dayMask: 'MTWTFSS',
      validFrom: daysAgo(60),
      state: 'ACTIVE',
    },
  });
}

type VisitSpec = {
  workerId: string;
  siteId: string;
  state: string;
  scheduledFor: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  photosBefore?: number;
  photosAfter?: number;
  flagged?: boolean;
  verificationText?: string | null;
};

async function createVisit(companyId: string, v: VisitSpec) {
  return prisma.visit.create({
    data: {
      companyId,
      workerId: v.workerId,
      siteId: v.siteId,
      state: v.state,
      scheduledFor: v.scheduledFor,
      startedAt: v.startedAt ?? null,
      completedAt: v.completedAt ?? null,
      photosBefore: v.photosBefore ?? 0,
      photosAfter: v.photosAfter ?? 0,
      flagged: v.flagged ?? false,
      verificationText: v.verificationText ?? null,
    },
  });
}

async function main() {
  console.log(`Seeding comprehensive QA data → ${dbUrl.replace(/:[^:@/]+@/, ':***@')}`);
  console.log(`IST today window: ${todayStart.toISOString()} .. ${todayEnd.toISOString()}`);

  // ═══ Company 1: Reddy Cleaning Services ═══════════════════════════════════
  const co = await upsertCompany(
    'Reddy Cleaning Services',
    'axhy-sandbox',
    'Karthik Reddy',
    '+919999988888',
  );
  console.log(`Company: ${co.name} (${co.id})`);

  const ownerUser = await upsertUser('+919999988888', 'Karthik Reddy');
  const supUser = await upsertUser('+919999999999', 'Suresh Kumar');
  await upsertMembership(co.id, supUser.id, 'SUPERVISOR');

  const siteItPark = await upsertSite(co.id, 'IT Park C', 'Plot 7, Hi-Tech City, Hyderabad');
  const siteMall = await upsertSite(co.id, 'Mall Lobby', 'GVK One, Banjara Hills, Hyderabad');
  const siteHosp = await upsertSite(co.id, 'Hospital A', 'Apollo, Jubilee Hills, Hyderabad');

  for (const s of [siteItPark, siteMall, siteHosp]) {
    await upsertBinding(co.id, s.id, supUser.id, ownerUser.id);
  }

  // Loginable workers
  const raviUser = await upsertUser('+919900000002', 'Ravi Kumar');
  await upsertMembership(co.id, raviUser.id, 'WORKER');
  const ravi = await upsertWorker(co.id, 'Ravi Kumar', '+919900000002', 'ACTIVE', raviUser.id);

  const mukeshUser = await upsertUser('+919900000001', 'Mukesh Yadav');
  await upsertMembership(co.id, mukeshUser.id, 'WORKER');
  const mukesh = await upsertWorker(
    co.id,
    'Mukesh Yadav',
    '+919900000001',
    'ACTIVE',
    mukeshUser.id,
  );

  // User-less + edge workers
  const lakshmi = await upsertWorker(co.id, 'Lakshmi Devi', '+919900000003', 'ACTIVE', null);
  const ramesh = await upsertWorker(co.id, 'Ramesh Babu', '+919900000004', 'ACTIVE', null);
  const priya = await upsertWorker(co.id, 'Priya Reddy', '+919900000005', 'ACTIVE', null);
  const sam = await upsertWorker(co.id, 'Sam (suspended)', '+919900000006', 'SUSPENDED', null);
  const uni = await upsertWorker(co.id, 'राम 🙏 العامل', '+919900000007', 'ACTIVE', null);

  // Assignments (active workers → sites)
  await upsertAssignment(co.id, ravi.id, siteItPark.id);
  await upsertAssignment(co.id, mukesh.id, siteItPark.id);
  await upsertAssignment(co.id, lakshmi.id, siteMall.id);
  await upsertAssignment(co.id, ramesh.id, siteHosp.id);
  await upsertAssignment(co.id, priya.id, siteItPark.id);
  await upsertAssignment(co.id, uni.id, siteMall.id);

  // Reset visits/leaves for owned workers so the state matrix is deterministic
  const ownedWorkerIds = [ravi.id, mukesh.id, lakshmi.id, ramesh.id, priya.id, sam.id, uni.id];
  await prisma.visit.deleteMany({ where: { companyId: co.id, workerId: { in: ownedWorkerIds } } });
  await prisma.leaveRequest.deleteMany({
    where: { companyId: co.id, workerId: { in: ownedWorkerIds } },
  });

  const FLAG_TEXT =
    'AI flagged: before and after photos look nearly identical — please verify the lobby floor was actually mopped.';

  // TODAY visits (surface on supervisor Today + worker Home)
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'SCHEDULED',
    scheduledFor: clampToday(new Date(now.getTime() + 45 * 60_000)),
  });
  await createVisit(co.id, {
    workerId: mukesh.id,
    siteId: siteItPark.id,
    state: 'IN_PROGRESS',
    scheduledFor: clampToday(hoursAgo(1)),
    startedAt: hoursAgo(1),
    photosBefore: 2,
  });
  await createVisit(co.id, {
    workerId: lakshmi.id,
    siteId: siteMall.id,
    state: 'VERIFIED',
    scheduledFor: clampToday(hoursAgo(4)),
    startedAt: clampToday(hoursAgo(4)),
    completedAt: clampToday(hoursAgo(2)),
    photosBefore: 2,
    photosAfter: 3,
  });
  await createVisit(co.id, {
    workerId: ramesh.id,
    siteId: siteHosp.id,
    state: 'FLAGGED',
    scheduledFor: clampToday(hoursAgo(3)),
    startedAt: clampToday(hoursAgo(3)),
    completedAt: clampToday(hoursAgo(2)),
    photosBefore: 2,
    photosAfter: 2,
    flagged: true,
    verificationText: FLAG_TEXT,
  });
  await createVisit(co.id, {
    workerId: priya.id,
    siteId: siteItPark.id,
    state: 'PHOTOS_PENDING',
    scheduledFor: clampToday(hoursAgo(1)),
    startedAt: clampToday(hoursAgo(1)),
    photosBefore: 2,
  });
  await createVisit(co.id, {
    workerId: uni.id,
    siteId: siteMall.id,
    state: 'NO_SHOW',
    scheduledFor: clampToday(hoursAgo(5)),
  });

  // HISTORY visits for Ravi (worker history screen) — covers remaining states
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'VERIFIED',
    scheduledFor: daysAgo(1),
    startedAt: daysAgo(1),
    completedAt: daysAgo(1),
    photosBefore: 2,
    photosAfter: 3,
  });
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'FLAGGED',
    scheduledFor: daysAgo(2),
    startedAt: daysAgo(2),
    completedAt: daysAgo(2),
    photosBefore: 2,
    photosAfter: 2,
    flagged: true,
    verificationText: FLAG_TEXT,
  });
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'REJECTED',
    scheduledFor: daysAgo(3),
    startedAt: daysAgo(3),
    completedAt: daysAgo(3),
    photosBefore: 2,
    photosAfter: 2,
  });
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'AWAITING_VERIFICATION',
    scheduledFor: daysAgo(4),
    startedAt: daysAgo(4),
    completedAt: daysAgo(4),
    photosBefore: 2,
    photosAfter: 3,
  });
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'CANCELLED',
    scheduledFor: daysAgo(5),
  });
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'ARCHIVED',
    scheduledFor: daysAgo(20),
    startedAt: daysAgo(20),
    completedAt: daysAgo(20),
    photosBefore: 2,
    photosAfter: 3,
  });
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'NOTIFIED',
    scheduledFor: clampToday(new Date(now.getTime() + 3 * 3600_000)),
  });
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'EN_ROUTE',
    scheduledFor: daysAgo(6),
    startedAt: daysAgo(6),
  });
  await createVisit(co.id, {
    workerId: ravi.id,
    siteId: siteItPark.id,
    state: 'ON_SITE',
    scheduledFor: daysAgo(7),
    startedAt: daysAgo(7),
  });

  // Leaves
  await prisma.leaveRequest.create({
    data: {
      companyId: co.id,
      workerId: lakshmi.id,
      fromDate: daysAgo(-2),
      toDate: daysAgo(-2),
      reason: 'Family function',
      state: 'REQUESTED',
    },
  });
  await prisma.leaveRequest.create({
    data: {
      companyId: co.id,
      workerId: priya.id,
      fromDate: daysAgo(0),
      toDate: daysAgo(0),
      reason: 'Already on approved leave',
      state: 'APPROVED',
      decidedBy: supUser.id,
      decidedAt: hoursAgo(20),
    },
  });
  await prisma.leaveRequest.create({
    data: {
      companyId: co.id,
      workerId: ramesh.id,
      fromDate: daysAgo(8),
      toDate: daysAgo(8),
      reason: 'Personal',
      state: 'REJECTED',
      decidedBy: supUser.id,
      decidedAt: daysAgo(9),
      decisionNote: 'Short-staffed that day',
    },
  });

  // ═══ Company 2: Surya Facilities Management (tenant isolation) ═════════════
  const co2 = await upsertCompany(
    'Surya Facilities Management',
    'surya-fm',
    'Priya Surya',
    '+917777766666',
  );
  const anil = await upsertUser('+918888888888', 'Anil Sharma');
  await upsertMembership(co2.id, anil.id, 'SUPERVISOR');
  const site2 = await upsertSite(co2.id, 'Tech Tower B', 'Madhapur, Hyderabad');
  await upsertBinding(co2.id, site2.id, anil.id, anil.id);
  const w2 = await upsertWorker(co2.id, 'Geeta Rao', '+919900000099', 'ACTIVE', null);
  await upsertAssignment(co2.id, w2.id, site2.id);
  await prisma.visit.deleteMany({ where: { companyId: co2.id, workerId: w2.id } });
  await createVisit(co2.id, {
    workerId: w2.id,
    siteId: site2.id,
    state: 'VERIFIED',
    scheduledFor: clampToday(hoursAgo(3)),
    startedAt: clampToday(hoursAgo(3)),
    completedAt: clampToday(hoursAgo(1)),
    photosBefore: 2,
    photosAfter: 2,
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  const visitStates = await prisma.visit.groupBy({
    by: ['state'],
    where: { companyId: co.id },
    _count: true,
  });
  console.log('\n✅ Seed complete.');
  console.log('LOGINS (OTP 123456 for all):');
  console.log(`  Supervisor (Reddy): +919999999999  (Suresh Kumar)`);
  console.log(`  Worker (Reddy):     +919900000002  (Ravi Kumar)  worker.id=${ravi.id}`);
  console.log(`  Worker (Reddy):     +919900000001  (Mukesh Yadav)`);
  console.log(`  Supervisor (Surya): +918888888888  (Anil Sharma) — tenant isolation`);
  console.log(
    `Reddy visits by state: ${JSON.stringify(visitStates.map((v) => ({ s: v.state, n: v._count })))}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('SEED FAILED:', err);
  await prisma.$disconnect();
  process.exit(1);
});
