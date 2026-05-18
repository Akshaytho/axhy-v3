/**
 * WorkerRow — one worker on a site card.
 *
 * Per R6 prototype (today.jsx:35-120). Initials avatar + name + optional
 * note + state badge + optional clock-in time. Tap opens MarkAbsentSheet
 * (the row's only write affordance per the supervisor-has-no-visit-mark
 * lock 2026-05-17 PM).
 *
 * Sprint 2 mobile (Wave 1 — ReplacementPicker): long-press opens an action
 * menu with "Find replacement". The menu is rendered by the parent (Today)
 * so the row keeps zero local UI state and remains React.memo-friendly. The
 * row only emits the long-press callback with the worker payload.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(master-plan §P.4 — ReplacementInvite)
 */

import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayWorkerT } from '@axhy/shared-schema';

import { StateBadge } from './StateBadge';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type WorkerRowProps = {
  worker: TodayWorkerT;
  onPress?: (worker: TodayWorkerT) => void;
  /**
   * Optional long-press callback. When provided, the row gains an
   * `onLongPress` affordance that the parent uses to open the
   * worker-action menu (e.g. "Find replacement"). The row itself does NOT
   * navigate — keeps the row stateless and memo-friendly.
   *
   * @derives(master-plan §P.4 — ReplacementInvite)
   */
  onLongPress?: (worker: TodayWorkerT) => void;
};

/**
 * Single worker row inside a SiteCard worker list.
 * Wrapped in React.memo so SiteCard re-renders don't re-render every row
 * when unrelated parent state (e.g. actionSheetOpen) changes.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export const WorkerRow = memo(function WorkerRow({ worker, onPress, onLongPress }: WorkerRowProps) {
  const initials = worker.name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const clockIn = worker.clockIn ? formatClockIn(worker.clockIn) : null;

  return (
    <Pressable
      onPress={onPress ? () => onPress(worker) : undefined}
      onLongPress={onLongPress ? () => onLongPress(worker) : undefined}
      delayLongPress={450}
      style={({ pressed }) => [s.row, pressed && (onPress || onLongPress) ? s.pressed : null]}
      accessibilityRole={onPress || onLongPress ? 'button' : undefined}
      accessibilityLabel={`${worker.name}, ${worker.state}`}
    >
      <View style={s.avatar}>
        <Text style={s.avatarText}>{initials}</Text>
      </View>
      <View style={s.body}>
        <Text style={s.name} numberOfLines={1}>
          {worker.name}
        </Text>
        {worker.note ? (
          <Text style={s.note} numberOfLines={1}>
            {worker.note}
          </Text>
        ) : null}
      </View>
      <View style={s.tail}>
        <StateBadge state={worker.state} />
        {clockIn ? <Text style={s.clockIn}>in {clockIn}</Text> : null}
      </View>
    </Pressable>
  );
});

function formatClockIn(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '—';
  }
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[3],
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
  },
  pressed: { backgroundColor: tokens.color.surface.paper2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.surface.paper3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.secondary,
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  note: {
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
    fontFamily: tokens.font.mono,
  },
  tail: { alignItems: 'flex-end', gap: 2 },
  clockIn: {
    fontSize: 11,
    color: tokens.color.ink.placeholder,
    fontFamily: tokens.font.mono,
  },
});
