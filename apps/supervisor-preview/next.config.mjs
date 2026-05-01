/**
 * Next.js config — Axhy supervisor mobile preview.
 *
 * Founder-locked 2026-05-01: this app is fully separated from admin-web
 * so future supervisor design changes don't bleed into the marketing
 * site codebase.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-05-01 — supervisor preview separation)
 */

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ['@axhy/ui-tokens'],
};

export default config;
