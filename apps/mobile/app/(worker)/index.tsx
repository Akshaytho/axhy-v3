/**
 * Worker Home — primary daily-loop screen.
 *
 * Consumes `GET /worker/today` via `useWorkerTodayQuery`. Renders:
 *   • Top bar: greeting + bell (static dot in 2a; real notif count in slice 3).
 *   • Date row: today's date in worker company tz + site count.
 *   • Resume-capture sticky banner when any visit is `EN_ROUTE`/`ON_SITE`/`IN_PROGRESS`/`PHOTOS_PENDING`.
 *   • Account-paused red banner when `worker.state` is `ON_SUSPENSION` or `BLOCKED`.
 *   • Assignment list (time-ordered) with "Next" badge on first not-completed visit.
 *   • Empty state when 0 visits today.
 *   • Pull-to-refresh via React Query `refetch`.
 *
 * State machine discipline: this screen NEVER simulates state. Every badge and
 * banner predicate is driven by backend response values (visit.state, worker.state,
 * resumeCapture). The visit lifecycle lives in `visitMachine` server-side.
 *
 * Bell tap shows a toast ("Notifications coming soon") — real list ships slice 3.
 * Resume banner tap navigates to Assignment Detail in 2a; will deep-link into
 * the capture step in slice 2b.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(master-plan §G)
 */

import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { NAV_ROUTES } from '../../lib/api-routes';
import { useWorkerTodayQuery } from '../../lib/queries/use-worker-today';
import { AssignmentCard } from '../../components/worker/AssignmentCard';
import { HomeBellIcon } from '../../components/worker/HomeBellIcon';
import { ResumeCaptureBanner } from '../../components/worker/ResumeCaptureBanner';

const PAUSED_STATES = new Set(['ON_SUSPENSION', 'BLOCKED']);
const COMPLETED_STATES = new Set(['VERIFIED', 'CANCELLED', 'NO_SHOW', 'ARCHIVED']);

function formatDateRow(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function showSoonToast(): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show('Notifications coming soon', ToastAndroid.SHORT);
  } else {
    console.log('[toast] Notifications coming soon');
  }
}

/** @derives(master-plan §G) — worker surface */
export default function WorkerHome(): React.JSX.Element {
  const { data, isLoading, isError, error, refetch, isRefetching } = useWorkerTodayQuery();

  const nextVisitId = useMemo(() => {
    if (!data) return null;
    const next = data.visits.find((v) => !COMPLETED_STATES.has(v.state));
    return next?.id ?? null;
  }, [data]);

  const onAssignmentTap = useCallback((visitId: string) => {
    router.push(NAV_ROUTES.workerVisitDetail(visitId));
  }, []);

  const onResumeContinue = useCallback(() => {
    if (data?.resumeCapture) {
      router.push(NAV_ROUTES.workerVisitDetail(data.resumeCapture.visitId));
    }
  }, [data]);

  if (isLoading) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <View style={s.center}>
          <ActivityIndicator color={tokens.color.brand.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <View style={s.center}>
          <Text style={s.errorTitle}>Couldn&apos;t load today&apos;s plan.</Text>
          <Text style={s.errorBody}>{error?.message ?? 'Please pull down to retry.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const today = data!;
  const paused = PAUSED_STATES.has(today.workerState);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.topBar}>
        <View>
          <Text style={s.brand}>Axhy</Text>
          <Text style={s.greeting}>Today</Text>
        </View>
        <HomeBellIcon onPress={showSoonToast} />
      </View>

      <View style={s.dateRow}>
        <Text style={s.dateText}>{formatDateRow(today.todayDate)}</Text>
        <Text style={s.siteCount}>
          {today.visits.length} site{today.visits.length === 1 ? '' : 's'} today
        </Text>
      </View>

      <FlatList
        data={today.visits}
        keyExtractor={(v) => v.id}
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={tokens.color.brand.accent}
          />
        }
        ListHeaderComponent={
          <>
            {today.resumeCapture ? (
              <ResumeCaptureBanner
                siteName={today.resumeCapture.siteName}
                photosTakenSoFar={today.resumeCapture.photosTakenSoFar}
                onContinue={onResumeContinue}
              />
            ) : null}
            {paused ? (
              <View style={s.pausedBanner}>
                <Text style={s.pausedTitle}>Account paused</Text>
                <Text style={s.pausedBody}>Contact your supervisor to resume work.</Text>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <AssignmentCard
            siteName={item.siteName}
            scheduledFor={item.scheduledFor}
            state={item.state}
            isNext={item.id === nextVisitId}
            onPress={() => onAssignmentTap(item.id)}
          />
        )}
        ListEmptyComponent={
          paused ? null : (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No visits today</Text>
              <Text style={s.emptyBody}>Enjoy the rest. Come back tomorrow.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[2],
  },
  brand: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accent,
    letterSpacing: tokens.type.caption.tracking,
    textTransform: 'uppercase',
  },
  greeting: {
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginTop: 2,
  },
  dateRow: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[3],
  },
  dateText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
  },
  siteCount: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[6],
  },
  pausedBanner: {
    backgroundColor: tokens.color.semantic.badSoft ?? tokens.color.brand.accentSoft,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[3],
    marginBottom: tokens.space[3],
    borderWidth: 1,
    borderColor: tokens.color.semantic.bad,
  },
  pausedTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.semantic.bad,
    marginBottom: 2,
  },
  pausedBody: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.semantic.bad,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space[6],
  },
  emptyTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[1],
  },
  emptyBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[5],
  },
  errorTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[1],
    textAlign: 'center',
  },
  errorBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
});
