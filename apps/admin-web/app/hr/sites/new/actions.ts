/**
 * Server action for creating a site.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 17
 *
 * Mirrors the backend POST /admin/sites contract with a local Zod schema
 * for defence-in-depth. Closed-by-default: any ApiError(401) sends the
 * browser to /login; other ApiErrors return a typed state object so the
 * client can render a friendly message.
 *
 * On success: revalidates the /hr/sites list and redirects to the new
 * site's detail page so the HR sees it immediately. Per Next.js docs,
 * redirect() must be called outside the try/catch so the special
 * NEXT_REDIRECT throw is not swallowed by the catch.
 *
 * @derives(master-plan §G)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fetchJson, ApiError } from '../../../../lib/api';

export type CreateSiteState = { ok: null } | { ok: false; code: string; message: string };

const CreateSiteSchema = z.object({
  name: z.string().min(1).max(120),
  address: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  latitude: z
    .union([z.coerce.number().min(-90).max(90), z.literal('').transform(() => undefined)])
    .optional(),
  longitude: z
    .union([z.coerce.number().min(-180).max(180), z.literal('').transform(() => undefined)])
    .optional(),
  workdays: z
    .string()
    .regex(/^[MTWFSU_]{7}$/, 'Workdays must be 7 chars from M T W F S U _')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

type CreateSiteResponse = {
  siteId: string;
  state: 'DRAFT';
};

/**
 * useActionState-compatible server action for the create-site form.
 * Reads form fields, validates with Zod, calls backend, handles errors,
 * and redirects to /hr/sites/:id on success.
 *
 * @derives(master-plan §G)
 */
export async function createSite(
  _prev: CreateSiteState,
  formData: FormData,
): Promise<CreateSiteState> {
  const raw = {
    name: String(formData.get('name') ?? ''),
    address: String(formData.get('address') ?? ''),
    latitude: String(formData.get('latitude') ?? ''),
    longitude: String(formData.get('longitude') ?? ''),
    workdays: String(formData.get('workdays') ?? ''),
  };
  const parsed = CreateSiteSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: 'BODY_INVALID',
      message: first?.message ?? 'Invalid input.',
    };
  }
  let newSiteId: string | null = null;
  try {
    const result = await fetchJson<CreateSiteResponse>('/admin/sites', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    newSiteId = result.siteId;
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
  if (newSiteId) {
    revalidatePath('/hr/sites');
    redirect(`/hr/sites/${newSiteId}`);
  }
  return { ok: null };
}
