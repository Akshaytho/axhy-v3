/**
 * SwapRequest state-machine helpers.
 *
 * States (verified against apps/backend/src/routes/swap-requests.ts and
 * swap-request-service.ts): a supervisor sends a swap in SENT; the receiving
 * (responsible) supervisor decides it to ACCEPTED or DECLINED, both terminal.
 * Re-deciding returns 409 ALREADY_DECIDED.
 *
 * Ledger #20: single source of truth for legal SwapRequest transitions,
 * replacing the inline `state === 'SENT'` conditional-update guard. Pure —
 * no DB, no side effects (state-machines.md).
 *
 * @derives(master-plan §G)
 * @derives(.claude/rules/state-machines.md)
 * @derives(apps/backend/src/routes/swap-requests.ts — SENT→ACCEPTED|DECLINED)
 */

export type SwapRequestState = 'SENT' | 'ACCEPTED' | 'DECLINED';

/** Terminal states — no transition out. */
export const SWAP_REQUEST_TERMINAL_STATES: ReadonlyArray<SwapRequestState> = [
  'ACCEPTED',
  'DECLINED',
];

/**
 * Legal transitions:
 *   SENT → ACCEPTED  (decide: approve / approve_anyway)
 *   SENT → DECLINED  (decide: reject)
 * ACCEPTED and DECLINED are terminal.
 */
export function canTransition(from: SwapRequestState, to: SwapRequestState): boolean {
  if (from === 'SENT' && to === 'ACCEPTED') return true;
  if (from === 'SENT' && to === 'DECLINED') return true;
  return false;
}

/** Throw if illegal; no-op if legal. Maps to 409 ALREADY_DECIDED. */
export function assertTransition(from: SwapRequestState, to: SwapRequestState): void {
  if (!canTransition(from, to)) {
    throw new Error(`SwapRequest: illegal transition ${from}→${to}`);
  }
}

/** True if `state` is terminal (already decided). */
export function isTerminal(state: SwapRequestState): boolean {
  return SWAP_REQUEST_TERMINAL_STATES.includes(state);
}
