/**
 * useReloadContextMutation + useReloadContextStateQuery — chat sidebar
 * "Reload context" hooks per docs/locked/chat-sidebar-context-flow.md
 * Reload Context Button.
 *
 * The mutation POSTs `/chat/reload-context` and surfaces success +
 * remaining-quota or the 429 with `nextResetAt`. The state query reads
 * the current counter without consuming a slot — used by the Drawer's
 * counter pill so opening the drawer doesn't burn a reload.
 *
 * @derives(master-plan §G)
 * @derives(plans/abstract-wandering-kazoo.md Phase 3)
 * @derives(docs/locked/chat-sidebar-context-flow.md — Reload Context Button)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, ApiError } from '../api';

import { SUPERVISOR_CONTEXT_QUERY_KEY } from './use-supervisor-context';

export type ReloadContextStateT = {
  readonly dailyLimit: number;
  readonly usedToday: number;
  readonly remaining: number;
  readonly nextResetAt: string; // ISO
};

export type ReloadContextResponseT = ReloadContextStateT & {
  readonly ok: true;
  readonly livingDocVersion: number;
  readonly companyRuleCount: number;
  readonly hrRuleCount: number;
  readonly blocks: {
    readonly companyRulesBlock: string;
    readonly hrRulesBlock: string;
    readonly livingDocBlock: string;
    readonly calendarBlock: string;
  };
};

export const RELOAD_CONTEXT_STATE_QUERY_KEY = ['reload-context-state'] as const;

/**
 * Read the current reload-context counter (without consuming). Drawer
 * uses this on open to render `${remaining}/${dailyLimit} today` so the
 * supervisor sees the budget before tapping.
 */
export function useReloadContextStateQuery() {
  return useQuery<ReloadContextStateT>({
    queryKey: RELOAD_CONTEXT_STATE_QUERY_KEY,
    queryFn: () => apiFetch<ReloadContextStateT>('/chat/reload-context/state'),
    // Counter changes when supervisor reloads; 60s staleness is fine for
    // a counter pill — the mutation hook invalidates on success.
    staleTime: 60_000,
  });
}

/**
 * Force-refresh the chat prompt context. On success: invalidates the
 * supervisor-context query (so Greeting refreshes counts) and the
 * reload-context-state query (so the Drawer pill updates).
 */
export function useReloadContextMutation() {
  const qc = useQueryClient();
  return useMutation<ReloadContextResponseT, ApiError, void>({
    mutationFn: () => apiFetch<ReloadContextResponseT>('/chat/reload-context', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SUPERVISOR_CONTEXT_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: RELOAD_CONTEXT_STATE_QUERY_KEY });
    },
  });
}

/** True iff `err` is the locked-doc 429 reached-daily-limit error. */
export function isReloadLimitReachedError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'RELOAD_LIMIT_REACHED';
}
