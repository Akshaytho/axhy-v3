/**
 * Complaint state-machine helpers.
 *
 * States (verified against apps/backend/src/lib/services/complaint-service.ts
 * and schema.prisma:774 "OPEN | IN_HR | RESOLVED | DISMISSED"): a complaint
 * is created OPEN; it may escalate to IN_HR; from either OPEN or IN_HR it can
 * be RESOLVED or DISMISSED, both terminal. complaint-service.ts gates message
 * appends and resolve on `state NOT IN ('RESOLVED','DISMISSED')` (:239) and
 * resolve on `state IN ('OPEN','IN_HR')` (:392).
 *
 * Ledger #20: single source of truth for legal Complaint transitions. Pure —
 * no DB, no side effects (state-machines.md).
 *
 * @derives(master-plan §G)
 * @derives(.claude/rules/state-machines.md)
 * @derives(apps/backend/src/lib/services/complaint-service.ts:239,269,392,774)
 */

export type ComplaintState = 'OPEN' | 'IN_HR' | 'RESOLVED' | 'DISMISSED';

/** Terminal states — no transition out. */
export const COMPLAINT_TERMINAL_STATES: ReadonlyArray<ComplaintState> = ['RESOLVED', 'DISMISSED'];

/**
 * Legal transitions:
 *   OPEN  → IN_HR | RESOLVED | DISMISSED
 *   IN_HR → RESOLVED | DISMISSED
 * RESOLVED and DISMISSED are terminal.
 */
export function canTransition(from: ComplaintState, to: ComplaintState): boolean {
  if (from === 'OPEN' && (to === 'IN_HR' || to === 'RESOLVED' || to === 'DISMISSED')) return true;
  if (from === 'IN_HR' && (to === 'RESOLVED' || to === 'DISMISSED')) return true;
  return false;
}

/** Throw if illegal; no-op if legal. Maps to 409 ALREADY_TERMINAL / COMPLAINT_TERMINAL. */
export function assertTransition(from: ComplaintState, to: ComplaintState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Complaint: illegal transition ${from}→${to}`);
  }
}

/** True if `state` is terminal. */
export function isTerminal(state: ComplaintState): boolean {
  return COMPLAINT_TERMINAL_STATES.includes(state);
}
