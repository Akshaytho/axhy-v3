/**
 * Slice 1 — home-card priority + resume routing unit tests.
 *
 * Asserts the contract from docs/capture-submission_flow/00-overview.md:
 *   - Home card priority: active timer > submit pending > verifying >
 *     next scheduled.
 *   - Resume routing per visit state lands the worker at the correct step.
 *
 * @derives(docs/capture-submission_flow/00-overview.md)
 */

import { describe, expect, it } from 'vitest';
import type { WorkerTodayOutput } from '@axhy/shared-schema';

import {
  pickWorkerCaptureVisit,
  workerCaptureRouteForVisit,
  type WorkerTodayVisit,
} from './worker-today-helpers';
import { NAV_ROUTES } from './api-routes';

function makeVisit(
  overrides: Partial<WorkerTodayVisit> & Pick<WorkerTodayVisit, 'id' | 'state' | 'scheduledFor'>,
): WorkerTodayVisit {
  return {
    siteId: 'site-1',
    siteName: 'Test Site',
    siteAddress: null,
    photosBefore: 0,
    photosAfter: 0,
    ...overrides,
  } as WorkerTodayVisit;
}

function makeToday(visits: WorkerTodayVisit[]): WorkerTodayOutput {
  return {
    workerId: '00000000-0000-0000-0000-000000000001',
    workerState: 'ACTIVE',
    todayDate: '2026-06-03',
    supervisorPhone: null,
    visits,
    resumeCapture: null,
  };
}

describe('pickWorkerCaptureVisit — home card priority', () => {
  it('prefers IN_PROGRESS over PHOTOS_PENDING and SCHEDULED', () => {
    const today = makeToday([
      makeVisit({ id: 'a', state: 'SCHEDULED', scheduledFor: '2026-06-03T08:00:00Z' }),
      makeVisit({ id: 'b', state: 'PHOTOS_PENDING', scheduledFor: '2026-06-03T09:00:00Z' }),
      makeVisit({ id: 'c', state: 'IN_PROGRESS', scheduledFor: '2026-06-03T11:00:00Z' }),
    ]);
    expect(pickWorkerCaptureVisit(today)?.id).toBe('c');
  });

  it('prefers PHOTOS_PENDING over AWAITING_VERIFICATION and SCHEDULED', () => {
    const today = makeToday([
      makeVisit({ id: 'a', state: 'AWAITING_VERIFICATION', scheduledFor: '2026-06-03T08:00:00Z' }),
      makeVisit({ id: 'b', state: 'SCHEDULED', scheduledFor: '2026-06-03T09:00:00Z' }),
      makeVisit({ id: 'c', state: 'PHOTOS_PENDING', scheduledFor: '2026-06-03T11:00:00Z' }),
    ]);
    expect(pickWorkerCaptureVisit(today)?.id).toBe('c');
  });

  it('prefers AWAITING_VERIFICATION over ON_SITE and SCHEDULED', () => {
    const today = makeToday([
      makeVisit({ id: 'a', state: 'SCHEDULED', scheduledFor: '2026-06-03T08:00:00Z' }),
      makeVisit({ id: 'b', state: 'ON_SITE', scheduledFor: '2026-06-03T09:00:00Z' }),
      makeVisit({ id: 'c', state: 'AWAITING_VERIFICATION', scheduledFor: '2026-06-03T11:00:00Z' }),
    ]);
    expect(pickWorkerCaptureVisit(today)?.id).toBe('c');
  });

  it('falls through to the earliest upcoming visit when nothing is in flight', () => {
    const today = makeToday([
      makeVisit({ id: 'late', state: 'SCHEDULED', scheduledFor: '2026-06-03T14:00:00Z' }),
      makeVisit({ id: 'early', state: 'SCHEDULED', scheduledFor: '2026-06-03T08:00:00Z' }),
      makeVisit({ id: 'mid', state: 'SCHEDULED', scheduledFor: '2026-06-03T10:00:00Z' }),
    ]);
    expect(pickWorkerCaptureVisit(today)?.id).toBe('early');
  });

  it('ignores terminal states entirely (completed do not surface as hero)', () => {
    const today = makeToday([
      makeVisit({ id: 'done', state: 'VERIFIED', scheduledFor: '2026-06-03T08:00:00Z' }),
      makeVisit({ id: 'flagged', state: 'FLAGGED', scheduledFor: '2026-06-03T09:00:00Z' }),
    ]);
    expect(pickWorkerCaptureVisit(today)).toBeNull();
  });

  it('within the IN_PROGRESS bucket, the earliest scheduled wins', () => {
    const today = makeToday([
      makeVisit({ id: 'late', state: 'IN_PROGRESS', scheduledFor: '2026-06-03T14:00:00Z' }),
      makeVisit({ id: 'early', state: 'IN_PROGRESS', scheduledFor: '2026-06-03T08:00:00Z' }),
    ]);
    expect(pickWorkerCaptureVisit(today)?.id).toBe('early');
  });

  it('returns null for empty data', () => {
    expect(pickWorkerCaptureVisit(undefined)).toBeNull();
    expect(pickWorkerCaptureVisit(makeToday([]))).toBeNull();
  });
});

