/**
 * FloorPulse — three big-number metrics across the supervisor's portfolio.
 *
 * Per R6 prototype. Per the scenarios doc, the supervisor's first glance
 * after opening Today: ON SITE / SHORT / PENDING — three numbers that say
 * the situation right now. Flagged is shown in the urgency banner above,
 * not here, because it's actionable not informational.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayPulseT } from '@axhy/shared-schema';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type FloorPulseProps = { pulse: TodayPulseT; totalDue: number };

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function FloorPulse({ pulse, totalDue }: FloorPulseProps) {
  const shortCount = Math.max(0, totalDue - pulse.onSite);
  const tiles: { label: string; value: number; tone: 'ok' | 'warn' | 'info' }[] = [
    { label: 'ON SITE', value: pulse.onSite, tone: 'ok' },
    { label: 'SHORT', value: shortCount, tone: shortCount > 0 ? 'warn' : 'ok' },
    { label: 'PENDING', value: pulse.pending, tone: 'info' },
  ];
  return (
    <View style={s.row}>
      {tiles.map((t) => (
        <View key={t.label} style={s.tile}>
          <Text style={[s.value, toneColor(t.tone)]}>{t.value}</Text>
          <Text style={s.label}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

function toneColor(tone: 'ok' | 'warn' | 'info') {
  switch (tone) {
    case 'ok':
      return { color: tokens.color.semantic.ok };
    case 'warn':
      return { color: tokens.color.semantic.warn };
    case 'info':
    default:
      return { color: tokens.color.semantic.infoInk };
  }
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: tokens.space[3],
    marginBottom: tokens.space[5],
  },
  tile: {
    flex: 1,
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[4],
    alignItems: 'flex-start',
  },
  value: {
    fontSize: tokens.type.displayL.size,
    fontWeight: String(tokens.weight.bold) as '700',
    letterSpacing: -1,
  },
  label: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.0,
    marginTop: tokens.space[1],
  },
});
