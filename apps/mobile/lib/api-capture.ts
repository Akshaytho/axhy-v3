/**
 * Mobile API client for the capture pipeline.
 *
 * `requestUploadUrls(visitId, files)` calls POST /worker/captures/upload-urls
 * and returns one presigned PUT URL per file slot. The mobile then uploads
 * directly to Cloudflare R2 from the upload queue.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import {
  UploadUrlsResponseSchema,
  type UploadUrlFile,
  type UploadUrlsResponse,
} from '@axhy/shared-schema';

import { apiFetch } from './api';
import { API_ROUTES } from './api-routes';

/** Request a batch of presigned PUT URLs for a list of photo slots.
 *  @derives(master-plan §G) */
export async function requestUploadUrls(
  visitId: string,
  files: ReadonlyArray<UploadUrlFile>,
): Promise<UploadUrlsResponse> {
  const raw = await apiFetch<unknown>(API_ROUTES.workerCapturesUploadUrls, {
    method: 'POST',
    body: { visitId, files },
  });
  return UploadUrlsResponseSchema.parse(raw);
}
