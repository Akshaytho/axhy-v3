/**
 * @axhy/shared-schema
 *
 * The seed package. Single source of truth for database shape, validation,
 * and shared types across all apps and packages.
 *
 * @derives(ADR-0003)
 */

export const PACKAGE_NAME = '@axhy/shared-schema' as const;

export * from './zod/auth.js';
export * from './zod/me.js';
export * from './zod/supervisor.js';
