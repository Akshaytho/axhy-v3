/**
 * Serializes and restores the r2UploadQueue state across app launches.
 *
 * Only idle and failed items are persisted. Uploading items are reset to
 * idle on restore so they retry on next launch. Done items are excluded
 * (object keys already on R2 — no retry needed).
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */

import type { QueueItem } from '../r2-upload-queue';

import { getKvItem, setKvItem } from './local-kv';

const QUEUE_KEY = 'axhy-queue-v1';

type PersistedItem = Omit<QueueItem, 'status'> & { status: 'idle' | 'failed' };

/** Persist queue snapshot to local-kv. Excludes done items; resets uploading→idle.
 *  @derives(master-plan §G) */
export async function saveQueueState(items: ReadonlyMap<string, QueueItem>): Promise<void> {
  try {
    const toSave: Record<string, PersistedItem> = {};
    for (const [key, item] of items) {
      if (item.status === 'done') continue;
      const status: 'idle' | 'failed' = item.status === 'failed' ? 'failed' : 'idle';
      toSave[key] = { ...item, status };
    }
    await setKvItem(QUEUE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.error(
      '[queue-persistence] save failed',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Restore queue state from local-kv. Returns empty map on missing or corrupt data.
 *  @derives(master-plan §G) */
export async function loadQueueState(): Promise<Map<string, QueueItem>> {
  const result = new Map<string, QueueItem>();
  try {
    const raw = await getKvItem(QUEUE_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw) as Record<string, PersistedItem>;
    for (const [key, item] of Object.entries(parsed)) {
      result.set(key, item as QueueItem);
    }
  } catch (err) {
    console.error(
      '[queue-persistence] failed to load state',
      err instanceof Error ? err.message : String(err),
    );
  }
  return result;
}
