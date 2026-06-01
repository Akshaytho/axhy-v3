/**
 * Minimal file-backed key-value store for mobile persistence.
 *
 * Used by photo-sweep (last-sweep timestamp) and queue-persistence
 * (serialized upload queue). Writes JSON strings to documentDirectory/axhy-kv/.
 * No-op on web (Expo Web has no writable filesystem).
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */

import { Paths, File, Directory } from 'expo-file-system';
import { Platform } from 'react-native';

const KV_DIR_NAME = 'axhy-kv';

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function kvDir(): Directory | null {
  if (Platform.OS === 'web') return null;
  try {
    return new Directory(Paths.document, KV_DIR_NAME);
  } catch {
    return null;
  }
}

function kvFile(key: string): File | null {
  const dir = kvDir();
  if (!dir) return null;
  try {
    return new File(dir, `${safeKey(key)}.json`);
  } catch {
    return null;
  }
}

/** Read a persisted string value by key. Returns null on web, missing key, or read error.
 *  @derives(master-plan §G) */
export async function getKvItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const file = kvFile(key);
    if (!file || !file.exists) return null;
    return file.textSync();
  } catch {
    return null;
  }
}

/** Persist a string value by key. No-op on web; logs on write error.
 *  @derives(master-plan §G) */
export async function setKvItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const dir = kvDir();
    if (!dir) return;
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = kvFile(key);
    if (!file) return;
    file.write(value);
  } catch (err) {
    console.error('[local-kv] write failed', key, err instanceof Error ? err.message : String(err));
  }
}
