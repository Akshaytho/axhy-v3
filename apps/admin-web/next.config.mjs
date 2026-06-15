/**
 * Next.js config — Axhy admin / marketing site.
 *
 * @derives(ADR-0005)
 */

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // Lint + type-check run in CI and the pre-commit hook (tsc --noEmit + eslint,
  // both green), so skipping the redundant in-build pass is safe and speeds the
  // Railway build (the build container installs prod deps; tsc/eslint want
  // devDeps). NOTE: this skip did NOT fix the earlier Railway deploy failure —
  // the real cause was an eager module-load read of JWT_SECRET in lib/env.ts that
  // threw during `next build` (production mode) on the admin-web service, which
  // has no JWT_SECRET. Fixed by the lazy getJwtSecret() in lib/env.ts (the secret
  // is read on first verify at runtime, not at module load / build time).
  // @derives(ADR-0005)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: [
    '@axhy/api-client',
    '@axhy/copy',
    '@axhy/errors',
    '@axhy/jwt-public',
    '@axhy/shared-schema',
    '@axhy/ui-tokens',
    '@axhy/ui-web',
  ],
};

export default config;
