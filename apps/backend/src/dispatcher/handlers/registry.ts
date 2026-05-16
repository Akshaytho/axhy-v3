/**
 * Topic → handler registry.
 *
 * Each topic in the Outbox is dispatched by exact match against this registry.
 * Unknown topics raise an "UNKNOWN_TOPIC" error which the dispatcher counts
 * against `failCount` (and quarantines after 5 attempts) so a typo doesn't
 * silently disappear into the void.
 *
 * @derives(ADR-0009)
 * @derives(panel-2026-05-08) — phase B.6
 */

import type { FastifyBaseLogger } from 'fastify';

import {
  handleHrWorkerAbsent,
  handleHrSiteComplaint,
  handleWorkerLeaveApproved,
  handleWorkerLeaveRejected,
  handleGupshupSend,
} from './gupshup.js';
import { handlePayrollRecompute } from './payroll.js';
import { handleAiVerify } from './ai.js';
import { handleOwnerAiBudgetWarning, handleOwnerAiBudgetCapped } from './owner-budget.js';
import { handleNotificationSupervisorChange } from './notifications.js';

export type OutboxHandler = (payload: unknown, log: FastifyBaseLogger) => Promise<void>;

export const HANDLERS: Record<string, OutboxHandler> = {
  'hr.worker_absent': handleHrWorkerAbsent,
  'hr.site_complaint': handleHrSiteComplaint,
  'worker.leave_approved': handleWorkerLeaveApproved,
  'worker.leave_rejected': handleWorkerLeaveRejected,
  'gupshup.send': handleGupshupSend,
  'payroll.recompute': handlePayrollRecompute,
  'ai.verify': handleAiVerify,
  // Spec 2 §9.4 — owner notifications when tenant trips daily AI budget
  // thresholds. Stubs today (info log + audit row); Phase D will swap
  // for Slack #axhy-ops + Mr. Reddy WhatsApp via Gupshup.
  'owner.ai_budget_warning': handleOwnerAiBudgetWarning,
  'owner.ai_budget_capped': handleOwnerAiBudgetCapped,
  // F-007 round-2 v11 — worker-side supervisor-change persistence.
  // Reads source AuditEvent (HANDOFF_PACKAGE_GENERATED or BINDING_ENDED_AUTO)
  // emitted by F-004 / F-003 in their source tx; writes immutable Notification
  // rows per (recipient × channel × site). Delivery deferred to F-011.
  'notification.supervisor_change': handleNotificationSupervisorChange,
};

/** All registered topic names — exported for tests / observability. */
export const REGISTERED_TOPICS = Object.keys(HANDLERS);
