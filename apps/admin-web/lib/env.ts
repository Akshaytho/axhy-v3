/**
 * admin-web env config — Zod-validated at module load.
 *
 * Single source of truth for every env var the marketing/admin web reads.
 * No fallbacks to placeholder values; missing vars FAIL LOUDLY at boot
 * with a clear message, per the panel-locked Iteration 4 quality rule
 * (no hardcoded production values, no cheap shortcuts).
 *
 * Imported once; subsequent imports get the same parsed object.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-04-30 — Iteration 4 quality bar)
 */

import { z } from 'zod';

/**
 * E.164 phone digits without +, 10-15 digits. Matches PhoneSchema in
 * @axhy/shared-schema. Used by every WhatsApp deep link.
 */
const WhatsAppNumberSchema = z
  .string()
  .regex(/^[1-9][0-9]{9,14}$/, 'NEXT_PUBLIC_AXHY_WHATSAPP must be E.164 digits without +');

const HttpsUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
    message: 'must start with http:// or https://',
  });

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_AXHY_API_URL: HttpsUrlSchema,
  NEXT_PUBLIC_AXHY_WHATSAPP: WhatsAppNumberSchema,
});

/**
 * Read NEXT_PUBLIC_* env vars exactly as Next.js sees them. The Next.js
 * compiler inlines these at build time for client components and reads
 * them at runtime for server components — both paths land here.
 */
function readPublicEnv(): z.infer<typeof PublicEnvSchema> {
  const raw = {
    NEXT_PUBLIC_AXHY_API_URL: process.env.NEXT_PUBLIC_AXHY_API_URL,
    NEXT_PUBLIC_AXHY_WHATSAPP: process.env.NEXT_PUBLIC_AXHY_WHATSAPP,
  };
  const parsed = PublicEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `[admin-web env] Required environment variables are missing or invalid:\n${issues}\n\n` +
        `Set these in apps/admin-web/.env.local (dev) and Railway service vars (production).`,
    );
  }
  return parsed.data;
}

export const env = readPublicEnv();
