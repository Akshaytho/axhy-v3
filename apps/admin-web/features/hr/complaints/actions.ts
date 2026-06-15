/**
 * Server actions for the HR Complaints screen.
 *
 *  - loadThread(id)   → GET /hr/complaints/:id (fetch a thread on card open)
 *  - replyComplaint   → POST /complaints/:id/messages { body }
 *  - resolveComplaint → POST /complaints/:id/resolve
 *  - logComplaint     → POST /complaints { siteId, severity, text }
 *
 * Closed-by-default: a 401 bounces to /login; other ApiErrors propagate.
 * Mutations revalidate the complaints route + dashboard so counts refresh.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../lib/api';
import type { ComplaintDetail } from '../data';

function bounceOn401(err: unknown): never {
  if (err instanceof ApiError && err.status === 401) redirect('/login');
  throw err;
}

/**
 * Fetches a complaint thread by id when its card is opened.
 * @derives(master-plan §G)
 */
export async function loadThread(id: string): Promise<ComplaintDetail> {
  try {
    return await fetchJson<ComplaintDetail>(`/hr/complaints/${encodeURIComponent(id)}`);
  } catch (err) {
    bounceOn401(err);
  }
}

/**
 * Posts a reply message to a complaint thread and revalidates the screen.
 * @derives(master-plan §G)
 */
export async function replyComplaint(id: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;
  try {
    await fetchJson(`/complaints/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: trimmed }),
    });
  } catch (err) {
    bounceOn401(err);
  }
  revalidatePath('/hr/complaints');
  revalidatePath('/hr');
}

/**
 * Marks a complaint as resolved and revalidates the screen.
 * @derives(master-plan §G)
 */
export async function resolveComplaint(id: string): Promise<void> {
  try {
    await fetchJson(`/complaints/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } catch (err) {
    bounceOn401(err);
  }
  revalidatePath('/hr/complaints');
  revalidatePath('/hr');
}

/**
 * Logs a new complaint against a site and revalidates the screen.
 * @derives(master-plan §G)
 */
export async function logComplaint(input: {
  siteId: string;
  severity: string;
  text: string;
}): Promise<void> {
  try {
    await fetchJson('/complaints', { method: 'POST', body: JSON.stringify(input) });
  } catch (err) {
    bounceOn401(err);
  }
  revalidatePath('/hr/complaints');
  revalidatePath('/hr');
}
