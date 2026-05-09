/**
 * Payroll-bound handlers — stubs for Phase B.6.
 *
 * Topics handled:
 *   - payroll.recompute  → "recompute monthly running tally for this worker"
 *
 * Real payroll computation lands in Phase D (HR portal + actual run-payroll
 * UI). Today the stub only logs.
 *
 * @derives(ADR-0009)
 * @derives(panel-2026-05-08) — phase B.6
 */

import type { FastifyBaseLogger } from 'fastify';

export async function handlePayrollRecompute(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  log.info(
    { payload, stub: 'payroll' },
    '[stub] payroll.recompute — would adjust monthly running tally',
  );
}
