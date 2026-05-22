/**
 * Per-user, per-visit photo-storage path helpers.
 *
 * The capture flow writes before/after photos into the app's INTERNAL
 * documentDirectory under a per-worker, per-visit partition. No gallery
 * access (founder lock 2026-05-21). Photos are uploaded incrementally to
 * R2 by sub-slice 2b-2 and swept locally after 30 days by sub-slice 2b-4.
 *
 * This module exposes pure path builders only. Actual file I/O (mkdir,
 * writeAsStringAsync, deleteAsync) lands in 2b-2 alongside the camera
 * pipeline.
 *
 * Web caveat: documentDirectory is null on Expo Web. Callers writing
 * files must branch on Platform.OS or accept that web is a no-op
 * (Playwright scaffold captures don't exercise storage).
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 * @derives(NEXT_SESSION.md "Decisions still in force" — founder lock 2026-05-21)
 */

import * as FileSystem from 'expo-file-system';

/**
 * Photo phase as it appears in the visit lifecycle.
 *
 * @derives(master-plan §G)
 */
export type PhotoPhase = 'before' | 'after';

/**
 * Root directory for the current install's captures. Null on Expo Web
 * because documentDirectory is unavailable there.
 *
 * @derives(master-plan §G)
 */
export const CAPTURES_ROOT: string | null = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}captures/`
  : null;

/**
 * Returns the per-worker partition directory.
 * Throws on web where documentDirectory is null; callers must guard with
 * Platform.OS or the CAPTURES_ROOT null-check before invoking.
 *
 * @derives(master-plan §G)
 */
export function getWorkerCaptureDir(workerId: string): string {
  if (!CAPTURES_ROOT) {
    throw new Error('Capture storage is unavailable on this platform');
  }
  return `${CAPTURES_ROOT}${workerId}/`;
}

/**
 * Returns the per-visit directory inside the worker partition.
 *
 * @derives(master-plan §G)
 */
export function getVisitCaptureDir(workerId: string, visitId: string): string {
  return `${getWorkerCaptureDir(workerId)}${visitId}/`;
}

/**
 * Returns the absolute path for one photo in a phase. Index is 1-based
 * to match how supervisors and workers count photos verbally ("photo 3").
 *
 * @derives(master-plan §G)
 */
export function getPhotoPath(
  workerId: string,
  visitId: string,
  phase: PhotoPhase,
  index: number,
): string {
  if (index < 1) {
    throw new Error('Photo index must be 1-based');
  }
  return `${getVisitCaptureDir(workerId, visitId)}${phase}-${String(index).padStart(2, '0')}.jpg`;
}
