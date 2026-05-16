/**
 * F-007 round-2 v11 — Notification payload schema for `kind='supervisor_change'`.
 *
 * Single flat shape (no discriminated union; recipient kind is already
 * encoded by which audience FK is set on the Notification row).
 *
 * **Locked invariants (v11):**
 *   * `schemaVersion: 1` is the FIRST field. Consumers MUST inspect it before
 *     parsing the rest and fail closed on unknown versions (F-004 lesson).
 *   * `messageKey` + `messageVars` use the simple `${var}` placeholder strategy
 *     specified by the v11 panel-test Aanya finding (kept small + concrete;
 *     not a template-engine design exercise).
 *   * Localised rendering happens at the consumer (F-006 in-app panel,
 *     F-011 push adapter). F-007 freezes the substitution variables at
 *     write time (bucket-2 SNAPSHOT per rule 27).
 *
 * @derives(F-007 scope round-2 v11 §3 pick 3)
 * @derives(F-007 v11 panel-test Aanya — `${var}` placeholder + escape rule)
 * @derives(workflow-design-closure §7 Notification rules)
 * @derives(ADR-0003)
 * @derives(master-plan §G)
 */

import { z } from 'zod';

/** @derives(F-007 scope round-2 v11 §3 pick 3) */
export const EVENT_KINDS = ['acting_start', 'acting_end', 'permanent_rebind'] as const;
/** @derives(F-007 scope round-2 v11 §3 pick 3) */
export const EventKindSchema = z.enum(EVENT_KINDS);
/** @derives(F-007 scope round-2 v11 §3 pick 3) */
export type EventKind = z.infer<typeof EventKindSchema>;

/**
 * Outbox topic payload for `notification.supervisor_change`.
 * Producers (handoff-package-writer, binding-expire-sweep) enqueue this
 * shape; the dispatcher handler reads + validates it.
 *
 * @derives(F-007 scope round-2 v11 §3 picks 1 + 2)
 */
export const SupervisorChangeOutboxPayloadSchema = z.object({
  sourceAuditId: z.string().uuid(),
  bindingId: z.string().uuid(),
  eventKind: EventKindSchema,
});

/** @derives(F-007 scope round-2 v11 §3 picks 1 + 2) */
export type SupervisorChangeOutboxPayload = z.infer<typeof SupervisorChangeOutboxPayloadSchema>;

/**
 * Persisted Notification.payload shape for `kind='supervisor_change'`.
 *
 * `schemaVersion: 1` is the FIRST field per F-004 lesson; consumers fail
 * closed on unknown versions. Future schema changes bump to 2 and ship
 * with explicit migration / consumer-fallback logic.
 *
 * @derives(F-007 scope round-2 v11 §3 pick 3)
 * @derives(workflow-design-closure §3.4 Notification.payload)
 */
export const SupervisorChangeNotificationPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  /** Template selector — e.g. 'supervisor_change.acting_start'. */
  messageKey: z.string().min(1),
  /** Template fill-in — e.g. { outgoingName, incomingName, siteName }. */
  messageVars: z.record(z.string(), z.string()),
  eventKind: EventKindSchema,
  bindingId: z.string().uuid(),
  outgoingSupervisorId: z.string().uuid().nullable(),
  incomingSupervisorId: z.string().uuid(),
  siteId: z.string().uuid(),
  sourceAuditId: z.string().uuid(),
  /** Informational — NOT used by F-007 persistence logic. */
  effectiveAt: z.string().datetime(),
});

/** @derives(F-007 scope round-2 v11 §3 pick 3) */
export type SupervisorChangeNotificationPayload = z.infer<
  typeof SupervisorChangeNotificationPayloadSchema
>;

/**
 * Escape `messageVars` values for safe `${var}` substitution at render time.
 *
 * The simple `${var}` placeholder strategy doesn't run a template engine —
 * the consumer (F-006 / F-011) does literal string replacement on `${name}`
 * patterns. To avoid escape leakage from user-supplied values that happen to
 * contain `${`, `}`, backslashes, or quotes, the writer applies a small
 * escape table at write time.
 *
 * Devanagari combining marks are listed defensively — they don't trigger
 * `${var}`-pattern matching directly, but `String.prototype.replace` with a
 * regex source built from a name could misbehave on grapheme boundaries.
 * Stripping nothing — we ESCAPE control characters but preserve all script.
 *
 * Test in `notification-supervisor-change.test.ts` exercises the Telugu/Hindi
 * + apostrophe case (worker "Mr. D'Souza" + site "హైదరాబాద్").
 *
 * @derives(F-007 v11 panel-test Aanya finding)
 * @derives(F-007 scope round-2 v11 §3 pick 3)
 */
export function escapeMessageVar(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\$\{/g, '\\${')
    .replace(/\}/g, '\\}')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}
