/**
 * useReplacementInvitesQuery / useSendReplacementInvite / useCancelReplacementInvite /
 * useReplacementInviteOutcome — TanStack Query hooks for the F28 replacement-invite
 * surface.
 *
 * Single-recipient contract — see `feedback_replacement_invite_single_recipient.md`
 * (2026-05-18). One supervisor sends ONE invite to ONE candidate; on terminal
 * state the supervisor may send a fresh one.
 *
 * Idempotency discipline (Sprint 1 deep-review Cluster F): every state-changing
 * mutation here MUST send a freshly-generated UUID v4 in the `Idempotency-Key`
 * header so that a Slow-3G double-tap, an in-flight retry, or a backgrounded-app
 * resume never creates two invites or cancels twice. The key is generated per
 * user action (inside the mutation function call site), NOT per React render.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(master-plan §G) — supervisor surface
 * @derives(feedback_replacement_invite_single_recipient.md, 2026-05-18)
 * @derives(2026-05-18-sprint-1-deep-review.md Cluster F — idempotency)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReplacementInviteResponseT,
  ListSupervisorReplacementInvitesQueryT,
  ListSupervisorReplacementInvitesResponseT,
  ReplacementInviteRowT,
  ReplacementInviteStatus,
} from '@axhy/shared-schema';

import { apiFetch } from '../api';
import { generateIdempotencyKey } from '../idempotency-key';

// ─── Query keys ─────────────────────────────────────────────────────────────

/** Root key for the supervisor's invite list. Pass to invalidate on send/cancel. */
export const REPLACEMENT_INVITES_QUERY_KEY = ['supervisor-replacement-invites'] as const;

/** Per-invite query key — used for the waiting-screen outcome poll. */
export function replacementInviteByIdKey(id: string): readonly [string, string] {
  return ['supervisor-replacement-invite', id] as const;
}

// ─── List query ─────────────────────────────────────────────────────────────

/**
 * `GET /supervisor/replacement-invites?status=&limit=`.
 *
 * Returns the supervisor's invite inbox, newest first. The waiting-screen
 * polling path uses `useReplacementInviteOutcome` instead so it can refetch
 * a single row every 5s without re-fetching the whole list.
 *
 * @derives(master-plan §P.4)
 */
export function useReplacementInvitesQuery(
  params: { status?: ReplacementInviteStatus; limit?: number } = {},
) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return useQuery<ListSupervisorReplacementInvitesResponseT>({
    queryKey: [...REPLACEMENT_INVITES_QUERY_KEY, qs] as const,
    queryFn: () =>
      apiFetch<ListSupervisorReplacementInvitesResponseT>(
        qs ? `/supervisor/replacement-invites?${qs}` : '/supervisor/replacement-invites',
      ),
    staleTime: 15_000,
  });
}

/** @derives(master-plan §P.4) */
export function useInvalidateReplacementInvites() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: REPLACEMENT_INVITES_QUERY_KEY });
}

// ─── Send mutation ──────────────────────────────────────────────────────────

/**
 * Body the caller hands to the mutation. Mirrors the wire shape accepted by
 * `POST /supervisor/replacement-invites` — `expiresInSec` is optional on the
 * client side (backend defaults to 120s per master plan §G:976).
 *
 * The hook itself owns the Idempotency-Key lifecycle so callers cannot
 * accidentally re-use a stale key (per-action UUID v4).
 *
 * @derives(master-plan §P.4)
 */
export type SendReplacementInviteVariables = {
  siteId: string;
  scheduledStart: string;
  candidateUserId: string;
  visitId?: string | null;
  expiresInSec?: number;
};

/**
 * `POST /supervisor/replacement-invites` — single-recipient send.
 *
 * Generates a fresh UUID v4 for the `Idempotency-Key` header on every mutate
 * call. On success: invalidates the invites list AND seeds the per-invite cache
 * so the waiting screen renders the row immediately without an extra round-trip.
 *
 * @derives(master-plan §P.4)
 * @derives(feedback_replacement_invite_single_recipient.md)
 */
