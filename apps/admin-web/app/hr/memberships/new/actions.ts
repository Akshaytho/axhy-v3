/**
 * Server action for inviting a HR/SUPERVISOR membership.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 15
 *
 * Mirrors the backend POST /admin/memberships contract with a local Zod
 * schema for defence-in-depth. Closed-by-default: any ApiError(401) sends
 * the browser to /login; other ApiErrors return a typed state object so the
 * client can render a friendly message without leaking stack traces.
 *
 * On success: revalidates the /hr/memberships list so the new row appears
 * immediately on next navigation, and returns { ok: true, id }.
 *
 * @derives(master-plan §G)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fetchJson, ApiError } from '../../../../lib/api';

export type InviteMembershipState =
  | { ok: null }
  | { ok: true; id: string }
  | { ok: false; code: string; message: string };

const InviteSchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/, 'Phone must be E.164 (e.g. +919999900000)'),
  name: z.string().min(1).max(120),
  role: z.enum(['HR', 'SUPERVISOR']),
  baseSalaryPaise: z.coerce.number().int().nonnegative(),
  podId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  bankIfsc: z.string().optional(),
  bankAcct: z.string().optional(),
});

type CreateMembershipResponse = {
  membershipId: string;
  userId: string;
  role: 'HR' | 'SUPERVISOR';
  status: 'ACTIVE';
};

/**
 * useActionState-compatible server action for the invite form. Reads form
 * fields, validates with Zod, calls backend, handles redirect / error paths.
 *
 * @derives(master-plan §G)
 */
export async function inviteMembership(
  _prev: InviteMembershipState,
  formData: FormData,
): Promise<InviteMembershipState> {
  const raw = {
    phone: String(formData.get('phone') ?? ''),
    name: String(formData.get('name') ?? ''),
    role: String(formData.get('role') ?? ''),
    baseSalaryPaise: String(formData.get('baseSalaryPaise') ?? ''),
    podId: String(formData.get('podId') ?? ''),
  };
  const parsed = InviteSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: 'BODY_INVALID',
      message: first?.message ?? 'Invalid input.',
    };
  }
  try {
    const created = await fetchJson<CreateMembershipResponse>('/admin/memberships', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    revalidatePath('/hr/memberships');
    return { ok: true, id: created.membershipId };
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
