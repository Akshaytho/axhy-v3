/**
 * Worker History.
 *
 * Avoids fake multi-day history data. Until the dedicated history endpoint
 * exists, this screen shows an honest summary of today's real completed work.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(master-plan §G)
 */

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { WCard } from '../../components/worker/WCard';
import { useWorkerDrawer } from '../../components/worker/WorkerDrawer';
import { useWorkerTodayQuery } from '../../lib/queries/use-worker-today';

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${mm} ${ampm}`;
}

/** @derives(master-plan §G) */
export default function WorkerHistory(): React.JSX.Element {
  const { openDrawer } = useWorkerDrawer();
  const { data, isLoading, isError, refetch, isRefetching } = useWorkerTodayQuery();

  const visits = data?.visits ?? [];
  const verified = visits.filter((visit) => visit.state === 'VERIFIED');
  const awaiting = visits.filter((visit) => visit.state === 'AWAITING_VERIFICATION');

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Pressable
            onPress={openDrawer}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={12}
            style={s.iconBtn}
          >
            <Feather name="menu" size={22} color={tokens.color.ink.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>History</Text>
            <Text style={s.subtitle}>Real completed work only</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={tokens.color.brand.accent} />
            <Text style={s.bodyText}>Loading your work summary…</Text>
          </View>
        ) : isError || !data ? (
          <View style={s.center}>
            <Text style={s.errorTitle}>Couldn&apos;t load history.</Text>
            <Text style={s.bodyText}>Pull to retry or check your connection.</Text>
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
        ) : (
          <>
            <View style={s.cardWrap}>
              <WCard padding={18}>
                <Text style={s.sectionMono}>TODAY</Text>
                <View style={s.statsRow}>
                  <View style={s.statCell}>
                    <Text style={s.statValue}>{verified.length}</Text>
                    <Text style={s.statLabel}>Verified</Text>
                  </View>
                  <View style={s.statCell}>
                    <Text style={s.statValue}>{awaiting.length}</Text>
                    <Text style={s.statLabel}>Waiting</Text>
                  </View>
                  <View style={s.statCell}>
                    <Text style={s.statValue}>{visits.length}</Text>
                    <Text style={s.statLabel}>Total</Text>
                  </View>
                </View>
                <Text style={s.helperText}>Today&apos;s verified work and active visit count.</Text>
              </WCard>
            </View>

            <View style={s.cardWrap}>
              <Text style={s.listTitle}>Completed today</Text>
              {verified.length === 0 ? (
                <WCard padding={18}>
                  <Text style={s.emptyTitle}>No completed sites yet</Text>
                  <Text style={s.bodyText}>
                    Finished visits will appear here after they reach verified state.
                  </Text>
                </WCard>
              ) : (
                verified.map((visit) => (
                  <WCard key={visit.id} padding={16} style={s.listCard}>
                    <View style={s.rowTop}>
                      <Text style={s.siteName}>{visit.siteName}</Text>
                      <Text style={s.timeText}>{formatTimeShort(visit.scheduledFor)}</Text>
                    </View>
                    {visit.siteAddress ? (
                      <Text style={s.siteAddress} numberOfLines={2}>
                        {visit.siteAddress}
                      </Text>
                    ) : null}
                    <View style={s.verifiedPill}>
                      <Feather name="check-circle" size={12} color="#2e5037" />
                      <Text style={s.verifiedText}>Verified</Text>
                    </View>
                  </WCard>
                ))
              )}
            </View>
          </>
        )}
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
    paddingBottom: 24,
  },
  header: {
    backgroundColor: tokens.color.surface.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.paper3,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: tokens.color.ink.primary,
    lineHeight: 30,
  },
  subtitle: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 1.1,
    color: tokens.color.ink.tertiary,
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[5],
    paddingTop: 40,
  },
  cardWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionMono: {
    fontFamily: tokens.font.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: tokens.color.ink.tertiary,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCell: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  statLabel: {
    fontSize: 12,
    color: tokens.color.ink.tertiary,
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: tokens.color.ink.tertiary,
    lineHeight: 18,
    marginTop: 12,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    marginBottom: 10,
  },
  listCard: {
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  siteName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  timeText: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    color: tokens.color.brand.accent,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  siteAddress: {
    fontSize: 13,
    color: tokens.color.ink.tertiary,
    lineHeight: 19,
    marginTop: 6,
  },
  verifiedPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.color.semantic.okSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2e5037',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    marginBottom: 6,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: 14,
    color: tokens.color.ink.tertiary,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryBtn: {
    minHeight: tokens.tap.minMobile,
    paddingHorizontal: tokens.space[5],
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r3,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.surface.paper,
  },
});
