/**
 * Activity tab — honest R6 shell.
 *
 * Per the scenarios doc: a scrollable log of recent decisions and
 * supervisor actions, with structured filter chips (date / site / kind),
 * row-expand, SHARE TO WHATSAPP (works end-to-end via OS share-sheet),
 * and a 30-minute REVERSE window. The REVERSE backend mutation is part
 * of the paused routing slice; the shell renders the filter chips +
 * empty state honestly until decision-history reads land.
 *
 * No fake REVERSE button. No log+advance stubs.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12)
 */

import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@axhy/ui-tokens';

const FILTER_CHIPS = ['Today', 'Yesterday', 'This week', 'All sites'] as const;

export default function ActivityScreen() {
  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.eyebrow}>0 EVENTS · ACTIVITY · PROOF</Text>
        <Text style={s.heading}>Nothing logged yet</Text>
        <Text style={s.subhead}>
          When you act — mark a worker absent, approve a leave, log a complaint — it shows up here.
          You can share any row to WhatsApp or reverse it within 30 minutes.
        </Text>

        <View style={s.chipRow}>
          {FILTER_CHIPS.map((c) => (
            <View key={c} style={s.chip}>
              <Text style={s.chipText}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={s.honestNote}>
          <Text style={s.honestBadge}>Coming next</Text>
          <Text style={s.honestText}>
            The full event list + REVERSE flow lights up when the routing slice ships. SHARE TO
            WHATSAPP will work the moment events exist.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
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
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[2],
    marginTop: tokens.space[5],
    marginBottom: tokens.space[6],
  },
  chip: {
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    backgroundColor: tokens.color.surface.paper3,
    borderRadius: tokens.radius.r1,
  },
  chipText: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.secondary,
    letterSpacing: 0.8,
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
