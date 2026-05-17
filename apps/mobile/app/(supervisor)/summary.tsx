/**
 * Summary — end-of-day digest secondary surface.
 *
 * Per R6, Summary is a SECONDARY surface (not a main tab) reached from
 * Today or a notification at end-of-shift. `_layout.tsx` hides it from
 * the tab bar via `href: null` while keeping the route navigable.
 *
 * Scope this sprint: honest R6 shell with the 4 metric tiles + timeline
 * placeholder. The aggregator `GET /supervisor/summary` lands in a
 * follow-up slice; until then, tiles render zero with honest copy.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12)
 */

import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@axhy/ui-tokens';

const TILES = [
  { label: 'CHANGES TODAY', value: '—' },
  { label: 'FLAGGED', value: '—' },
  { label: 'LEAVE PENDING', value: '—' },
  { label: 'TOMORROW · ROSTER', value: '—' },
] as const;

export default function SummaryScreen() {
  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.eyebrow}>END OF DAY</Text>
        <Text style={s.heading}>Your day in numbers</Text>
        <Text style={s.subhead}>
          A digest of what changed today: how many decisions you applied, how many visits were
          flagged, leave requests still pending, and the rough shape of tomorrow.
        </Text>

        <View style={s.tileGrid}>
          {TILES.map((t) => (
            <View key={t.label} style={s.tile}>
              <Text style={s.tileLabel}>{t.label}</Text>
              <Text style={s.tileValue}>{t.value}</Text>
            </View>
          ))}
        </View>

        <View style={s.honestNote}>
          <Text style={s.honestBadge}>Coming next</Text>
          <Text style={s.honestText}>
            The numbers and timeline light up when `GET /supervisor/summary` ships. The shape you're
            looking at is the locked R6 design — not a guess.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface.paper },
  scroll: {
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[6],
    paddingBottom: tokens.space[8],
  },
  eyebrow: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.2,
    marginBottom: tokens.space[2],
  },
  heading: {
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
  },
  subhead: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    lineHeight: tokens.type.body.size * tokens.type.body.lineHeight,
    marginBottom: tokens.space[5],
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[3],
    marginBottom: tokens.space[6],
  },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
  },
  tileLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.0,
    marginBottom: tokens.space[2],
  },
  tileValue: {
    fontSize: tokens.type.display.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
  },
  honestNote: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
  },
  honestBadge: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accentInk,
    letterSpacing: 1.0,
    marginBottom: tokens.space[2],
  },
  honestText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    lineHeight: tokens.type.body.size * tokens.type.body.lineHeight,
  },
});
