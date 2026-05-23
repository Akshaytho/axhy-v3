/**
 * Per-user, per-visit photo-storage path helpers + I/O.
 *
 * The capture flow writes before/after photos into the app's INTERNAL
 * documentDirectory under a per-worker, per-visit partition. No gallery
 * access (founder lock 2026-05-21). Photos are uploaded incrementally to
 * R2 by sub-slice 2b-2 and swept locally after 30 days by sub-slice 2b-4.
 *
 * Path builders (`getWorkerCaptureDir`, `getVisitCaptureDir`, `getPhotoPath`)
 * are pure strings. I/O helpers (`ensureDir`, `writePhoto`, `listPhotos`,
 * `deletePhoto`) wrap the expo-file-system v19 `Directory` + `File` classes.
 *
 * Web caveat: `Paths.document` is unavailable on Expo Web (`documentDirectory`
 * resolves but writes are no-op). The I/O helpers short-circuit when
 * `Platform.OS === 'web'` so Playwright scaffold runs don't crash.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 * @derives(NEXT_SESSION.md "Decisions still in force" — founder lock 2026-05-21)
 */

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Photo phase as it appears in the visit lifecycle.
 *
 * @derives(master-plan §G)
 */
export type PhotoPhase = 'before' | 'after';

/**
 * Root URI for the current install's captures. Null on Expo Web because
 * `Paths.document` throws there (expo-file-system v19 has no web filesystem).
 * The CAPTURES_ROOT string ends with a trailing slash so the path-builder
 * helpers can concatenate cleanly.
 *
 * @derives(master-plan §G)
 */
function computeCapturesRoot(): string | null {
  if (Platform.OS === 'web') return null;
  try {
    const uri = Paths.document.uri;
    return uri.endsWith('/') ? `${uri}captures/` : `${uri}/captures/`;
  } catch {
    return null;
  }
}

/** @derives(master-plan §G) */
export const CAPTURES_ROOT: string | null = computeCapturesRoot();

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

/** True on platforms where the filesystem can actually be written. Web short-
 *  circuits to false so callers can no-op without throwing.
 *  @derives(master-plan §G) */
export function canPersistCaptures(): boolean {
  return Platform.OS !== 'web' && CAPTURES_ROOT !== null;
}

/** Idempotently create the per-visit directory. No-op on web.
 *  @derives(master-plan §G) */
export async function ensureDir(workerId: string, visitId: string): Promise<void> {
  if (!canPersistCaptures()) return;
  const dir = new Directory(Paths.document, 'captures', workerId, visitId);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

/** Copy a source URI (typically the expo-camera capture URI) into the per-user
 *  partition at the canonical slot path. Returns the destination path string.
 *  On web returns the source URI unchanged (no copy possible).
 *  @derives(master-plan §G) */
export async function writePhoto(
  workerId: string,
  visitId: string,
  phase: PhotoPhase,
  index: number,
  sourceUri: string,
): Promise<string> {
  if (!canPersistCaptures()) return sourceUri;
  await ensureDir(workerId, visitId);
  const destPath = getPhotoPath(workerId, visitId, phase, index);
  const destFile = new File(destPath);
  if (destFile.exists) {
    destFile.delete();
  }
  const sourceFile = new File(sourceUri);
  sourceFile.copy(destFile);
  return destPath;
}

/** List photo paths persisted for a given (workerId, visitId, phase). Returns
 *  empty array on web or when the directory does not exist yet.
 *  @derives(master-plan §G) */
export async function listPhotos(
  workerId: string,
  visitId: string,
  phase: PhotoPhase,
): Promise<string[]> {
  if (!canPersistCaptures()) return [];
  const dir = new Directory(Paths.document, 'captures', workerId, visitId);
  if (!dir.exists) return [];
  const entries = dir.list();
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry instanceof File && entry.name.startsWith(`${phase}-`)) {
      paths.push(entry.uri);
    }
  }
  paths.sort();
  return paths;
}

/** Delete one photo slot. No-op on web or when the file is absent.
 *  @derives(master-plan §G) */
export async function deletePhoto(
  workerId: string,
  visitId: string,
  phase: PhotoPhase,
  index: number,
): Promise<void> {
  if (!canPersistCaptures()) return;
  const path = getPhotoPath(workerId, visitId, phase, index);
  const file = new File(path);
  if (file.exists) {
    file.delete();
  }
}
