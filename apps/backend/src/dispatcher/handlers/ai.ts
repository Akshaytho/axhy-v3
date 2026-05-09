/**
 * AI-bound handlers — stubs for Phase B.6.
 *
 * Topics handled:
 *   - ai.verify  → "queue this visit's photos for AI verification"
 *
 * Real AI verification (Anthropic Vision against photosBefore/photosAfter)
 * lands in Phase C alongside the supervisor chat / decision-extraction work.
 *
 * @derives(ADR-0023) — model-by-surface enum, AI surfaces locked
 * @derives(ADR-0009)
 * @derives(panel-2026-05-08) — phase B.6
 */

import type { FastifyBaseLogger } from 'fastify';

export async function handleAiVerify(payload: unknown, log: FastifyBaseLogger): Promise<void> {
  log.info(
    { payload, stub: 'ai' },
    '[stub] ai.verify — would queue visit photos for AI verification',
  );
}
