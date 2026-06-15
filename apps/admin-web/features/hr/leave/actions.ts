/**
 * Server actions for the HR Leave screen — approve / reject.
 *
 * Wraps the backend POST /leave-requests/:id/{approve,reject} (LeaveDecisionInput
 * { reason? }). Called directly from the client ReviewSheet with (id, note).
 * Reject requires a reason; approve note is optional. On success we
 * revalidate the leave route so the queue reflects the new state.
 *
 * Closed-by-default: a 401 bounces to /login; other ApiErrors propagate so the
 * UI surfaces them (HR never silently swallows a cross-site attempt).
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../lib/api';

async function decide(id: string, verb: 'approve' | 'reject', note: string): Promise<void> {
  const trimmed = note.trim();
  const body = trimmed.length > 0 ? JSON.stringify({ reason: trimmed }) : JSON.stringify({});
  try {
    await fetchJson(`/leave-requests/${encodeURIComponent(id)}/${verb}`, { method: 'POST', body });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/leave-requests');
  revalidatePath('/hr');
}

/**
 * Approves a leave request with an optional note and revalidates the queue.
 * @derives(master-plan §G)
 */
export async function approveLeave(id: string, note: string): Promise<void> {
  await decide(id, 'approve', note);
}

/**
 * Rejects a leave request with a required reason and revalidates the queue.
 * @derives(master-plan §G)
 */
export async function rejectLeave(id: string, reason: string): Promise<void> {
  await decide(id, 'reject', reason);
}
