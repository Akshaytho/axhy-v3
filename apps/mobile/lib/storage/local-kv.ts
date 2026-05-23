/**
 * Minimal file-backed key-value store for mobile persistence.
 *
 * Used by photo-sweep (last-sweep timestamp) and queue-persistence
 * (serialized upload queue). Writes JSON strings to documentDirectory/axhy-kv/.
 * No-op on web (Expo Web has no writable filesystem).
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */

import * as FileSystem from 'expo-file-system';
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';

function computeKvDir(): string {
  if (Platform.OS === 'web') return '';
  try {
    const uri = Paths.document.uri;
    return uri.endsWith('/') ? `${uri}axhy-kv/` : `${uri}/axhy-kv/`;
  } catch {
    return '';
  }
}

const KV_DIR = computeKvDir();

function kvUri(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${KV_DIR}${safe}.json`;
}

/** Read a persisted string value by key. Returns null on web, missing key, or read error.
 *  @derives(master-plan §G) */
export async function getKvItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const info = await FileSystem.getInfoAsync(kvUri(key));
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(kvUri(key));
  } catch {
    return null;
  }
}

/** Persist a string value by key. No-op on web; logs on write error.
 *  @derives(master-plan §G) */
export async function setKvItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await FileSystem.makeDirectoryAsync(KV_DIR, { intermediates: true });
    await FileSystem.writeAsStringAsync(kvUri(key), value);
  } catch (err) {
    console.error('[local-kv] write failed', key, err instanceof Error ? err.message : String(err));
  }
}
