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
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: [
    '@axhy/api-client',
    '@axhy/copy',
    '@axhy/errors',
    '@axhy/shared-schema',
    '@axhy/ui-tokens',
    '@axhy/ui-web',
  ],
};

export default config;
