/**
 * Worker capture-flow helpers — open-slot selection, before-phase advance, upload retry.
 *
 * @derives(master-plan §G) — worker capture flow
 */
import type { UploadStatus } from './r2-upload-queue';

/** Per-phase photo bounds (contract 02/05-*-capture: minimum 3, maximum 8).
 *  3 is the floor (also enforced server-side at submit); 8 is the ceiling so a
 *  worker can add coverage on a complex site via "+ Add more". */
export const MIN_PHOTOS_PER_PHASE = 3;
export const MAX_PHOTOS_PER_PHASE = 8;

export function nextOpenCaptureSlot(
  occupiedIndices: ReadonlyArray<number>,
  totalSlots: number,
): number | null {
  for (let index = 1; index <= totalSlots; index += 1) {
    if (!occupiedIndices.includes(index)) return index;
  }
  return null;
}

/**
 * Step after the worker taps "Done →" on Before-Photos Capture.
 *
 * Normal forward flow → the dedicated Before-Review checkpoint (contract 03).
 * A visit already past cleaning (resumed at PHOTOS_PENDING) jumps straight to
 * the combined Final Review. Clock-in (→IN_PROGRESS) is NOT fired here anymore;
 * it fires on Before-Review's "Start cleaning →".
 */
export function beforePhaseAdvanceStep(
  visitState: string | null | undefined,
): 'review' | 'before-photos-review' {
  return visitState === 'PHOTOS_PENDING' ? 'review' : 'before-photos-review';
}

export function shouldRetryFailedUpload(
  status: UploadStatus | null,
  localUri: string | null,
): boolean {
  return status === 'failed' && typeof localUri === 'string' && localUri.length > 0;
}