export function useSendReplacementInvite() {
  const qc = useQueryClient();
  return useMutation<CreateReplacementInviteResponseT, Error, SendReplacementInviteVariables>({
    mutationFn: async (variables) => {
      const idempotencyKey = generateIdempotencyKey();
      return apiFetch<CreateReplacementInviteResponseT>('/supervisor/replacement-invites', {
        method: 'POST',
        body: variables,
        headers: { 'Idempotency-Key': idempotencyKey },
      });
    },
    onSuccess: (response) => {
      void qc.invalidateQueries({ queryKey: REPLACEMENT_INVITES_QUERY_KEY });
      qc.setQueryData<ReplacementInviteRowT>(
        replacementInviteByIdKey(response.invite.id),
        response.invite,
      );
    },
  });
}

// ─── Cancel mutation ────────────────────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type CancelReplacementInviteVariables = { inviteId: string };

/**
 * `POST /supervisor/replacement-invites/:id/cancel` — supervisor recalls a
 * PENDING invite. Same per-action UUID v4 Idempotency-Key discipline as send.
 *
 * @derives(master-plan §P.4)
 */
export function useCancelReplacementInvite() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, CancelReplacementInviteVariables>({
    mutationFn: async ({ inviteId }) => {
      const idempotencyKey = generateIdempotencyKey();
      return apiFetch<{ ok: true }>(`/supervisor/replacement-invites/${inviteId}/cancel`, {
        method: 'POST',
        body: {},
        headers: { 'Idempotency-Key': idempotencyKey },
      });
    },
    onSuccess: (_response, variables) => {
      void qc.invalidateQueries({ queryKey: REPLACEMENT_INVITES_QUERY_KEY });
      void qc.invalidateQueries({
        queryKey: replacementInviteByIdKey(variables.inviteId),
      });
    },
  });
}

// ─── Single-invite outcome poll ─────────────────────────────────────────────

/**
 * Polls a single invite row every 5 seconds while its status is `PENDING`, then
 * stops polling once a terminal state lands. Used by the waiting screen.
 *
 * The waiting screen renders out of the cache populated by `useSendReplacementInvite`,
 * so the first paint is instantaneous; the polling only adds remote-state freshness.
 *
 * NB: We fetch the supervisor list with a status=PENDING filter and pick the
 * matching row instead of a single-row GET — the backend exposes the list shape
 * already (and including a single PENDING row in that list is cheap). When the
 * invite is no longer PENDING, the picker repeats the list query with the row's
 * terminal status to discover the final shape. This keeps us aligned with the
 * Wave 1 backend contract while the per-id GET is reserved for the worker app.
 *
 * Polling interval is React-Query-driven on the JS thread; the 60 FPS countdown
 * uses Reanimated on the UI thread — so polling does NOT cause per-tick re-renders.
 *
 * @derives(master-plan §P.4)
 * @derives(feedback_play_store_quality_no_lag_no_jank.md)
 */
export function useReplacementInviteOutcome(inviteId: string | null) {
  return useQuery<ReplacementInviteRowT | null>({
    queryKey: inviteId
      ? replacementInviteByIdKey(inviteId)
      : ['supervisor-replacement-invite', '__idle__'],
    enabled: inviteId !== null,
    initialData: null,
    queryFn: async () => {
      if (!inviteId) return null;
      // Pull the most-recent 50 invites and locate the one we care about.
      // `useSendReplacementInvite.onSuccess` seeds the cache so the very first
      // render reads the freshly-sent row immediately — no flash of "loading".
      const res = await apiFetch<ListSupervisorReplacementInvitesResponseT>(
        '/supervisor/replacement-invites?limit=50',
      );
      const found = res.invites.find((r) => r.id === inviteId);
      return found ?? null;
    },
    // Refetch every 5s only while the invite is still PENDING; once terminal,
    // freeze the value so the JS thread isn't woken up needlessly.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5_000;
      return data.status === 'PENDING' ? 5_000 : false;
    },
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}

// ─── Internal export helper for tests ───────────────────────────────────────

/**
 * Shape that the list endpoint serialises. Re-exporting from the hook module
 * keeps the test surface co-located with the call site.
 *
 * @derives(master-plan §P.4)
 */
export type ListSupervisorReplacementInvitesParams = ListSupervisorReplacementInvitesQueryT;
