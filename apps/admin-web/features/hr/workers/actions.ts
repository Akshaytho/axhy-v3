/**
 * Server action for the HR Workers screen — create a worker.
 * Wraps POST /admin/workers (AdminCreateWorkerInput). The worker is created in
 * a draft/activating state; they verify their phone to finish joining, and are
 * assigned to a site (with shift times) from the site page afterwards. 401 →
 * /login.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../lib/api';

/**
 * Input shape for creating a worker from the HR Workers screen.
 * @derives(master-plan §G)
 */
export type CreateWorkerInput = {
  name: string;
  phone: string;
  baseSalaryPaise: number;
  preferredLanguage?: string;
  bankIfsc?: string;
  bankAcct?: string;
};

/**
 * Creates a worker in a draft/activating state and revalidates the screen.
 * @derives(master-plan §G)
 */
export async function createWorker(input: CreateWorkerInput): Promise<void> {
  try {
    await fetchJson('/admin/workers', { method: 'POST', body: JSON.stringify(input) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/workers');
}
