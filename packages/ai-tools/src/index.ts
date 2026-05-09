/**
 * @axhy/ai-tools
 *
 * Wrappers around Anthropic, OpenAI, and Sarvam. Enforces rate limits,
 * cost tracking, and untrusted-content tagging at the boundary.
 *
 * @derives(ADR-0010)
 * @derives(ADR-0023)
 */

export const PACKAGE_NAME = '@axhy/ai-tools' as const;

export { modelFor, assertWithinBudget, ALL_SURFACES } from './model-policy.js';
export type { AISurface, AIVendor, ModelChoice } from './model-policy.js';

export * from './tools/assignment.js';
export * from './tools/calendar.js';
export * from './tools/leave.js';
export * from './tools/mark-absent.js';
export * from './tools/read.js';
export * from './tools/swap.js';
export * from './sonnet-tool-loop.js';
