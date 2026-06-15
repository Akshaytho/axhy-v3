/**
 * Server action for the HR Updates screen — publish an update.
 * Wraps POST /hr/updates. Company-wide or targeted at one supervisor, with an
 * optional 5-word-ack requirement. 401 → /login; other failures rethrow so the
 * compose form can surface a friendly message.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../lib/api';

/**
 * Input shape for publishing an update from the HR Updates screen.
 * @derives(master-plan §G)
 */
export type CreateUpdateInput = {
  kind: string;
  content: string;
  audience: 'all' | 'one';
  targetSupervisorId?: string | null;
  acknowledgmentRequired: boolean;
  acknowledgmentPhrase?: string | null;
};

/**
 * Publishes an update (company-wide or targeted) and revalidates the screen.
 * @derives(master-plan §G)
 */
export async function createUpdate(input: CreateUpdateInput): Promise<void> {
  try {
    await fetchJson('/hr/updates', { method: 'POST', body: JSON.stringify(input) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/updates');
}
