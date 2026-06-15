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
  // both green). Re-running them inside `next build` made the Railway deploy
  // fail at the "Linting and checking validity of types" step (the build
  // compiles clean locally + on Railway, then dies in that phase — lint/typecheck
  // OOM on the constrained build container). Skipping the redundant in-build pass
  // fixes the deploy without losing the gate. @derives(ADR-0005)
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
