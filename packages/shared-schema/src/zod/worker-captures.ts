/**
 * Worker captures Zod schemas — shared between backend, mobile.
 *
 * The capture pipeline (sub-slice 2b-2) generates presigned R2 upload URLs in
 * batch. The worker mobile app calls POST /worker/captures/upload-urls with the
 * visitId + an array of files (one entry per before/after photo slot); the
 * backend returns one signed URL per file and the mobile PUTs each photo
 * directly to R2.
 *
 * Object keys live under `v3-captures/{workerId}/{visitId}/{phase}-{NN}.jpg`.
 * The bucket (`axhy-worker-photos`) is configured via env vars on Railway, not
 * encoded here.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { z } from 'zod';

/** Photo phase as written into the visit lifecycle. Matches mobile
 *  `lib/storage/per-user-partition.ts` PhotoPhase + backend VisitPhoto.side.
 *  @derives(master-plan §G) */
export const PhotoPhaseSchema = z.enum(['before', 'after']);
/** @derives(master-plan §G) */
export type PhotoPhase = z.infer<typeof PhotoPhaseSchema>;

/** Max single-photo size accepted by the presign route. Mobile is expected to
 *  downscale via expo-image-manipulator before requesting a URL.
 *  @derives(master-plan §G) */
export const MAX_PHOTO_BYTES = 20_000_000;

/** Max photos per batch request. Mirrors v2's `/media/presign-batch` cap.
 *  @derives(master-plan §G) */
export const MAX_PHOTOS_PER_BATCH = 20;

/** Per-photo presign request entry.
 *  @derives(master-plan §G) */
export const UploadUrlFileSchema = z.object({
  phase: PhotoPhaseSchema,
  /** 1-based slot index inside the phase (matches `getPhotoPath`). */
  index: z.number().int().min(1).max(3),
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp)$/, 'contentType must be image/jpeg, image/png, or image/webp'),
  fileSize: z.number().int().min(1).max(MAX_PHOTO_BYTES),
});
/** @derives(master-plan §G) */
export type UploadUrlFile = z.infer<typeof UploadUrlFileSchema>;

/** Batch presign request body.
 *  @derives(master-plan §G) */
export const UploadUrlsRequestSchema = z.object({
  visitId: z.string().min(1),
  files: z.array(UploadUrlFileSchema).min(1).max(MAX_PHOTOS_PER_BATCH),
});
/** @derives(master-plan §G) */
export type UploadUrlsRequest = z.infer<typeof UploadUrlsRequestSchema>;

/** Per-photo presigned URL returned by the backend.
 *  @derives(master-plan §G) */
export const UploadUrlEntrySchema = z.object({
  phase: PhotoPhaseSchema,
  index: z.number().int().min(1).max(3),
  /** Signed PUT URL the mobile uploads directly to. */
  uploadUrl: z.string().url(),
  /** Final object key in the R2 bucket (`v3-captures/...`). */
  objectKey: z.string().min(1),
  /** ISO timestamp when the signed URL expires. */
  expiresAt: z.string().datetime(),
});
/** @derives(master-plan §G) */
export type UploadUrlEntry = z.infer<typeof UploadUrlEntrySchema>;

/** Batch presign response body.
 *  @derives(master-plan §G) */
export const UploadUrlsResponseSchema = z.object({
  urls: z.array(UploadUrlEntrySchema),
});
/** @derives(master-plan §G) */
export type UploadUrlsResponse = z.infer<typeof UploadUrlsResponseSchema>;
