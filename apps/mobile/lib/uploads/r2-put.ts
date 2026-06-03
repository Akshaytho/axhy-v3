/**
 * Timeout-guarded transport for worker capture photo uploads.
 *
 * Extracted from r2-upload-queue so the network-with-timeout logic is unit
 * testable without importing react-native (whose Flow-typed source breaks
 * vitest's node transform — see lib/uploads/photo-upload.ts for the same note).
 *
 * Why this exists (HIGH-12, 2026-05-24 product code review): the previous
 * `fetch(uploadUrl, { method: 'PUT', body })` had no AbortController, so on a
 * patchy Indian mobile network a ~2MB PUT could hang indefinitely — the queue's
 * exponential backoff never fired because the promise never settled, leaving the
 * worker stuck with "uploading…" forever. Bounding every network step makes a
 * stalled socket abort, the promise reject, and the existing backoff retry.
 *
 * @derives(docs/audits/2026-05-24-product-code-review.md > HIGH-12)
 */

/**
 * Default upload timeout. Generous enough for a ~2MB photo on slow 3G (≈50 KB/s
 * ⇒ ~40s) yet short enough that a genuinely dead socket aborts and the backoff
 * retry can take over. The api.ts JSON layer uses 15s; binary uploads need more
 * headroom, hence a dedicated constant rather than reusing DEFAULT_TIMEOUT_MS.
 */
/** @derives(master-plan §G) */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** @derives(master-plan §G) */
export type R2ContentType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Typed stall error so the queue's lastError distinguishes a timeout from a
 *  genuine non-2xx rejection.
 *  @derives(master-plan §G) */
export class UploadTimeoutError extends Error {
  constructor(message = 'Upload timed out') {
    super(message);
    this.name = 'UploadTimeoutError';
  }
}

/**
 * `fetch` wrapped in an AbortController timeout. On expiry the request is
 * aborted and a typed {@link UploadTimeoutError} is thrown; any other rejection
 * (a genuine network error) propagates unchanged. The timer is always cleared.
 *
 * @derives(master-plan §G)
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    // AbortError is the only thing the timer turns a pending fetch into; surface
    // it as a typed timeout. A real fetch reject (DNS, connection reset) bubbles.
    if (controller.signal.aborted) {
      throw new UploadTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a local file and PUT it to a presigned R2 URL, both steps time-bounded.
 * Throws {@link UploadTimeoutError} on a stall, or a status-bearing Error on a
 * non-2xx PUT (which the queue records and retries via backoff).
 *
 * @derives(master-plan §G)
 */
export async function putFileToR2(
  localUri: string,
  uploadUrl: string,
  contentType: R2ContentType,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<void> {
  // Reading the local file is normally instant, but a deleted/again-mounted
  // file URI can hang the platform fetch, so bound it too.
  const fileRes = await fetchWithTimeout(localUri, {}, timeoutMs);
  const blob = await fileRes.blob();
  const putRes = await fetchWithTimeout(
    uploadUrl,
    { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob },
    timeoutMs,
  );
  if (!putRes.ok) {
    throw new Error(`R2 PUT failed: ${putRes.status} ${putRes.statusText}`);
  }
}
