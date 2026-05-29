/**
 * Server actions for HR leave-request decide page.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 19
 *
 * Wraps the backend POST /leave-requests/:id/{approve,reject} routes. Body
 * shape per packages/shared-schema LeaveDecisionInput: { reason?: string }
 * (trim, max 500). We map the form's `decisionNote` field onto `reason`
 * because the locked schema names it `reason`; the back-compat `note`
 * field is intentionally NOT used by this surface.
 *
 * Closed-by-default: ApiError(401) sends the browser to /login. Other
 * ApiErrors (403 NOT_YOUR_POD, WORKER_NOT_IN_POD, etc.) re-throw so the
 * Next.js error boundary can surface them — HR cannot silently swallow a
 * cross-pod attempt.
 *
 * On success: revalidates both the inbox and the detail path, then
 * redirects HR back to the inbox so the just-decided row reflects the new
 * state on next render.
 *
 * @derives(master-plan §G)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../../lib/api';

type LeaveDecisionResponse = {
  ok: true;
  leaveRequestId: string;
  workerId: string;
  state: string;
  decidedBy: string;
  decidedAt: string;
};

function readFormFields(formData: FormData): { leaveId: string; reason: string | undefined } {
  const leaveId = String(formData.get('leaveId') ?? '').trim();
  if (!leaveId) throw new Error('Missing leaveId in form data.');
  const rawNote = formData.get('decisionNote');
  const noteStr = typeof rawNote === 'string' ? rawNote.trim() : '';
  return { leaveId, reason: noteStr.length > 0 ? noteStr : undefined };
}

async function postDecision(
  leaveId: string,
  verb: 'approve' | 'reject',
  reason: string | undefined,
): Promise<void> {
  const body = reason ? JSON.stringify({ reason }) : JSON.stringify({});
  try {
    await fetchJson<LeaveDecisionResponse>(
      `/leave-requests/${encodeURIComponent(leaveId)}/${verb}`,
      {
        method: 'POST',
        body,
      },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/leave-requests');
  revalidatePath(`/hr/leave-requests/${leaveId}`);
  redirect('/hr/leave-requests');
}

/**
 * Approve a leave request. Form submission action.
 *
 * @derives(master-plan §G)
 */
export async function approveLeave(formData: FormData): Promise<void> {
  const { leaveId, reason } = readFormFields(formData);
  await postDecision(leaveId, 'approve', reason);
}

/**
 * Reject a leave request. Form submission action.
 *
 * @derives(master-plan §G)
 */
export async function rejectLeave(formData: FormData): Promise<void> {
  const { leaveId, reason } = readFormFields(formData);
  await postDecision(leaveId, 'reject', reason);
}
