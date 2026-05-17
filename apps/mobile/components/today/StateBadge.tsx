/**
 * StateBadge — worker state pill with dot + label.
 *
 * Per R6 prototype (today.jsx:13-33). Maps the canonical TodayWorkerState
 * enum to a semantic color from @axhy/ui-tokens.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayWorkerStateT } from '@axhy/shared-schema';

const MAP: Record<TodayWorkerStateT, { color: string; label: string }> = {
  on_site: { color: tokens.color.semantic.ok, label: 'On site' },
  late: { color: tokens.color.semantic.warn, label: 'Late' },
  no_show: { color: tokens.color.semantic.bad, label: 'No-show' },
  on_leave: { color: tokens.color.ink.tertiary, label: 'On leave' },
  pending: { color: tokens.color.semantic.infoInk, label: 'Pending' },
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type StateBadgeProps = { state: TodayWorkerStateT };

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function StateBadge({ state }: StateBadgeProps) {
  const m = MAP[state];
  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: m.color }]} />
      <Text style={[s.label, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
