/**
 * Decisions tab — honest R6 shell.
 *
 * Per `handoff/supervisor-real-life-features-and-scenarios.md` and the
 * approved sprint scope: the Decisions UI shell ships per R6 design;
 * the pending-decisions read API (`GET /decisions/proposed-for-me`) is
 * part of the paused routing slice. Until that lands, the shell renders
 * with an empty state + an honest "Coming with P1 routing" line — no
 * fake rows, no log+advance stubs (per
 * `feedback_real_life_scenarios_before_implementation.md`).
 *
 * Real-world context (Layer A from the scenarios doc):
 *   Where: mid-morning lull, HR escalation push, end-of-day sweep
 *   When:  ~9:30–11 AM daily; right after chat capture; end-of-day
 *   Why:   priority queue for what needs the supervisor RIGHT NOW
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12)
 */

import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@axhy/ui-tokens';

export default function DecisionsScreen() {
  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.eyebrow}>DECISIONS · PENDING</Text>
        <Text style={s.heading}>All caught up</Text>
        <Text style={s.subhead}>
          When AI extracts decisions from your chat, or HR routes one to you, they appear here in
          priority order.
        </Text>

        <View style={s.sectionDivider} />

        <View style={s.honestNote}>
          <Text style={s.honestBadge}>Coming next</Text>
          <Text style={s.honestText}>
            The full list (NEEDS YOU NOW · ROUTINE · FAILED·REVIEW) lights up when the routing slice
            ships. Nothing is hidden behind a fake button here.
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
  sectionDivider: {
    height: 1,
    backgroundColor: tokens.color.surface.cardEdge,
    marginVertical: tokens.space[6],
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
