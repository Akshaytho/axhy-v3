/**
 * Worker capture-flow helpers — open-slot selection, before-phase advance, upload retry.
 *
 * @derives(master-plan §G) — worker capture flow
 */
import type { UploadStatus } from './r2-upload-queue';

export function nextOpenCaptureSlot(
  occupiedIndices: ReadonlyArray<number>,
  totalSlots: number,
): number | null {
  for (let index = 1; index <= totalSlots; index += 1) {
    if (!occupiedIndices.includes(index)) return index;
  }
  return null;
}

export function beforePhaseAdvanceStep(visitState: string | null | undefined): 'review' | 'timer' {
  return visitState === 'PHOTOS_PENDING' ? 'review' : 'timer';
}

export function shouldRetryFailedUpload(
  status: UploadStatus | null,
  localUri: string | null,
): boolean {
  return status === 'failed' && typeof localUri === 'string' && localUri.length > 0;
}
