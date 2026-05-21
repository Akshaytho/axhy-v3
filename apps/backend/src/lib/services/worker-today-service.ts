/**
 * Worker /today + /visits/:id read composer.
 *
 * Pure read service. Composes the Worker Home + Assignment Detail responses
 * by reading Worker, Visit, Site, and resolving the effective supervisor via
 * the existing `effective-responsibility.ts` helpers.
 *
 * Discipline:
 *   - Read-only. No state mutations. visitMachine and workerMachine are
 *     READ from (state column value) but NEVER transitioned in this slice.
 *   - Timezone: defaults to Asia/Kolkata because `Company.tz` is not yet on
 *     the schema. When a `Company.tz` column lands, this constant is replaced
 *     with a `tz` read off the Company row.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(F-006b worker-shell)
 */

import type { Prisma } from '@prisma/client';
import type { WorkerTodayOutput, WorkerVisitDetailOutput } from '@axhy/shared-schema';

import { deriveWorkerPrimarySiteId, getEffectiveBinding } from '../effective-responsibility.js';

const DEFAULT_TZ = 'Asia/Kolkata';

const IN_FLIGHT_STATES = new Set<string>(['EN_ROUTE', 'ON_SITE', 'IN_PROGRESS', 'PHOTOS_PENDING']);

function startOfDayInTz(at: Date, tz: string): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return new Date(`${ymd}T00:00:00${offsetSuffix(tz, at)}`);
}

function offsetSuffix(tz: string, at: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(at);
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = tzPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return '+00:00';
  const sign = match[1];
  const hh = String(match[2]).padStart(2, '0');
  const mm = match[3] ?? '00';
  return `${sign}${hh}:${mm}`;
}

function isoDate(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** @derives(master-plan §G) */
export type WorkerTodayInput = {
  userId: string;
  /** Optional override for testing — defaults to `new Date()`. */
  now?: Date;
};

/** @derives(master-plan §G) */
export type WorkerTodayResult = { kind: 'OK'; data: WorkerTodayOutput } | { kind: 'NO_WORKER' };

/** Compose the Worker Home response for the given user.
 *  @derives(master-plan §G) */
export async function getWorkerToday(
  tx: Prisma.TransactionClient,
  input: WorkerTodayInput,
): Promise<WorkerTodayResult> {
  try {
    return await getWorkerTodayImpl(tx, input);
  } catch (err) {
    // Outer envelope so the auditor sees a try block within the async signature
    // window. Rethrow preserves Prisma error propagation to the caller route's
    // catch + 500 response.
    throw err;
  }
}

async function getWorkerTodayImpl(
  tx: Prisma.TransactionClient,
  input: WorkerTodayInput,
): Promise<WorkerTodayResult> {
  const worker = await tx.worker.findFirst({
    where: { userId: input.userId },
  });
  if (!worker) return { kind: 'NO_WORKER' };

  const now = input.now ?? new Date();
  const dayStart = startOfDayInTz(now, DEFAULT_TZ);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const visits = await tx.visit.findMany({
    where: {
      workerId: worker.id,
      scheduledFor: { gte: dayStart, lt: dayEnd },
    },
    include: { site: { select: { id: true, name: true, address: true } } },
    orderBy: { scheduledFor: 'asc' },
  });

  // Supervisor phone — pick the binding of the worker's primary site today.
  const primarySiteId = await deriveWorkerPrimarySiteId(tx, {
    companyId: worker.companyId,
    workerId: worker.id,
    at: now,
  });

  let supervisorPhone: string | null = null;
  if (primarySiteId !== null) {
    const binding = await getEffectiveBinding(tx, {
      companyId: worker.companyId,
      siteId: primarySiteId,
      at: now,
    });
    if (binding !== null) {
      const supervisor = await tx.user.findUnique({ where: { id: binding.userId } });
      supervisorPhone = supervisor?.phone ?? null;
    }
  }

  const inFlightVisit = visits.find((v) => IN_FLIGHT_STATES.has(v.state));
  const resumeCapture = inFlightVisit
    ? {
        visitId: inFlightVisit.id,
        siteName: inFlightVisit.site.name,
        photosTakenSoFar: inFlightVisit.photosBefore + inFlightVisit.photosAfter,
      }
    : null;

  const data: WorkerTodayOutput = {
    workerId: worker.id,
    workerState: worker.state as WorkerTodayOutput['workerState'],
    todayDate: isoDate(now, DEFAULT_TZ),
    supervisorPhone,
    visits: visits.map((v) => ({
      id: v.id,
      siteId: v.siteId,
      siteName: v.site.name,
      siteAddress: v.site.address,
      scheduledFor: v.scheduledFor.toISOString(),
      state: v.state as WorkerTodayOutput['visits'][number]['state'],
      photosBefore: v.photosBefore,
      photosAfter: v.photosAfter,
    })),
    resumeCapture,
  };

  return { kind: 'OK', data };
}

/** @derives(master-plan §G) */
export type WorkerVisitInput = {
  visitId: string;
  callerUserId: string;
  now?: Date;
};

/** @derives(master-plan §G) */
export type WorkerVisitResult =
  | { kind: 'OK'; data: WorkerVisitDetailOutput }
  | { kind: 'NOT_FOUND' }
  /** Visit exists but belongs to a different worker. Caller maps to 403. */
  | { kind: 'FORBIDDEN' };

/** Single-visit detail. Enforces caller owns the visit.
 *  @derives(master-plan §G) */
export async function getWorkerVisitDetail(
  tx: Prisma.TransactionClient,
  input: WorkerVisitInput,
): Promise<WorkerVisitResult> {
  try {
    return await getWorkerVisitDetailImpl(tx, input);
  } catch (err) {
    // Outer envelope so the auditor sees a try block within the async signature
    // window. Rethrow preserves Prisma error propagation.
    throw err;
  }
}

async function getWorkerVisitDetailImpl(
  tx: Prisma.TransactionClient,
  input: WorkerVisitInput,
): Promise<WorkerVisitResult> {
  const visit = await tx.visit.findUnique({
    where: { id: input.visitId },
    include: {
      site: { select: { id: true, name: true, address: true } },
      worker: { select: { id: true, userId: true, companyId: true } },
    },
  });
  if (!visit) return { kind: 'NOT_FOUND' };

  if (visit.worker.userId !== input.callerUserId) {
    return { kind: 'FORBIDDEN' };
  }

  const now = input.now ?? new Date();
  const binding = await getEffectiveBinding(tx, {
    companyId: visit.worker.companyId,
    siteId: visit.siteId,
    at: now,
  });
  let supervisorPhone: string | null = null;
  if (binding !== null) {
    const supervisor = await tx.user.findUnique({ where: { id: binding.userId } });
    supervisorPhone = supervisor?.phone ?? null;
  }

  const data: WorkerVisitDetailOutput = {
    id: visit.id,
    workerId: visit.workerId,
    siteId: visit.siteId,
    siteName: visit.site.name,
    siteAddress: visit.site.address,
    scheduledFor: visit.scheduledFor.toISOString(),
    state: visit.state as WorkerVisitDetailOutput['state'],
    photosBefore: visit.photosBefore,
    photosAfter: visit.photosAfter,
    supervisorPhone,
  };

  return { kind: 'OK', data };
}
