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
export * from './zod/calendar.js';
export * from './zod/assignment.js';
export * from './zod/chat.js';
export * from './zod/living-doc.js';
// Layer 1 core primitives (workflow-design-closure 2026-05-15)
export * from './zod/audit-event.js';
export * from './zod/hr-pod.js';
export * from './zod/policy.js';
export * from './zod/notification.js';
export * from './zod/digest.js';
export * from './zod/site-supervisor-binding.js';
export * from './zod/audit-payloads.js';
// F-002.1 — unified decision-kind registry (single source of truth)
export * from './zod/supervisor-decision-kinds.js';
// F-004 — HandoffPackage payload (9 fields, schemaVersion: 1)
export * from './zod/handoff-package.js';
