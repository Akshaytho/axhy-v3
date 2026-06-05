/**
 * Memory & rules screen — secondary surface reachable via the Drawer.
 *
 * Renders the supervisor's own LivingDoc (their personal rules knowledge
 * base) from `GET /supervisor/living-doc`: the 5 sections (site rules,
 * worker notes, client preferences, recurring tasks, notes), each a list of
 * ACTIVE rules. WORKER_OWN-visibility rules are filtered server-side. A fresh
 * supervisor with no rules yet sees the honest empty state — NO fabricated
 * counts. Loading shows a spinner (fixes B-09: empty copy before fetch).
 *
 * Not shown in the tab bar (href: null in _layout.tsx).
 *
 * @derives(docs/locked/livingdoc-extraction-rules.md)
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { LivingDocResponseT, LivingDocRule } from '@axhy/shared-schema';

import { TopAppBar } from '../../components/today/TopAppBar';
import { useSupervisorLivingDocQuery } from '../../lib/queries/use-supervisor-living-doc';

const SECTIONS = [
  { key: 'siteRules', label: 'Site rules' },
  { key: 'workerNotes', label: 'Worker notes' },
  { key: 'clientPreferences', label: 'Client preferences' },
  { key: 'recurringTasks', label: 'Recurring tasks' },
  { key: 'freeNotes', label: 'Notes' },
] as const satisfies ReadonlyArray<{ key: keyof LivingDocResponseT; label: string }>;

/**
 * Memory & rules screen.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export default function MemoryScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useSupervisorLivingDocQuery();

  const total = data
    ? SECTIONS.reduce(
        (n, sec) => n + ((data[sec.key] as LivingDocRule[] | undefined)?.length ?? 0),
        0,
      )
    : 0;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar subtitle="MEMORY & RULES" title="Site rules" />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {isLoading && !data ? (
          <View style={s.centerCard}>
            <ActivityIndicator color={tokens.color.brand.accent} />
            <Text style={s.centerBody}>Loading your rules…</Text>
          </View>
        ) : isError && !data ? (
          <View style={s.centerCard}>
            <Text style={s.centerTitle}>Couldn&apos;t load your rules</Text>
            <Text style={s.centerBody}>Check your connection and try again.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={() => {
                void refetch();
              }}
              style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={s.retryText}>{isRefetching ? 'Retrying…' : 'Try again'}</Text>
            </Pressable>
          </View>
        ) : total === 0 ? (
          <EmptyRulesCard />
        ) : (
          SECTIONS.map((sec) => {
            const rules = (data?.[sec.key] as LivingDocRule[] | undefined) ?? [];
            if (rules.length === 0) return null;
            return (
              <View key={sec.key} style={s.section}>
                <Text style={s.sectionHeader}>{sec.label}</Text>
                {rules.map((rule) => (
                  <RuleCard key={rule.id} rule={rule} />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A single rule: its text, an optional why-line, and a visibility chip. */
function RuleCard({ rule }: { rule: LivingDocRule }) {
  const isPrivate = rule.visibility === 'SUPERVISOR_OWN';
  return (
    <View style={s.ruleCard}>
      <Text style={s.ruleText}>{rule.ruleText}</Text>
      {rule.description && rule.description !== rule.ruleText ? (
        <Text style={s.ruleDesc}>{rule.description}</Text>
      ) : null}
      <View style={[s.chip, isPrivate ? s.chipPrivate : s.chipCompany]}>
        <Feather
          name={isPrivate ? 'lock' : 'users'}
          size={11}
          color={isPrivate ? tokens.color.ink.secondary : tokens.color.brand.accentInk}
        />
        <Text style={[s.chipText, isPrivate ? s.chipTextPrivate : s.chipTextCompany]}>
          {isPrivate ? 'Private' : 'Company'}
        </Text>
      </View>
    </View>
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
  section: {
    marginBottom: tokens.space[5],
  },
  sectionHeader: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.ink.tertiary,
    marginBottom: tokens.space[2],
  },
  ruleCard: {
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    padding: tokens.space[4],
    marginBottom: tokens.space[2],
  },
  ruleText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    lineHeight: tokens.type.body.size * 1.4,
  },
  ruleDesc: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.secondary,
    marginTop: tokens.space[1],
    lineHeight: tokens.type.caption.size * 1.45,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: tokens.space[2],
    paddingHorizontal: tokens.space[2],
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipCompany: {
    backgroundColor: tokens.color.brand.accentSoft,
  },
  chipPrivate: {
    backgroundColor: tokens.color.surface.paper3,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chipTextCompany: {
    color: tokens.color.brand.accentInk,
  },
  chipTextPrivate: {
    color: tokens.color.ink.secondary,
  },
  centerCard: {
    marginTop: tokens.space[6],
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    padding: tokens.space[5],
    alignItems: 'center',
    gap: tokens.space[3],
  },
  centerTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    textAlign: 'center',
  },
  centerBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    textAlign: 'center',
  },
  retryBtn: {
    minHeight: tokens.tap.minMobile,
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: tokens.color.surface.paper,
    fontSize: tokens.type.body.size,
    fontWeight: '700',
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
