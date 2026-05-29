/**
 * Server action for inviting a worker.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 16
 *
 * Mirrors the backend POST /admin/workers contract with a local Zod schema
 * for defence-in-depth. Closed-by-default: any ApiError(401) sends the
 * browser to /login; other ApiErrors return a typed state object so the
 * client can render a friendly message.
 *
 * On success: revalidates the /hr/workers list and redirects to it so the
 * HR sees the new row immediately. Per Next.js docs, redirect() must be
 * called outside the try/catch so the special NEXT_REDIRECT throw is not
 * swallowed by the catch.
 *
 * @derives(master-plan §G)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fetchJson, ApiError } from '../../../../lib/api';

export type InviteWorkerState = { ok: null } | { ok: false; code: string; message: string };

const InviteWorkerSchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/, 'Phone must be E.164 (e.g. +919999900000)'),
  name: z.string().min(1).max(120),
  baseSalaryPaise: z.coerce.number().int().nonnegative(),
  bankIfsc: z
    .string()
    .max(32)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  bankAcct: z
    .string()
    .max(64)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  preferredLanguage: z
    .enum(['hi', 'te', 'ta', 'kn', 'en'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

type CreateWorkerResponse = {
  workerId: string;
  userId: string;
  membershipId: string;
  state: 'PENDING_ACTIVATION';
};

/**
 * useActionState-compatible server action for the invite-worker form.
 * Reads form fields, validates with Zod, calls backend, handles errors,
 * and redirects to /hr/workers on success.
 *
 * @derives(master-plan §G)
 */
export async function inviteWorker(
  _prev: InviteWorkerState,
  formData: FormData,
): Promise<InviteWorkerState> {
  const raw = {
    phone: String(formData.get('phone') ?? ''),
    name: String(formData.get('name') ?? ''),
    baseSalaryPaise: String(formData.get('baseSalaryPaise') ?? ''),
    bankIfsc: String(formData.get('bankIfsc') ?? ''),
    bankAcct: String(formData.get('bankAcct') ?? ''),
    preferredLanguage: String(formData.get('preferredLanguage') ?? ''),
  };
  const parsed = InviteWorkerSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: 'BODY_INVALID',
      message: first?.message ?? 'Invalid input.',
    };
  }
  let succeeded = false;
  try {
    await fetchJson<CreateWorkerResponse>('/admin/workers', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    succeeded = true;
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
  if (succeeded) {
    revalidatePath('/hr/workers');
    redirect('/hr/workers');
  }
  return { ok: null };
}
