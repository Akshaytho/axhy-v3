/**
 * Server actions for the Owner dashboard.
 *
 * Enforces Zod validation, role protection, and tenant context.
 * Updates policy keys by calling POST /admin/policy.
 *
 * @derives(master-plan §G)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fetchJson, ApiError } from '../../lib/api';

export type PolicyActionState =
  | { ok: true; key: string }
  | { ok: false; code: string; message: string }
  | null;

const UpdatePolicySchema = z.object({
  key: z.string().min(1),
  category: z.enum(['sla', 'notification', 'worker', 'hr', 'ai', 'owner', 'handoff']),
  valueType: z.enum(['boolean', 'number', 'string']),
});

/**
 * Server Action to update a policy value.
 *
 * @derives(master-plan §G)
 */
export async function updatePolicyAction(
  _prev: PolicyActionState,
  formData: FormData,
): Promise<PolicyActionState> {
  const key = String(formData.get('key') ?? '');
  const category = String(formData.get('category') ?? '');
  const valueType = String(formData.get('valueType') ?? '');
  const rawValue = formData.get('value');

  const parsedMetadata = UpdatePolicySchema.safeParse({ key, category, valueType });
  if (!parsedMetadata.success) {
    return {
      ok: false,
      code: 'BAD_INPUT',
      message: parsedMetadata.error.issues[0]?.message ?? 'Invalid metadata.',
    };
  }

  let typedValue: unknown;
  if (valueType === 'boolean') {
    typedValue = rawValue === 'true';
  } else if (valueType === 'number') {
    const num = Number(rawValue);
    if (Number.isNaN(num)) {
      return { ok: false, code: 'BAD_INPUT', message: 'Value must be a valid number.' };
    }
    typedValue = num;
  } else {
    typedValue = String(rawValue ?? '');
  }

  try {
    await fetchJson('/admin/policy', {
      method: 'POST',
      body: JSON.stringify({
        key: parsedMetadata.data.key,
        value: typedValue,
        category: parsedMetadata.data.category,
      }),
    });

    revalidatePath('/owner');
    return { ok: true, key: parsedMetadata.data.key };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        redirect('/login');
      }
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Failed to update policy. Try again.',
    };
  }
}
