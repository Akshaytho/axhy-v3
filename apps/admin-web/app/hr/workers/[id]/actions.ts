/**
 * Server action for anonymizing a worker.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 16
 *
 * Wraps the backend POST /admin/workers/:id/anonymize call. Validates the
 * reason locally with Zod (1–500 chars) to fail fast before reaching the
 * backend. Closed-by-default: any ApiError(401) sends the browser to /login;
 * other ApiErrors return a typed state object so the client modal can
 * render the message.
 *
 * On success: revalidates both /hr/workers and /hr/workers/[id] so the
 * "Resigned (anonymized)" badge appears on next navigation.
 *
 * @derives(master-plan §G)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fetchJson, ApiError } from '../../../../lib/api';

export type AnonymizeWorkerResult =
  | { ok: true; workerId: string; anonymizedAt: string }
  | { ok: false; code: string; message: string };

const ReasonSchema = z.string().min(1, 'Reason is required.').max(500);

type AnonymizeResponse = { workerId: string; anonymizedAt: string };

/**
 * Server action invoked from the AnonymizeButton confirm flow.
 *
 * @derives(master-plan §G)
 */
export async function anonymizeWorker(
  workerId: string,
  reason: string,
): Promise<AnonymizeWorkerResult> {
  const parsed = ReasonSchema.safeParse(reason);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'BODY_INVALID',
      message: parsed.error.issues[0]?.message ?? 'Invalid reason.',
    };
  }
  try {
    const res = await fetchJson<AnonymizeResponse>(
      `/admin/workers/${encodeURIComponent(workerId)}/anonymize`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: parsed.data }),
      },
    );
    revalidatePath('/hr/workers');
    revalidatePath(`/hr/workers/${workerId}`);
    return { ok: true, workerId: res.workerId, anonymizedAt: res.anonymizedAt };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Unexpected error. Try again.',
    };
  }
}
