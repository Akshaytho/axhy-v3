/**
 * Worker /today + /visits/:id Zod schemas.
 *
 * Read-only endpoints for slice 2a. Both responses include visit state values
 * (visitMachine vocabulary) and worker state values (workerMachine vocabulary)
 * that the UI maps to badges + banners. Mobile NEVER simulates state — it
 * always reads from these responses.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(F-006b worker-shell)
 */

import { z } from 'zod';

import { VisitStateSchema } from './supervisor.js';

/** Worker lifecycle vocabulary — matches `workerMachine.WorkerStateValue`.
 *  @derives(master-plan §G) */
export const WorkerStateSchema = z.enum([
  'INVITED',
  'PENDING_ACTIVATION',
  'ACTIVE',
  'ON_LEAVE',
  'ON_SUSPENSION',
  'ABSENT',
  'AT_RISK',
  'BLOCKED',
  'DOC_PENDING',
  'TRANSFER_PENDING',
  'INACTIVE',
  'TERMINATION_PENDING',
  'TERMINATED',
  'ARCHIVED',
  'ANONYMIZED',
]);
/** @derives(master-plan §G) */
export type WorkerState = z.infer<typeof WorkerStateSchema>;

const VisitRowSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  siteName: z.string(),
  siteAddress: z.string().nullable(),
  scheduledFor: z.string(),
  state: VisitStateSchema,
  photosBefore: z.number().int().nonnegative(),
  photosAfter: z.number().int().nonnegative(),
  /** ISO timestamp of clock-in (Visit.startedAt); null until the worker starts cleaning. */
  startedAt: z.string().nullable(),
  /** ISO timestamp of clock-out (Visit.completedAt); null until cleaning is finished. */
  completedAt: z.string().nullable(),
});

const ResumeCaptureSchema = z.object({
  visitId: z.string().uuid(),
  siteName: z.string(),
  photosTakenSoFar: z.number().int().nonnegative(),
});

const WorkerHistoryVisitRowSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  siteName: z.string(),
  siteAddress: z.string().nullable(),
  scheduledFor: z.string(),
  state: VisitStateSchema,
  photosBefore: z.number().int().nonnegative(),
  photosAfter: z.number().int().nonnegative(),
});

/**
 * GET /worker/today response.
 *
 * Composes the Home screen's data: today's visits in start-time order,
 * the worker's own state (for "account paused" banner), and a resume-capture
 * pointer when any visit is in flight (EN_ROUTE / ON_SITE / IN_PROGRESS /
 * PHOTOS_PENDING).
 *
 * Timezone: dates resolve to the worker's company timezone. Slice 2a defaults
 * to Asia/Kolkata since `Company.tz` is not yet on the schema — when a
 * `Company.tz` column lands, the service reads it.
 *
 * @derives(master-plan §G)
 */
export const WorkerTodayOutput = z.object({
  workerId: z.string().uuid(),
  workerState: WorkerStateSchema,
  todayDate: z.string(),
  supervisorPhone: z.string().nullable(),
  visits: z.array(VisitRowSchema),
  resumeCapture: ResumeCaptureSchema.nullable(),
});
/** @derives(master-plan §G) */
export type WorkerTodayOutput = z.infer<typeof WorkerTodayOutput>;

/**
 * GET /worker/history response.
 *
 * Returns the worker's recent completed / closed visit history across multiple
 * days so the history screen is backed by real data instead of today's payload.
 *
 * @derives(master-plan §G)
 */
export const WorkerHistoryOutput = z.object({
  workerId: z.string().uuid(),
  windowDays: z.number().int().positive(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    flagged: z.number().int().nonnegative(),
    awaitingVerification: z.number().int().nonnegative(),
  }),
  visits: z.array(WorkerHistoryVisitRowSchema),
});
/** @derives(master-plan §G) */
export type WorkerHistoryOutput = z.infer<typeof WorkerHistoryOutput>;

/**
 * GET /worker/visits/:id response.
 *
 * Single-visit detail for the Assignment Detail screen. Includes a few fields
 * the Home list omits (full site address, supervisor phone for tap-to-call).
 * Authorization: caller must be the visit's worker (compared via Worker.userId).
 *
 * @derives(master-plan §G)
 */
export const WorkerVisitDetailOutput = z.object({
  id: z.string().uuid(),
  workerId: z.string().uuid(),
  siteId: z.string().uuid(),
  siteName: z.string(),
  siteAddress: z.string().nullable(),
  scheduledFor: z.string(),
  state: VisitStateSchema,
  photosBefore: z.number().int().nonnegative(),
  photosAfter: z.number().int().nonnegative(),
  supervisorPhone: z.string().nullable(),
});
/** @derives(master-plan §G) */
export type WorkerVisitDetailOutput = z.infer<typeof WorkerVisitDetailOutput>;
