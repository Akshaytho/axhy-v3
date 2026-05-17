/**
 * WorkerRow — one worker on a site card.
 *
 * Per R6 prototype (today.jsx:35-120). Initials avatar + name + optional
 * note + state badge + optional clock-in time. Tap opens MarkAbsentSheet
 * (the row's only write affordance per the supervisor-has-no-visit-mark
 * lock 2026-05-17 PM).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayWorkerT } from '@axhy/shared-schema';

import { StateBadge } from './StateBadge';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type WorkerRowProps = {
  worker: TodayWorkerT;
  onPress?: (worker: TodayWorkerT) => void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function WorkerRow({ worker, onPress }: WorkerRowProps) {
  const initials = worker.name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const clockIn = worker.clockIn ? formatClockIn(worker.clockIn) : null;

  return (
    <Pressable
      onPress={onPress ? () => onPress(worker) : undefined}
      style={({ pressed }) => [s.row, pressed && onPress ? s.pressed : null]}
      accessibilityRole={onPress ? 'button' : undefined}
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
}

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
