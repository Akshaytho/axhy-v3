/**
 * FloorPulse — single card with 3-metric row.
 *
 * Per R6 prototype `today.jsx:632-673`:
 *   - One `.card` container, padding 16, marginBottom 14
 *   - "FLOOR PULSE" caption (t-caption, --ink-3 by default, tracked)
 *   - 3 columns: ON SITE (--ok) / SHORT (--bad) / PENDING (--ink)
 *   - Numbers: mono, fontSize 28, fontWeight 600, lineHeight 1
 *   - Labels: t-mono-sm uppercase, --ink-3, marginTop 4
 *   - SHORT = late + no_show (coverage gap)
 *   - PENDING = pulse.pending (action queue)
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayPulseT } from '@axhy/shared-schema';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type FloorPulseProps = { pulse: TodayPulseT };

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function FloorPulse({ pulse }: FloorPulseProps) {
  const cells: { value: number; label: string; color: string }[] = [
    { value: pulse.onSite, label: 'ON SITE', color: tokens.color.semantic.ok },
    { value: pulse.late + pulse.noShow, label: 'SHORT', color: tokens.color.semantic.bad },
    { value: pulse.pending, label: 'PENDING', color: tokens.color.ink.primary },
  ];
  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>FLOOR PULSE</Text>
      <View style={s.row}>
        {cells.map((c) => (
          <View key={c.label} style={s.cell}>
            <Text style={[s.value, { color: c.color }]}>{c.value}</Text>
            <Text style={s.label}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: 16,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.caption.size * tokens.type.caption.tracking,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  cell: { flex: 1 },
  value: {
    fontSize: 28,
    fontWeight: String(tokens.weight.semibold) as '600',
    lineHeight: 28,
    fontFamily: tokens.font.mono,
  },
  label: {
    fontSize: 11,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
    marginTop: 4,
    fontFamily: tokens.font.mono,
  },
});
