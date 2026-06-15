/**
 * Server action for the HR Sites screen — create a site.
 * Wraps POST /admin/sites (AdminCreateSiteInput). The site is created in DRAFT
 * state; HR activates it from the site page. 401 → /login.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../lib/api';

/**
 * Input shape for creating a site from the HR Sites screen.
 * @derives(master-plan §G)
 */
export type CreateSiteInput = {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  workdays?: string;
};

/**
 * Creates a site in DRAFT state and revalidates the sites screen.
 * @derives(master-plan §G)
 */
export async function createSite(input: CreateSiteInput): Promise<void> {
  try {
    await fetchJson('/admin/sites', { method: 'POST', body: JSON.stringify(input) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/sites');
}
