/**
 * Temporary auth-flow phone handoff.
 *
 * Keeps the OTP phone number out of the URL while still surviving a same-tab
 * refresh on web and normal route transitions on native.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY_PENDING_PHONE = 'axhy_pending_auth_phone';

let pendingPhoneCache: string | null = null;

function webStorage(): Storage | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

/** @derives(master-plan §G) */
export async function getPendingAuthPhone(): Promise<string | null> {
  if (pendingPhoneCache) return pendingPhoneCache;
  try {
    const stored =
      Platform.OS === 'web'
        ? (webStorage()?.getItem(KEY_PENDING_PHONE) ?? null)
        : await SecureStore.getItemAsync(KEY_PENDING_PHONE);
    pendingPhoneCache = stored;
    return stored;
  } catch {
    return pendingPhoneCache;
  }
}

/** @derives(master-plan §G) */
export async function setPendingAuthPhone(phone: string): Promise<void> {
  pendingPhoneCache = phone;
  try {
    if (Platform.OS === 'web') {
      webStorage()?.setItem(KEY_PENDING_PHONE, phone);
      return;
    }
    await SecureStore.setItemAsync(KEY_PENDING_PHONE, phone);
  } catch {
    // Non-fatal: the live in-memory cache still carries this session.
  }
}

/** @derives(master-plan §G) */
export async function clearPendingAuthPhone(): Promise<void> {
  pendingPhoneCache = null;
  try {
    if (Platform.OS === 'web') {
      webStorage()?.removeItem(KEY_PENDING_PHONE);
      return;
    }
    await SecureStore.deleteItemAsync(KEY_PENDING_PHONE);
  } catch {
    // Non-fatal cleanup.
  }
}
