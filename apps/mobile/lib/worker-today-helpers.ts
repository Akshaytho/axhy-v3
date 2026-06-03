import type { WorkerTodayOutput } from '@axhy/shared-schema';

import { NAV_ROUTES } from './api-routes';

/** @derives(master-plan §G) */
export type WorkerTodayVisit = WorkerTodayOutput['visits'][number];

const TERMINAL_VISIT_STATES = new Set(['VERIFIED', 'FLAGGED', 'CANCELLED', 'NO_SHOW', 'ARCHIVED']);

// Home-card priority — lower index wins. Mirrors
// docs/capture-submission_flow/00-overview.md "Home card priority":
//   1. active timer  (IN_PROGRESS)
//   2. submit pending (PHOTOS_PENDING)
//   3. verifying with no action (AWAITING_VERIFICATION)
//   4. next scheduled (ON_SITE > EN_ROUTE > NOTIFIED > SCHEDULED)
//   5. completed (terminal — handled separately, never returned by picker)
const HOME_PRIORITY: ReadonlyArray<string> = [
  'IN_PROGRESS',
  'PHOTOS_PENDING',
  'AWAITING_VERIFICATION',
  'ON_SITE',
  'EN_ROUTE',
  'NOTIFIED',
  'SCHEDULED',
];

/** @derives(master-plan §G) */
export function findWorkerTodayVisit(
  data: WorkerTodayOutput | undefined,
  visitId: string,
): WorkerTodayVisit | null {
  if (!data || !visitId) return null;
  return data.visits.find((visit) => visit.id === visitId) ?? null;
}

/**
 * Pick the visit the hero card should anchor on.
 *
 * Strict priority by state (see HOME_PRIORITY above). Within the same bucket:
 * for active/pending/verifying buckets, earliest scheduled wins (resume the
 * one started first). For the upcoming bucket, earliest scheduled also wins
 * (next on the clock).
 *
 * @derives(docs/capture-submission_flow/00-overview.md — Home card priority)
 */
export function pickWorkerCaptureVisit(
  data: WorkerTodayOutput | undefined,
): WorkerTodayVisit | null {
  if (!data || data.visits.length === 0) return null;

  const ranked = data.visits
    .filter((visit) => HOME_PRIORITY.includes(visit.state))
    .sort((a, b) => {
      const pa = HOME_PRIORITY.indexOf(a.state);
      const pb = HOME_PRIORITY.indexOf(b.state);
      if (pa !== pb) return pa - pb;
      return new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
    });
  return ranked[0] ?? null;
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

/**
 * Resume routing — deterministic per visit state.
 *
 * Mapping mirrors the visit-state table in
 * docs/capture-submission_flow/00-overview.md so the worker always reopens
 * at the correct step:
 *   SCHEDULED / NOTIFIED / EN_ROUTE → QR Scan
 *   ON_SITE                         → Before Photos (QR already cleared)
 *   IN_PROGRESS                     → Timer
 *   PHOTOS_PENDING                  → Final Review
 *   AWAITING_VERIFICATION           → Submit + Status
 *   terminal                        → Visit Detail
 *
 * @derives(docs/capture-submission_flow/00-overview.md — Visit state at each step)
 */
export function workerCaptureRouteForVisit(visit: WorkerTodayVisit): string {
  if (TERMINAL_VISIT_STATES.has(visit.state)) {
    return NAV_ROUTES.workerVisitDetail(visit.id);
  }
  if (visit.state === 'AWAITING_VERIFICATION') {
    return NAV_ROUTES.workerCaptureStep(visit.id, 'submit');
  }
  if (visit.state === 'PHOTOS_PENDING') {
    return NAV_ROUTES.workerCaptureStep(visit.id, 'review');
  }
  if (visit.state === 'IN_PROGRESS') {
    return NAV_ROUTES.workerCaptureStep(visit.id, 'timer');
  }
  if (visit.state === 'ON_SITE') {
    return NAV_ROUTES.workerCaptureStep(visit.id, 'before-photos');
  }
  return NAV_ROUTES.workerCaptureEntry(visit.id);
}
