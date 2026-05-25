/**
 * AuditEvent kind catalogue — Zod string enum.
 *
 * AuditEvent.kind is a free String at the DB layer (per schema comment: "Not
 * an enum so the taxonomy can grow without schema migrations"). This file is
 * the app-layer source of truth for which kinds the platform recognises.
 *
 * 2026-05-15: 15 new kinds added per workflow-design-closure §9.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9 — new AuditEvent kinds)
 */

import { z } from 'zod';

/**
 * Full catalogue of AuditEvent.kind strings the platform writes or reads.
 * Combines pre-closure (Phase B + ops workflow model §10.3) + 2026-05-15
 * closure additions (§9).
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9)
 * @derives(operations-workflow-model §10.3 — pre-closure kinds)
 */
export const AuditEventKindSchema = z.enum([
  // ── Worker lifecycle ────────────────────────────────────────────────
  'WORKER_MARKED_ABSENT',
  'ATTENDANCE_REVERSED',
  // ── Leave lifecycle ────────────────────────────────────────────────
  'LEAVE_REQUESTED',
  'LEAVE_APPROVED',
  'LEAVE_REJECTED',
  'LEAVE_REVERSED',
  // ── Site / complaint ────────────────────────────────────────────────
  'SITE_COMPLAINT_LOGGED',
  // ── Swap ────────────────────────────────────────────────────────────
  'SWAP_REQUEST_SENT',
  'SWAP_REQUEST_ACCEPTED',
  'SWAP_REQUEST_REJECTED',
  'SWAP_REVERSED',
  // ── Assignment / calendar ──────────────────────────────────────────
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_REVERSED',
  'CALENDAR_ENTRY_CREATED',
  'CALENDAR_ENTRY_UPDATED',
  'CALENDAR_ENTRY_PROMOTED',
  // ── Visit ──────────────────────────────────────────────────────────
  'VISIT_ENDED',
  // ── Wave 4 compliance flow (2026-05-18) — flagged-visit review ─────
  'VISIT_RESOLVED',
  'VISIT_REJECTED',
  // ── Wave 4 compliance flow (2026-05-18) — activity reverse + soft-flag ─
  'ACTIVITY_REVERSED',
  'ACTIVITY_LATE_REVERSAL_REQUESTED',
  // ── Chat / DWI ─────────────────────────────────────────────────────
  'CHAT_MESSAGE_CREATED',
  // ── Chat reload-context (Wave A, docs/locked/chat-sidebar-context-flow.md) ─
  'CHAT_RELOAD_CONTEXT',
  // ── LivingDoc cap (Wave A, docs/locked/livingdoc-extraction-rules.md Limits) ─
  'LIVING_DOC_RULE_AUTO_EXPIRED',
  'LIVING_DOC_RULE_ADDED',
  'DWI_PROPOSED',
  'DWI_APPLIED',
  'DWI_DISMISSED',
  'DWI_FAILED',
  'DWI_EXPIRED',
  'DWI_UNDONE',
  // ── HR Updates ─────────────────────────────────────────────────────
  'HR_UPDATE_POSTED',
  'HR_UPDATE_ACKED',
  // ── Replacement invite ─────────────────────────────────────────────
  'REPLACEMENT_INVITE_SENT',
  'REPLACEMENT_INVITE_ACCEPTED',
  'REPLACEMENT_INVITE_REJECTED',
  'REPLACEMENT_INVITE_EXPIRED',
  'REPLACEMENT_INVITE_CANCELLED',
  // ── Termination ────────────────────────────────────────────────────
  'TERMINATION_APPLIED',
  'TERMINATION_REVERSED',
  // ── AI spend / budget ──────────────────────────────────────────────
  'OWNER_BUDGET_ALERT_DISPATCHED',
  'AI_SPEND_DAILY_RESET',
  // ── Binding (Layer 1 + P1.5 follow-on) ─────────────────────────────
  'BINDING_CREATED',
  'BINDING_ENDED_MANUAL',
  'BINDING_ENDED_AUTO',
  'BINDING_ENDED_SUPERSEDED_BY_PERMANENT',
  'BINDING_ENDED_SUPERSEDED_BY_CORRECTION',
  // ── HR queue + coordination (closure §9 additions) ─────────────────
  'HR_QUEUE_LOCK_ACQUIRED',
  'HR_QUEUE_LOCK_RELEASED',
  'HR_QUEUE_LOCK_EXPIRED',
  'HR_QUEUE_LOCK_FORCE_RELEASED',
  'HR_FALLBACK_INVOKED',
  'HR_CROSS_POD_OVERRIDE_USED',
  // ── Handoff (closure Decision 8) ───────────────────────────────────
  'HANDOFF_PACKAGE_GENERATED',
  // ── Policy ─────────────────────────────────────────────────────────
  'POLICY_CHANGED',
  // ── Worker-side notifications (closure Decision 4 + 5) ─────────────
  'WORKER_SUPERVISOR_CHANGE_NOTIFIED',
  'TERMINATION_NOTIFIED_TO_SUBJECT',
  'TERMINATION_APPEAL_FILED',
  'TERMINATION_APPEAL_RESOLVED',
  'WORKER_DISPUTE_FILED',
  'WORKER_DISPUTE_RESOLVED',
  // ── Bootstrap-seed (closure Decision 6) ────────────────────────────
  'BOOTSTRAP_SEED_CONFIRMED',
  'BOOTSTRAP_SEED_REASSIGNED',
  // ── AI backlog (closure Decision 9) ────────────────────────────────
  'AI_BACKLOG_ESCALATED',
  // ── Owner emergency override (closure Decision 2 tier 3) ───────────
  'EMERGENCY_OVERRIDE_ACTIVATED',
  // ── Membership pod assignment (closure Decision 1) ─────────────────
  'MEMBERSHIP_POD_ASSIGNED',
  'MEMBERSHIP_POD_REASSIGNED',
  // ── Admin/HR backend (ADR-0026 wave-2-prep 2026-05-25) ─────────────
  'MEMBERSHIP_CREATED',
  'WORKER_CREATED',
  'WORKER_ANONYMIZED',
  'SITE_CREATED',
]);

/**
 * Inferred TypeScript type for an AuditEvent kind string.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9)
 */
export type AuditEventKind = z.infer<typeof AuditEventKindSchema>;

/**
 * Type-safe helper: returns true if a kind string is a recognised AuditEvent kind.
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9)
 */
export const isKnownAuditEventKind = (kind: string): kind is AuditEventKind => {
  return AuditEventKindSchema.safeParse(kind).success;
};
