import type { WorkerTodayOutput } from '@axhy/shared-schema';

/** @derives(master-plan §G) */
export type WorkerTodayVisit = WorkerTodayOutput['visits'][number];

const ACTIVE_CAPTURE_STATES = new Set(['IN_PROGRESS', 'PHOTOS_PENDING']);
const UPCOMING_CAPTURE_STATES = new Set(['SCHEDULED', 'NOTIFIED', 'EN_ROUTE', 'ON_SITE']);

/** @derives(master-plan §G) */
export function findWorkerTodayVisit(
  data: WorkerTodayOutput | undefined,
  visitId: string,
): WorkerTodayVisit | null {
  if (!data || !visitId) return null;
  return data.visits.find((visit) => visit.id === visitId) ?? null;
}

/** @derives(master-plan §G) */
export function pickWorkerCaptureVisit(
  data: WorkerTodayOutput | undefined,
): WorkerTodayVisit | null {
  if (!data || data.visits.length === 0) return null;

  if (data.resumeCapture) {
    const resumed = findWorkerTodayVisit(data, data.resumeCapture.visitId);
    if (resumed) return resumed;
  }

  const active = data.visits
    .filter((visit) => ACTIVE_CAPTURE_STATES.has(visit.state))
    .sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());
  if (active.length > 0) return active[0] ?? null;

  const upcoming = data.visits
    .filter((visit) => UPCOMING_CAPTURE_STATES.has(visit.state))
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  if (upcoming.length > 0) return upcoming[0] ?? null;

  return null;
}

/** @derives(master-plan §G) */
export function formatWorkerVisitLocation(visit: WorkerTodayVisit | null): string {
  if (!visit) return 'Site completed';
  const siteName = visit.siteName.trim();
  const siteAddress = visit.siteAddress?.trim();
  if (siteName && siteAddress) return `${siteName} · ${siteAddress}`;
  if (siteName) return siteName;
  if (siteAddress) return siteAddress;
  return 'Site completed';
}
