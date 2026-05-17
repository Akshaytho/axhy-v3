/**
 * DecisionsBadgeIcon — Decisions tab icon wired to live pending-count.
 *
 * Mounts `useDecisionsQuery` and forwards `counts.total` to `TabBadgeIcon`.
 * Renders a plain bell (no badge) while the query is loading or if the
 * request errors, so the tab bar never shows a stale or incorrect count.
 *
 * This component exists so `_layout.tsx` (a React Navigation Tab navigator
 * shell) does not need to host a React Query hook at the layout level —
 * the hook lives inside this leaf component which is mounted per-render of
 * the tab bar icon.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useDecisionsQuery } from '../lib/queries/use-decisions';

import { TabBadgeIcon } from './TabBadgeIcon';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type DecisionsBadgeIconProps = {
  /** Whether the Decisions tab is currently focused. */
  focused: boolean;
};

/**
 * Bell icon for the Decisions tab with a live red badge showing the total
 * pending-decision count from `GET /supervisor/decisions`.
 *
 * Shows no badge (count treated as null) while the query is loading or
 * has errored, matching the R6 spec that the badge only appears when there
 * is a confirmed positive count.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export function DecisionsBadgeIcon({ focused }: DecisionsBadgeIconProps) {
  const { data } = useDecisionsQuery();
  const count = data?.counts.total ?? null;

  return <TabBadgeIcon iconName="bell" count={count} focused={focused} />;
}
