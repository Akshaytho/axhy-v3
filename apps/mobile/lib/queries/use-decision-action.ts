/**
 * useDecisionAction — fires a server-driven `DecisionAction` button.
 *
 * Wave 2 Sprint 2 (2026-05-18) — every `DecisionRow.actions[]` button on the
 * Decisions queue runs through this hook. The hook:
 *
 *   - Generates a fresh `Idempotency-Key` (uuid v4) per user tap. Double-tap
 *     on a Slow 3G connection therefore presents the SAME key to the backend
 *     twice; Cluster F's idempotency table replays the first response instead
 *     of creating a duplicate approval / reject / accept.
 *   - Calls `apiFetch` with the action's `endpoint` + `method` + merged body.
 *   - On success, invalidates the Decisions queue so the consumed row drops.
 *
 * The hook is intentionally body-agnostic: callers merge `{ reason }` (for
 * reason-sheet) or `{ overrideToken }` (for typed-phrase) into the body before
 * invoking the mutation. The hook does not interpret `requiresConfirm` —
 * that's a render-time concern handled inside `DecisionCard`.
 *
 * @derives(Wave 2 plan §3C — actions[] contract)
 * @derives(drawer-redesign §B.4 — card variants)
 * @derives(master-plan §G) — supervisor surface
 */

import { useMutation } from '@tanstack/react-query';
import type { DecisionActionT } from '@axhy/shared-schema';

import { apiFetch } from '../api';
import { generateIdempotencyKey } from '../idempotency-key';

import { useInvalidateDecisions } from './use-decisions';

/**
 * The full payload that `DecisionCard` hands to `useDecisionAction`. The card
 * is responsible for merging any user-typed reason / override token into
 * `bodyOverrides` so the hook can stay declarative.
 *
 * @derives(Wave 2 plan §3C)
 */
export type DecisionActionInvocation = {
  /** The server-supplied action descriptor. */
  action: DecisionActionT;
  /** Extra body fields merged on top of `action.body`. */
  bodyOverrides?: Record<string, unknown>;
};

/**
 * Builds the JSON request body by merging the server's pre-filled `body`
 * with any client-side overrides (reason / overrideToken).
 *
 * Server-supplied keys win when both sides set the same field, since the
 * server's body is the authoritative starting point. Client overrides are
 * additive ONLY — they add `reason` or `overrideToken` that the server
 * couldn't know at row-build time.
 *
 * @derives(Wave 2 plan §3C)
 */
function buildRequestBody(invocation: DecisionActionInvocation): Record<string, unknown> {
  const { action, bodyOverrides } = invocation;
  const merged: Record<string, unknown> = { ...(bodyOverrides ?? {}), ...(action.body ?? {}) };
  return merged;
}

/**
 * Fires a single `DecisionAction` button press. Generates a per-tap
 * `Idempotency-Key`, calls the action's endpoint with the merged body,
 * then invalidates the Decisions queue so the row disappears.
 *
 * Usage inside `DecisionCard`:
 * ```tsx
 * const runAction = useDecisionAction();
 * runAction.mutate({ action, bodyOverrides: { reason } });
 * ```
 *
 * @derives(Wave 2 plan §3C — actions[] contract)
 * @derives(master-plan §G) — supervisor surface
 */
export function useDecisionAction() {
  const invalidate = useInvalidateDecisions();
  return useMutation({
    mutationFn: async (invocation: DecisionActionInvocation) => {
      const { action } = invocation;
      const body = buildRequestBody(invocation);
      const idempotencyKey = generateIdempotencyKey();
      return apiFetch<unknown>(action.endpoint, {
        method: action.method,
        body: action.method === 'DELETE' ? undefined : body,
        headers: { 'Idempotency-Key': idempotencyKey },
      });
    },
    onSuccess: () => void invalidate(),
  });
}
