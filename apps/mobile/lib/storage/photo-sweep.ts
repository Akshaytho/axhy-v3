/**
 * 30-day local photo sweep.
 *
 * Deletes visit capture directories older than 30 days from the worker's
 * per-user partition. Runs at most once per day, keyed by a last-run
 * timestamp in local-kv. No-op on Expo Web.
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */

import { Directory } from 'expo-file-system';

import { canPersistCaptures, listVisitDirs } from './per-user-partition';
import { getKvItem, setKvItem } from './local-kv';

const SWEEP_KEY = 'axhy-sweep-lastRun';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Run the sweep if more than 24 hours have passed since the last run.
 *  Deletes visit dirs whose filesystem modificationTime is older than 30 days.
 *  Safe to call on every app foreground — will no-op if already swept today.
 *  @derives(master-plan §G) */
export async function maybeSweepOldPhotos(workerId: string): Promise<void> {
  if (!canPersistCaptures()) return;
  try {
    const lastRunStr = await getKvItem(SWEEP_KEY);
    const lastRunMs = lastRunStr ? parseInt(lastRunStr, 10) : 0;
    const now = Date.now();
    if (now - lastRunMs < ONE_DAY_MS) return;

    const visitDirs = await listVisitDirs(workerId);
    const cutoffMs = now - THIRTY_DAYS_MS;

    for (const dirUri of visitDirs) {
      try {
        const dir = new Directory(dirUri);
        if (!dir.exists) continue;
        // Modern expo-file-system Directory.info().modificationTime is in milliseconds.
        const info = dir.info();
        const modMs = typeof info.modificationTime === 'number' ? info.modificationTime : 0;
        if (modMs > 0 && modMs < cutoffMs) {
          dir.delete();
        }
      } catch (err) {
        console.error(
          '[photo-sweep] error processing dir',
          dirUri,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    await setKvItem(SWEEP_KEY, String(now));
  } catch (err) {
    console.error('[photo-sweep] sweep failed', err instanceof Error ? err.message : String(err));
  }
}
