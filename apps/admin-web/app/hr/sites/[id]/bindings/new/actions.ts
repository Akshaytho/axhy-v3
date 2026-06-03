/**
 * Server action for creating a supervisor binding on a site.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 18
 *
 * Mirrors the backend POST /admin/sites/:id/bindings contract with a local
 * Zod schema for defence-in-depth. Refinement: effectiveUntil is REQUIRED
 * when actingForUserId is present (an acting-for binding must have an end
 * date so the substitution doesn't linger). datetime-local strings from the
 * form are converted to ISO-8601 with `new Date(input).toISOString()`.
 *
 * Closed-by-default: ApiError(401) → /login; other ApiErrors surface a
 * typed state object. On success: revalidates /hr/sites/:id and redirects
 * back to the site detail page so the new binding appears in the table.
 *
 * @derives(master-plan §G)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fetchJson, ApiError } from '../../../../../../lib/api';

export type CreateBindingState = { ok: null } | { ok: false; code: string; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateBindingSchema = z
  .object({
    siteId: z.string().regex(UUID_RE, 'Site id must be a UUID'),
    supervisorUserId: z.string().regex(UUID_RE, 'Supervisor user id must be a UUID'),
    effectiveFrom: z.string().min(1, 'Effective from is required'),
    effectiveUntil: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    actingForUserId: z
      .string()
      .regex(UUID_RE, 'Acting-for user id must be a UUID')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    reason: z.string().min(1).max(1000),
  })
  .superRefine((value, ctx) => {
    if (value.actingForUserId && !value.effectiveUntil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveUntil'],
        message: 'Effective until is required when acting-for is set',
      });
    }
  });

type CreateBindingResponse = {
  bindingId: string;
};

/**
 * Convert a datetime-local string (`YYYY-MM-DDTHH:MM`) to ISO-8601 with
 * milliseconds + offset. Throws if the input is not a parseable date.
 *
 * @derives(master-plan §G)
 */
function toIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return d.toISOString();
}

/**
 * useActionState-compatible server action for the create-binding form.
 * Reads form fields, validates with Zod (incl. acting-for refinement),
 * normalises datetimes to ISO, calls backend, handles errors, and
 * redirects to /hr/sites/:id on success.
 *
 * @derives(master-plan §G)
 */
export async function createBinding(
  _prev: CreateBindingState,
  formData: FormData,
): Promise<CreateBindingState> {
  const raw = {
    siteId: String(formData.get('siteId') ?? ''),
    supervisorUserId: String(formData.get('supervisorUserId') ?? ''),
    effectiveFrom: String(formData.get('effectiveFrom') ?? ''),
    effectiveUntil: String(formData.get('effectiveUntil') ?? ''),
    actingForUserId: String(formData.get('actingForUserId') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  };
  const parsed = CreateBindingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: 'BODY_INVALID',
      message: first?.message ?? 'Invalid input.',
    };
  }
  const { siteId, supervisorUserId, effectiveFrom, effectiveUntil, actingForUserId, reason } =
    parsed.data;
  let body: Record<string, string>;
  try {
    body = {
      supervisorUserId,
      effectiveFrom: toIso(effectiveFrom),
      reason,
    };
    if (effectiveUntil) body.effectiveUntil = toIso(effectiveUntil);
    if (actingForUserId) body.actingForUserId = actingForUserId;
  } catch (err) {
    return {
      ok: false,
      code: 'BODY_INVALID',
      message: err instanceof Error ? err.message : 'Invalid datetime input.',
    };
  }
  let succeeded = false;
  try {
    await fetchJson<CreateBindingResponse>(`/admin/sites/${siteId}/bindings`, {
      method: 'POST',
      body: JSON.stringify(body),
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
    revalidatePath(`/hr/sites/${siteId}`);
    redirect(`/hr/sites/${siteId}`);
  }
  return { ok: null };
}
