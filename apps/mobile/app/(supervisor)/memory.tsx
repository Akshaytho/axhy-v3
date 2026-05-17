/**
 * Memory & rules screen — secondary surface reachable via the Drawer.
 *
 * Displays the supervisor's site rules sourced from the LivingDoc table.
 * For this slice: the backend endpoint for per-supervisor LivingDoc rows
 * is not yet exposed. The screen renders an empty state. Once
 * `GET /supervisor/living-doc` is wired, replace the empty state with
 * a FlatList of rule cards.
 *
 * Not shown in the tab bar (href: null in _layout.tsx).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { TopAppBar } from '../../components/today/TopAppBar';

/**
 * Memory & rules screen.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export default function MemoryScreen() {
  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar subtitle="MEMORY & RULES" title="Site rules" />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <EmptyRulesCard />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Placeholder card shown when no LivingDoc rules exist yet.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
function EmptyRulesCard() {
  return (
    <View style={s.emptyCard}>
      <View style={s.emptyIconWrap}>
        <Feather name="zap" size={28} color={tokens.color.brand.accent} />
      </View>
      <Text style={s.emptyTitle}>No rules yet</Text>
      <Text style={s.emptyBody}>They appear here as you and your team capture them via chat.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  content: {
    padding: tokens.space[4],
    paddingBottom: tokens.space[8],
    flexGrow: 1,
    alignItems: 'stretch',
  },
  emptyCard: {
    marginTop: tokens.space[6],
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    padding: tokens.space[5],
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.brand.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space[3],
  },
  emptyTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    textAlign: 'center',
    lineHeight: tokens.type.body.size * 1.5,
  },
});
