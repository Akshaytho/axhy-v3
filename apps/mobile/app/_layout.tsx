/**
 * apps/mobile/app/_layout.tsx
 *
 * Root layout. Reads role from JWT claims, routes to (worker) / (supervisor) / (owner).
 * Real Expo + Expo Router init lands during build phase 1.
 *
 * @derives(ADR-0021)
 */

export const APP_NAME = '@axhy/mobile' as const;
