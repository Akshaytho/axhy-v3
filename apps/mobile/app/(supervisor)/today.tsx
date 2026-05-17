/**
 * Today tab — R6-faithful port.
 *
 * Layout per R6 (`docs/prototypes/supervisor-mobile-r6/project/src/today.jsx`):
 *   TopAppBar (chrome: subtitle "WEEKDAY · HH:MM" + title "Today's plan")
 *   ScrollView padded 14/14 with pb-100 for tab-bar clearance
 *     UrgencyBanner (only if late+no_show > 0 OR flagged > 0)
 *     FloorPulse (ON SITE / SHORT / PENDING) — single card with 3 columns
 *     SiteCard[]  (collapsed by default; tap → worker rows)
 *     "Pull to refresh · Updates live" footer hint
 *
 * Data path: useTodayQuery → GET /supervisor/today.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useCallback, useMemo, useState } from 'react';
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
import { tokens } from '@axhy/ui-tokens';
import type { TodayFlaggedVisitT, TodayWorkerT } from '@axhy/shared-schema';

import { useTodayQuery } from '../../lib/queries/use-today';
import { TopAppBar } from '../../components/today/TopAppBar';
import { UrgencyBanner } from '../../components/today/UrgencyBanner';
import { FloorPulse } from '../../components/today/FloorPulse';
import { SiteCard } from '../../components/today/SiteCard';
import { MarkAbsentSheet } from '../../components/today/MarkAbsentSheet';
import { FlaggedReviewSheet } from '../../components/today/FlaggedReviewSheet';

function formatWeekdayTime(d: Date): string {
  const weekday = d.toLocaleDateString([], { weekday: 'long' }).toUpperCase();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${weekday} · ${time}`;
}

export default function TodayScreen() {
  const today = useTodayQuery();
  const [markAbsentTarget, setMarkAbsentTarget] = useState<TodayWorkerT | null>(null);
  const [flaggedTarget, setFlaggedTarget] = useState<TodayFlaggedVisitT | null>(null);

  const onRefresh = useCallback(() => {
    void today.refetch();
  }, [today]);

  const subtitle = useMemo(() => formatWeekdayTime(new Date()), [today.dataUpdatedAt]);
  const data = today.data;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar title="Today's plan" subtitle={subtitle} />
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
            <UrgencyBanner pulse={data.pulse} sites={data.sites} />
            <FloorPulse pulse={data.pulse} />

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
                    <Text style={s.flaggedPhotos}>{v.photoCount} photos</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={s.footerHint}>Pull to refresh · Updates live</Text>
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
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 100,
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
    borderLeftColor: tokens.color.semantic.bad,
    borderLeftWidth: 4,
    borderRadius: tokens.radius.r2,
    padding: 14,
  },
  errorTitle: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.semantic.bad,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  errorBody: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  emptyCard: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: 20,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    lineHeight: 13 * 1.45,
  },
  flaggedSection: {
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  flaggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: tokens.color.surface.card,
    borderLeftWidth: 3,
    borderLeftColor: tokens.color.semantic.bad,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    borderRightColor: tokens.color.surface.cardEdge,
    borderBottomColor: tokens.color.surface.cardEdge,
    borderRadius: tokens.radius.r2,
    marginBottom: 8,
  },
  flaggedRowPressed: { backgroundColor: tokens.color.surface.paper2 },
  flaggedName: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  flaggedReason: {
    fontSize: 12,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  flaggedPhotos: {
    fontSize: 11,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  footerHint: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.placeholder,
    letterSpacing: 0.4,
    marginTop: 12,
  },
});
