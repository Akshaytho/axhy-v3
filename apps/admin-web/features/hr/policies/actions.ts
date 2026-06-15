/**
 * Server actions for the HR Policies screen.
 *
 * - setPolicyValue: append a new value (POST /admin/policy). The DB category
 *   enum is echoed from the row the screen already holds, so the write matches
 *   the existing key namespace. 403 surfaces as a thrown ApiError the modal
 *   turns into a friendly message; 401 → /login.
 * - fetchPolicyHistory: on-demand history for the modal (the screen is a client
 *   component and cannot read the httpOnly cookie itself).
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../lib/api';
import type { PolicyHistoryRow } from '../data';

/**
 * Appends a new policy value for a key and revalidates the policies screen.
 * @derives(master-plan §G)
 */
export async function setPolicyValue(key: string, value: unknown, category: string): Promise<void> {
  try {
    await fetchJson('/admin/policy', {
      method: 'POST',
      body: JSON.stringify({ key, value, category }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/policies');
}

/**
 * Fetches the change history for a policy key on demand for the modal.
 * @derives(master-plan §G)
 */
export async function fetchPolicyHistory(key: string): Promise<PolicyHistoryRow[]> {
  try {
    const { history } = await fetchJson<{ history: PolicyHistoryRow[] }>(
      `/admin/policy/${encodeURIComponent(key)}/history`,
    );
    return history;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
}
