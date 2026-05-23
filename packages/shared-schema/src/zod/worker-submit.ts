/**
 * Shared Zod schemas for the worker Submit + Verify-status endpoints.
 *
 * Submit: POST /worker/visits/:visitId/submit
 *   Mobile sends (phase, index, contentType) tuples; backend reconstructs
 *   r2Keys server-side via buildObjectKey() so the client never holds
 *   arbitrary key paths (deferred #3 from 2b-2 review).
 *
 * VerifyStatus: GET /worker/visits/:visitId/verify-status
 *   Mobile polls until visitState reaches a terminal verify state.
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T2)
 */

import { z } from 'zod';

/** One photo slot descriptor sent from mobile at submit time. */
export const WorkerSubmitPhotoSchema = z.object({
  phase: z.enum(['before', 'after']),
  index: z.number().int().min(1).max(3),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
export type WorkerSubmitPhoto = z.infer<typeof WorkerSubmitPhotoSchema>;

/** POST /worker/visits/:visitId/submit request body. */
export const WorkerSubmitRequestSchema = z.object({
  photos: z.array(WorkerSubmitPhotoSchema).min(1).max(6),
});
export type WorkerSubmitRequest = z.infer<typeof WorkerSubmitRequestSchema>;

/** POST /worker/visits/:visitId/submit success response. */
export const WorkerSubmitResponseSchema = z.object({
  visitId: z.string().uuid(),
  visitState: z.literal('AWAITING_VERIFICATION'),
  photosBefore: z.number().int().min(0),
  photosAfter: z.number().int().min(0),
});
export type WorkerSubmitResponse = z.infer<typeof WorkerSubmitResponseSchema>;

/** One photo entry in the verify-status response. */
export const VerifyStatusPhotoSchema = z.object({
  id: z.string().uuid(),
  side: z.enum(['BEFORE', 'AFTER']),
  aiVerifyStatus: z.enum(['PENDING', 'PASS', 'FLAGGED', 'NEEDS_REVIEW']),
});
export type VerifyStatusPhoto = z.infer<typeof VerifyStatusPhotoSchema>;

/** GET /worker/visits/:visitId/verify-status response. */
export const VerifyStatusResponseSchema = z.object({
  visitId: z.string().uuid(),
  visitState: z.string(),
  photos: z.array(VerifyStatusPhotoSchema),
});
export type VerifyStatusResponse = z.infer<typeof VerifyStatusResponseSchema>;
