/**
 * admin-web env config — Zod-validated at module load.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for tasks 9/10/11; must stay in-context
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
  // ADR-0028: every backend call is pinned to the /v1 contract here — the
  // single transform point, so the env var stays the raw base URL while all
  // consumers (login page, lib/api.ts) get the versioned surface. The
  // backend aliases /v1/X → /X (server.ts rewriteUrl). Deploy ordering:
  // backend must deploy before/with admin-web (handoff runbook).
  return {
    ...parsed.data,
    NEXT_PUBLIC_AXHY_API_URL: parsed.data.NEXT_PUBLIC_AXHY_API_URL.replace(/\/$/, '') + '/v1',
  };
}

export const env = readPublicEnv();

/**
 * Server-only JWT secret used to verify backend-issued access tokens.
 *
 * LAZY + memoized: read on first use at runtime, NOT at module load. This is
 * deliberate — `next build` runs in production mode and evaluates server
 * modules (route handlers, server components) to collect their config. An eager
 * module-load read that threw on a missing secret therefore crashed the
 * production build on any service where JWT_SECRET isn't set, even though the
 * secret is only needed when a token is actually verified at request time.
 * Reading it lazily lets the build succeed; the loud-fail still happens (the
 * first verify call throws in production if the secret is missing), just at
 * runtime where it belongs. Matches the lazy pattern already used by
 * app/api/graph/route.ts.
 *
 * In development the loader warns once and falls back to a placeholder so local
 * UI work can proceed without backend coupling — any verify call will of course
 * fail until a real secret is set.
 *
 * NEVER prefix with NEXT_PUBLIC_; this must NOT leak into the client bundle.
 *
 * @derives(master-plan §G)
 * @derives(panel-2026-04-30 — Iteration 4 quality bar)
 * @derives(ADR-0005)
 */
let _jwtSecret: string | null = null;

/**
 * Returns the server-only JWT secret, reading + memoizing it on first call.
 * Throws in production if unset/too short (loud-fail, deferred to runtime).
 * @derives(master-plan §G)
 * @derives(ADR-0005)
 */
export function getJwtSecret(): string {
  if (_jwtSecret !== null) return _jwtSecret;
  const raw = process.env.JWT_SECRET;
  if (raw && raw.length >= 32) return (_jwtSecret = raw);
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[admin-web env] JWT_SECRET is required in production and must be ≥32 chars.\n' +
        'Set it in Railway service vars; it must match the backend JWT_SECRET exactly.',
    );
  }
  // Development fallback — warn once, do not crash dev server.
  // Verify calls will fail authentication until a real secret is set.
  if (raw === undefined) {
    console.warn(
      '[admin-web env] JWT_SECRET not set — falling back to dev placeholder. ' +
        'Login verification WILL FAIL until you copy the backend JWT_SECRET into apps/admin-web/.env.local.',
    );
  } else if (raw.length < 32) {
    console.warn(
      `[admin-web env] JWT_SECRET is only ${raw.length} chars; must be ≥32 in production.`,
    );
  }
  return (_jwtSecret = raw ?? 'dev-only-placeholder-secret-do-not-use-in-prod');
}
