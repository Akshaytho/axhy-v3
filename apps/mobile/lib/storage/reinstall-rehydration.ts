/**
 * Reinstall rehydration — re-enqueues orphaned photos after a reinstall.
 *
 * On cold-start, scans the worker's per-user partition for photo files
 * whose upload status is unknown (not tracked as done/idle/uploading in
 * the queue). Re-enqueues them so uploads resume automatically.
 *
 * Call after loadQueueState() + r2UploadQueue.hydrate() so already-known
 * items are skipped rather than double-enqueued.
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */

import * as FileSystem from 'expo-file-system';

import { r2UploadQueue } from '../r2-upload-queue';

import { canPersistCaptures, listVisitDirs } from './per-user-partition';

const PHOTO_PATTERN = /^(before|after)-(\d{2})\.jpg$/;

/** Scan partition and re-enqueue orphaned photos not already tracked in the queue.
 *  @derives(master-plan §G) */
export async function rehydrateFromPartition(workerId: string): Promise<void> {
  if (!canPersistCaptures()) return;
  try {
    const visitDirs = await listVisitDirs(workerId);

    for (const dirUri of visitDirs) {
      const visitId = dirUri.replace(/\/$/, '').split('/').pop();
      if (!visitId) continue;

      try {
        const info = await FileSystem.getInfoAsync(dirUri);
        if (!info.exists || !info.isDirectory) continue;

        const filenames = await FileSystem.readDirectoryAsync(dirUri);
        for (const filename of filenames) {
          const match = PHOTO_PATTERN.exec(filename);
          if (!match) continue;

          if (!match[1] || !match[2]) continue;
          const phase = match[1] as 'before' | 'after';
          const index = parseInt(match[2], 10);
          const existing = r2UploadQueue.getStatus(visitId, phase, index);

          if (existing !== null) continue;

          const photoUri = dirUri.endsWith('/') ? `${dirUri}${filename}` : `${dirUri}/${filename}`;
          try {
            const fileInfo = await FileSystem.getInfoAsync(photoUri);
            if (!fileInfo.exists) continue;
            const fileSize =
              'size' in fileInfo && typeof fileInfo.size === 'number' ? fileInfo.size : 0;

            r2UploadQueue.enqueue({
              visitId,
              phase,
              index,
              localUri: photoUri,
              contentType: 'image/jpeg',
              fileSize,
            });
          } catch (err) {
            console.error(
              '[rehydration] failed to enqueue photo',
              photoUri,
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      } catch (err) {
        console.error(
          '[rehydration] failed to process visit dir',
          dirUri,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  } catch (err) {
    console.error('[rehydration] failed', err instanceof Error ? err.message : String(err));
  }
}