describe('workerCaptureRouteForVisit — deterministic resume routing', () => {
  const id = '00000000-0000-0000-0000-0000000000aa';

  it('routes SCHEDULED to the QR scan entry', () => {
    const v = makeVisit({ id, state: 'SCHEDULED', scheduledFor: '2026-06-03T08:00:00Z' });
    expect(workerCaptureRouteForVisit(v)).toBe(NAV_ROUTES.workerCaptureEntry(id));
  });

  it('routes NOTIFIED to the QR scan entry', () => {
    const v = makeVisit({ id, state: 'NOTIFIED', scheduledFor: '2026-06-03T08:00:00Z' });
    expect(workerCaptureRouteForVisit(v)).toBe(NAV_ROUTES.workerCaptureEntry(id));
  });

  it('routes EN_ROUTE to the QR scan entry', () => {
    const v = makeVisit({ id, state: 'EN_ROUTE', scheduledFor: '2026-06-03T08:00:00Z' });
    expect(workerCaptureRouteForVisit(v)).toBe(NAV_ROUTES.workerCaptureEntry(id));
  });

  it('routes ON_SITE to before-photos (QR is already cleared)', () => {
    const v = makeVisit({ id, state: 'ON_SITE', scheduledFor: '2026-06-03T08:00:00Z' });
    expect(workerCaptureRouteForVisit(v)).toBe(NAV_ROUTES.workerCaptureStep(id, 'before-photos'));
  });

  it('routes IN_PROGRESS to timer', () => {
    const v = makeVisit({ id, state: 'IN_PROGRESS', scheduledFor: '2026-06-03T08:00:00Z' });
    expect(workerCaptureRouteForVisit(v)).toBe(NAV_ROUTES.workerCaptureStep(id, 'timer'));
  });

  it('routes PHOTOS_PENDING to final review', () => {
    const v = makeVisit({ id, state: 'PHOTOS_PENDING', scheduledFor: '2026-06-03T08:00:00Z' });
    expect(workerCaptureRouteForVisit(v)).toBe(NAV_ROUTES.workerCaptureStep(id, 'review'));
  });

  it('routes AWAITING_VERIFICATION to submit', () => {
    const v = makeVisit({
      id,
      state: 'AWAITING_VERIFICATION',
      scheduledFor: '2026-06-03T08:00:00Z',
    });
    expect(workerCaptureRouteForVisit(v)).toBe(NAV_ROUTES.workerCaptureStep(id, 'submit'));
  });

  it('routes terminal states to the visit detail screen', () => {
    for (const state of ['VERIFIED', 'FLAGGED', 'CANCELLED', 'NO_SHOW', 'ARCHIVED'] as const) {
      const v = makeVisit({ id, state, scheduledFor: '2026-06-03T08:00:00Z' });
      expect(workerCaptureRouteForVisit(v)).toBe(NAV_ROUTES.workerVisitDetail(id));
    }
  });
});
