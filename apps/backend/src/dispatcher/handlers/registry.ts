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

export type OutboxHandler = (payload: unknown, log: FastifyBaseLogger) => Promise<void>;

export const HANDLERS: Record<string, OutboxHandler> = {
  'hr.worker_absent': handleHrWorkerAbsent,
  'hr.site_complaint': handleHrSiteComplaint,
  'worker.leave_approved': handleWorkerLeaveApproved,
  'worker.leave_rejected': handleWorkerLeaveRejected,
  'gupshup.send': handleGupshupSend,
  'payroll.recompute': handlePayrollRecompute,
  'ai.verify': handleAiVerify,
};

/** All registered topic names — exported for tests / observability. */
export const REGISTERED_TOPICS = Object.keys(HANDLERS);
