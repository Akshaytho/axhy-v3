/**
 * Today tab — R6-faithful port (2026-05-17 sprint).
 *
 * Composition:
 *   TopAppBar (greeting + portfolio summary)
 *   UrgencyBanner (only renders when stuff needs attention)
 *   FloorPulse (3 big-number metrics: ON SITE / SHORT / PENDING)
 *   SiteCard[] (collapsed-by-default; expand to see workers)
 *     WorkerRow (tap → MarkAbsentSheet)
 *   Flagged-visit list (tap → FlaggedReviewSheet, disabled controls)
 *
 * Data path: useTodayQuery → GET /supervisor/today (server-side
 * portfolio + state derivation; client never re-aggregates).
 * Pull-to-refresh wired via RN RefreshControl.
 *
 * Per founder lock (feedback_supervisor_no_visit_mark_button), the only
 * supervisor write affordance on this screen is MarkAbsentSheet which
 * writes Attendance, not Visit. Visit lifecycle is worker-driven.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '@axhy/ui-tokens';
import type { MeOutput, TodayFlaggedVisitT, TodayWorkerT } from '@axhy/shared-schema';

import { apiFetch } from '../../lib/api';
import { useTodayQuery } from '../../lib/queries/use-today';
import { TopAppBar } from '../../components/today/TopAppBar';
import { UrgencyBanner } from '../../components/today/UrgencyBanner';
import { FloorPulse } from '../../components/today/FloorPulse';
import { SiteCard } from '../../components/today/SiteCard';
import { MarkAbsentSheet } from '../../components/today/MarkAbsentSheet';
import { FlaggedReviewSheet } from '../../components/today/FlaggedReviewSheet';

export default function TodayScreen() {
  const today = useTodayQuery();
  const me = useQuery<MeOutput>({ queryKey: ['me'], queryFn: () => apiFetch<MeOutput>('/me') });
  const [markAbsentTarget, setMarkAbsentTarget] = useState<TodayWorkerT | null>(null);
  const [flaggedTarget, setFlaggedTarget] = useState<TodayFlaggedVisitT | null>(null);

  const onRefresh = useCallback(() => {
    void today.refetch();
  }, [today]);

  const firstName = me.data?.user.name?.split(/\s+/)[0] ?? null;
  const data = today.data;
  const totalDue = data?.sites.reduce((sum, site) => sum + site.workersDue, 0) ?? 0;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={today.isFetching && !today.isLoading}
            onRefresh={onRefresh}
            tintColor={tokens.color.brand.accent}
          />
        }
      >
        <TopAppBar
          firstName={firstName}
          siteCount={data?.sites.length ?? null}
          workerCount={data?.workers.length ?? null}
        />

        {today.isLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={tokens.color.brand.accent} />
            <Text style={s.loadingText}>Loading today…</Text>
          </View>
        ) : today.isError ? (
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Could not load today</Text>
            <Text style={s.errorBody}>
              {today.error instanceof Error
                ? today.error.message
                : 'Network problem. Pull to retry.'}
            </Text>
          </View>
        ) : data ? (
          <>
            <UrgencyBanner pulse={data.pulse} />
            <FloorPulse pulse={data.pulse} totalDue={totalDue} />

            {data.sites.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyTitle}>No sites yet</Text>
                <Text style={s.emptyBody}>
                  Your HR will assign sites to you. When they do, this screen will show your roster
                  — every site, every worker, every shift.
                </Text>
              </View>
            ) : (
              <View>
                {data.sites.map((site) => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    workers={data.workers}
                    onWorkerPress={(w) => setMarkAbsentTarget(w)}
                  />
                ))}
              </View>
            )}

            {data.flaggedVisits.length > 0 ? (
              <View style={s.flaggedSection}>
                <Text style={s.sectionHeading}>FLAGGED VISITS · NEEDS REVIEW</Text>
                {data.flaggedVisits.map((v) => (
                  <Pressable
                    key={v.visitId}
                    onPress={() => setFlaggedTarget(v)}
                    style={({ pressed }) => [s.flaggedRow, pressed ? s.flaggedRowPressed : null]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.flaggedName}>
                        {v.workerName} · {v.siteName}
                      </Text>
                      <Text style={s.flaggedReason} numberOfLines={2}>
                        {v.reason ?? 'AI flagged this visit for review.'}
                      </Text>
                    </View>
                    <View style={s.flaggedMeta}>
                      <Text style={s.flaggedPhotos}>{v.photoCount} photos</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <MarkAbsentSheet worker={markAbsentTarget} onClose={() => setMarkAbsentTarget(null)} />
      <FlaggedReviewSheet visit={flaggedTarget} onClose={() => setFlaggedTarget(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface.paper },
  scroll: {
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[5],
    paddingBottom: tokens.space[9],
  },
  center: {
    alignItems: 'center',
    paddingVertical: tokens.space[8],
    gap: tokens.space[3],
  },
  loadingText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },
  errorCard: {
    backgroundColor: tokens.color.semantic.badSoft,
    borderColor: tokens.color.semantic.bad,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
  },
  errorTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.bad,
    marginBottom: tokens.space[2],
  },
  errorBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
  },
  emptyCard: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[5],
    marginBottom: tokens.space[5],
  },
  emptyTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
  },
  emptyBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    lineHeight: tokens.type.body.size * tokens.type.body.lineHeight,
  },
  flaggedSection: {
    marginTop: tokens.space[4],
  },
  sectionHeading: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.2,
    marginBottom: tokens.space[2],
  },
  flaggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.semantic.bad,
    borderLeftWidth: 3,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    borderRightColor: tokens.color.surface.cardEdge,
    borderBottomColor: tokens.color.surface.cardEdge,
    borderRadius: tokens.radius.r3,
    marginBottom: tokens.space[2],
  },
  flaggedRowPressed: { backgroundColor: tokens.color.surface.paper2 },
  flaggedName: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  flaggedReason: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  flaggedMeta: { alignItems: 'flex-end' },
  flaggedPhotos: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.0,
  },
});
