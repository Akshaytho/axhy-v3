/**
 * Gupshup-bound handlers — stubs for Phase B.6.
 *
 * Topics handled:
 *   - hr.worker_absent       → "tell HR Mukesh is absent today"
 *   - hr.site_complaint      → "tell HR a site complaint was logged"
 *   - worker.leave_approved  → "tell worker their leave got approved"
 *   - worker.leave_rejected  → "tell worker their leave was rejected"
 *   - swap.accepted          → "tell both workers their shift swap was accepted"
 *   - swap.rejected          → "tell both workers their shift swap was rejected"
 *   - gupshup.send           → "fire a generic Gupshup outbound"
 *
 * All handlers log-only today. Real Gupshup wiring lands in Phase C
 * (per master plan §G.7 — voice + AI features ship before Gupshup wiring).
 *
 * @derives(ADR-0009) — outbox + log-stub handlers until real integrations
 * @derives(panel-2026-05-08) — phase B.6
 */

import type { FastifyBaseLogger } from 'fastify';

export async function handleHrWorkerAbsent(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  log.info({ payload, stub: 'gupshup' }, '[stub] hr.worker_absent — would WhatsApp HR');
}

export async function handleHrSiteComplaint(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  log.info({ payload, stub: 'gupshup' }, '[stub] hr.site_complaint — would WhatsApp HR');
}

export async function handleWorkerLeaveApproved(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  log.info({ payload, stub: 'gupshup' }, '[stub] worker.leave_approved — would WhatsApp worker');
}

export async function handleWorkerLeaveRejected(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  log.info({ payload, stub: 'gupshup' }, '[stub] worker.leave_rejected — would WhatsApp worker');
}

export async function handleGupshupSend(payload: unknown, log: FastifyBaseLogger): Promise<void> {
  log.info({ payload, stub: 'gupshup' }, '[stub] gupshup.send — would fire Gupshup outbound');
}

export async function handleSwapAccepted(payload: unknown, log: FastifyBaseLogger): Promise<void> {
  log.info({ payload, stub: 'gupshup' }, '[stub] swap.accepted — would WhatsApp both workers');
}

export async function handleSwapRejected(payload: unknown, log: FastifyBaseLogger): Promise<void> {
  log.info({ payload, stub: 'gupshup' }, '[stub] swap.rejected — would WhatsApp both workers');
}
