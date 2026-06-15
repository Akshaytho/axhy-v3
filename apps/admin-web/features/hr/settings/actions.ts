/**
 * Server actions for the HR Settings screen.
 *
 * - updateNotificationPrefs: PATCH /me/notification-prefs (partial — toggling
 *   one channel never clears the others; the backend merges).
 * - updateLocale: PATCH /me/locale (en|hi|te).
 *
 * Both are scoped server-side to the caller's own membership/user; the client
 * never sends an id. 401 → /login.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../lib/api';
import type { NotificationPrefs } from '../data';

/**
 * Patches the caller's notification preferences and revalidates settings.
 * @derives(master-plan §G)
 */
export async function updateNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<void> {
  try {
    await fetchJson('/me/notification-prefs', { method: 'PATCH', body: JSON.stringify(patch) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/settings');
}

/**
 * Patches the caller's locale and revalidates settings.
 * @derives(master-plan §G)
 */
export async function updateLocale(locale: 'en' | 'hi' | 'te'): Promise<void> {
  try {
    await fetchJson('/me/locale', { method: 'PATCH', body: JSON.stringify({ locale }) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/settings');
}
