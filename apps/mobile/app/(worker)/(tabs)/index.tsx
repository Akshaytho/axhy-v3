/**
 * Worker Home (Today) — canon layout from docs/design/worker-app-canon.
 *
 * Layout (rebuilt per 4-panel REJECT verdict 2026-06-01):
 *   1. Header: hamburger (left, opens drawer) + greeting/date + sync pill (right)
 *   2. NextSiteCard hero (ink) with terracotta CTA — restored from canon. The
 *      card was previously deleted on the (now-rejected) reasoning that it
 *      duplicated the NEXT pill in the list. Per panel UI/UX F-01 and
 *      worker-persona R1, the hero IS the screen's primary action.
 *   3. 2-stat strip (Done / Planned) — Avg score remains removed per prior
 *      decision (worker has no acted-on history yet).
 *   4. ResumeCaptureBanner (when server-flagged) above the plan.
 *   5. "Today's plan · N sites" list — grouped into Needs attention /
 *      In progress / Submit pending / Verifying / Upcoming / Completed
 *      sections, each shown only when non-empty (panel UI/UX F-03).
 *      FLAGGED visits live in Needs attention so the worker can see them,
 *      separate from VERIFIED completions.
 *
 * Behavior fixes landed:
 *   - Pluralization built as a single string (no split text nodes) — R-01.
 *   - 401 UNAUTHORIZED → router.replace('/(auth)/phone') after a brief banner
 *     so worker isn't stranded on the error card — A-04.
 *   - Empty state: helpful sub-line; doesn't render stat card chrome — F-13.
 *   - Greeting falls back to "Good morning/afternoon/evening" without a fake
 *     name (JWT has no `name` claim today; today/output has no first name) —
 *     F-07 path-of-least-fakery.
 *
 * Data: `useWorkerTodayQuery` (unchanged). Sync state derives from the
 * r2UploadQueue snapshot — any non-terminal item keeps the pill in "Syncing…"
 * mode. Failed uploads are treated as terminal (not in-flight) per R-02 / A-31.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerToday)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { NAV_ROUTES } from '../../../lib/api-routes';
import { ApiError } from '../../../lib/api';
import { r2UploadQueue } from '../../../lib/r2-upload-queue';
import { useWorkerTodayQuery } from '../../../lib/queries/use-worker-today';
import { AssignmentCard } from '../../../components/worker/AssignmentCard';
import { NextSiteCard } from '../../../components/worker/NextSiteCard';
import { ResumeCaptureBanner } from '../../../components/worker/ResumeCaptureBanner';
import { StatCard } from '../../../components/worker/StatCard';
import { SyncPill, type SyncState } from '../../../components/worker/SyncPill';
import { useWorkerDrawer } from '../../../components/worker/WorkerDrawer';
import {
  pickWorkerCaptureVisit,
  workerCaptureRouteForVisit,
} from '../../../lib/worker-today-helpers';

const PAUSED_STATES = new Set(['ON_SUSPENSION', 'BLOCKED']);

// Visual grouping buckets for the "Today's plan" list — panel F-03.
const IN_PROGRESS_STATES = new Set(['IN_PROGRESS']);
const SUBMIT_PENDING_STATES = new Set(['PHOTOS_PENDING']);
const VERIFYING_STATES = new Set(['AWAITING_VERIFICATION']);
const UPCOMING_STATES = new Set(['SCHEDULED', 'NOTIFIED', 'EN_ROUTE', 'ON_SITE']);
const COMPLETED_STATES = new Set(['VERIFIED', 'CANCELLED', 'NO_SHOW', 'ARCHIVED']);
const NEEDS_ATTENTION_STATES = new Set(['FLAGGED']);

function formatDateRow(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${mm} ${ampm}`;
}

function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>('synced');
  useEffect(() => {
    const unsub = r2UploadQueue.onChange((snap) => {
      let inFlight = 0;
      snap.forEach((item) => {
        // Treat 'done' AND 'failed' as terminal so a permanently failed upload
        // does not pin the pill on "Syncing…" forever (panel A-31 / R-02).
        if (item.status !== 'done' && item.status !== 'failed') inFlight += 1;
      });
      setState(inFlight > 0 ? 'syncing' : 'synced');
    });
    return unsub;
  }, []);
  return state;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? singular + 's')}`;
}

/** @derives(master-plan §G) — worker surface */
export default function WorkerHome(): React.JSX.Element {
  const { data, isLoading, isError, error, refetch, isRefetching } = useWorkerTodayQuery();
  const { openDrawer } = useWorkerDrawer();
  const syncState = useSyncState();

  // Auth recovery on 401 (panel A-04). When the query returns UNAUTHORIZED we
  // show a short "Session ended" banner and replace the route. The replace is
  // delayed so the worker sees what happened — abrupt redirects on cold-launch
  // are disorienting.
  const isUnauthorized = isError && error instanceof ApiError && error.code === 'UNAUTHORIZED';
  useEffect(() => {
    if (!isUnauthorized) return;
    const t = setTimeout(() => {
      router.replace(NAV_ROUTES.authPhone);
    }, 1500);
    return () => clearTimeout(t);
  }, [isUnauthorized]);

  const nextVisit = useMemo(() => {
    return pickWorkerCaptureVisit(data);
  }, [data]);

  const stats = useMemo(() => {
    const visits = data?.visits ?? [];
    const done = visits.filter((v) => v.state === 'VERIFIED').length;
    const planned = visits.length;
    return { done, planned };
  }, [data]);

  // Group visits for the plan list (panel F-03).
  const groups = useMemo(() => {
    const visits = data?.visits ?? [];
    return {
      needsAttention: visits.filter((v) => NEEDS_ATTENTION_STATES.has(v.state)),
      inProgress: visits.filter((v) => IN_PROGRESS_STATES.has(v.state)),
      submitPending: visits.filter((v) => SUBMIT_PENDING_STATES.has(v.state)),
      verifying: visits.filter((v) => VERIFYING_STATES.has(v.state)),
      upcoming: visits.filter((v) => UPCOMING_STATES.has(v.state)),
      completed: visits.filter((v) => COMPLETED_STATES.has(v.state)),
    };
  }, [data]);

  const onAssignmentTap = useCallback((visitId: string) => {
    router.push(NAV_ROUTES.workerVisitDetail(visitId));
  }, []);

  const onHeroPress = useCallback(() => {
    if (!nextVisit) return;
    router.replace(workerCaptureRouteForVisit(nextVisit));
  }, [nextVisit]);

  const onResumeContinue = useCallback(() => {
    const resumeId = data?.resumeCapture?.visitId;
    if (!resumeId) return;
    const resumedVisit = data?.visits.find((visit) => visit.id === resumeId);
    if (!resumedVisit) {
      router.replace(NAV_ROUTES.workerHome);
      return;
    }
    router.replace(workerCaptureRouteForVisit(resumedVisit));
  }, [data?.resumeCapture?.visitId, data?.visits]);

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
        <View style={s.center} accessibilityLiveRegion="polite">
          <Text style={s.errorTitle}>
            {isUnauthorized ? 'Session ended' : "Couldn't load today's plan."}
          </Text>
          <Text style={s.errorBody}>
            {isUnauthorized
              ? 'Signing you back in…'
              : 'Pull down to try again, or check your connection.'}
          </Text>
          {!isUnauthorized ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={() => {
                void refetch();
              }}
              style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={s.retryLabel}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <View style={s.center}>
          <Text style={s.errorTitle}>No data available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const today = data;
  const paused = PAUSED_STATES.has(today.workerState);
  const greeting = getGreeting();
  const totalVisits = today.visits.length;
  const planTitle = `Today's plan · ${pluralize(totalVisits, 'site')}`;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={tokens.color.brand.accent}
          />
        }
      >
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
          <View style={s.headerCenter}>
            <Text style={s.dateText}>{formatDateRow(today.todayDate)}</Text>
            <Text style={s.greeting}>{greeting}</Text>
          </View>
          {syncState !== 'synced' ? (
            <View accessibilityRole="text" accessibilityLabel="Syncing photos">
              <SyncPill state={syncState} />
            </View>
          ) : null}
        </View>

        {today.resumeCapture ? (
          <View style={s.resumeWrap}>
            <ResumeCaptureBanner
              siteName={today.resumeCapture.siteName}
              photosTakenSoFar={today.resumeCapture.photosTakenSoFar}
              onContinue={onResumeContinue}
            />
          </View>
        ) : null}
        {paused ? (
          <View style={s.pausedBanner}>
            <Text style={s.pausedTitle}>Account paused</Text>
            <Text style={s.pausedBody}>Contact your supervisor to resume work.</Text>
          </View>
        ) : null}

        {/* NEXT SITE hero — canon's primary anchor. F-01 BLOCKER restoration. */}
        {nextVisit ? (
          <View style={s.heroWrap}>
            <NextSiteCard
              siteName={nextVisit.siteName}
              scheduledFor={formatTimeShort(nextVisit.scheduledFor)}
              distance={null}
              visitState={nextVisit.state}
              onScanPress={onHeroPress}
            />
          </View>
        ) : null}

        <View style={s.statsRow}>
          <StatCard value={String(stats.done)} label="Done" />
          <StatCard value={String(stats.planned)} label="Planned" />
        </View>

        <View style={s.planSection}>
          <Text style={s.sectionTitle}>{planTitle}</Text>
          {totalVisits === 0 ? (
            <View style={s.empty}>
              <Feather
                name="coffee"
                size={28}
                color={tokens.color.ink.tertiary}
                style={s.emptyIcon}
              />
              <Text style={s.emptyTitle}>No work today</Text>
              <Text style={s.emptyBody}>Your supervisor will assign jobs when ready.</Text>
            </View>
          ) : (
            <>
              {groups.needsAttention.length > 0 ? (
                <View style={s.group}>
                  <Text style={[s.groupHeader, { color: tokens.color.semantic.warn }]}>
                    Needs attention
                  </Text>
                  {groups.needsAttention.map((v, i) => (
                    <AssignmentCard
                      key={v.id}
                      siteName={v.siteName}
                      scheduledFor={v.scheduledFor}
                      state={v.state}
                      isNext={false}
                      isLast={i === groups.needsAttention.length - 1}
                      onPress={() => onAssignmentTap(v.id)}
                    />
                  ))}
                </View>
              ) : null}
              {groups.inProgress.length > 0 ? (
                <View style={s.group}>
                  <Text style={s.groupHeader}>In progress</Text>
                  {groups.inProgress.map((v, i) => (
                    <AssignmentCard
                      key={v.id}
                      siteName={v.siteName}
                      scheduledFor={v.scheduledFor}
                      state={v.state}
                      isNext={v.id === nextVisit?.id}
                      isLast={i === groups.inProgress.length - 1}
                      onPress={() => onAssignmentTap(v.id)}
                    />
                  ))}
                </View>
              ) : null}
              {groups.submitPending.length > 0 ? (
                <View style={s.group}>
                  <Text style={s.groupHeader}>Submit pending</Text>
                  {groups.submitPending.map((v, i) => (
                    <AssignmentCard
                      key={v.id}
                      siteName={v.siteName}
                      scheduledFor={v.scheduledFor}
                      state={v.state}
                      isNext={v.id === nextVisit?.id}
                      isLast={i === groups.submitPending.length - 1}
                      onPress={() => onAssignmentTap(v.id)}
                    />
                  ))}
                </View>
              ) : null}
              {groups.verifying.length > 0 ? (
                <View style={s.group}>
                  <Text style={s.groupHeader}>Verifying</Text>
                  {groups.verifying.map((v, i) => (
                    <AssignmentCard
                      key={v.id}
                      siteName={v.siteName}
                      scheduledFor={v.scheduledFor}
                      state={v.state}
                      isNext={v.id === nextVisit?.id}
                      isLast={i === groups.verifying.length - 1}
                      onPress={() => onAssignmentTap(v.id)}
                    />
                  ))}
                </View>
              ) : null}
              {groups.upcoming.length > 0 ? (
                <View style={s.group}>
                  <Text style={s.groupHeader}>Upcoming</Text>
                  {groups.upcoming.map((v, i) => (
                    <AssignmentCard
                      key={v.id}
                      siteName={v.siteName}
                      scheduledFor={v.scheduledFor}
                      state={v.state}
                      isNext={v.id === nextVisit?.id}
                      isLast={i === groups.upcoming.length - 1}
                      onPress={() => onAssignmentTap(v.id)}
                    />
                  ))}
                </View>
              ) : null}
              {groups.completed.length > 0 ? (
                <View style={s.group}>
                  <Text style={s.groupHeader}>Completed</Text>
                  {groups.completed.map((v, i) => (
                    <AssignmentCard
                      key={v.id}
                      siteName={v.siteName}
                      scheduledFor={v.scheduledFor}
                      state={v.state}
                      isNext={false}
                      isLast={i === groups.completed.length - 1}
                      onPress={() => onAssignmentTap(v.id)}
                    />
                  ))}
                </View>
              ) : null}
            </>
          )}
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
  scroll: { paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  dateText: {
    fontSize: 13,
    color: tokens.color.ink.tertiary,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  resumeWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  pausedBanner: {
    marginHorizontal: 20,
    backgroundColor: tokens.color.semantic.badSoft,
    borderRadius: tokens.radius.r3,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: tokens.color.semantic.bad,
  },
  pausedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.semantic.bad,
    marginBottom: 2,
  },
  pausedBody: {
    fontSize: 12,
    color: tokens.color.semantic.bad,
  },
  heroWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  planSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: tokens.color.ink.tertiary,
    marginBottom: 8,
  },
  group: {
    marginBottom: 12,
  },
  groupHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: tokens.color.ink.tertiary,
    marginTop: 4,
    marginBottom: 4,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: tokens.color.ink.primary,
    marginBottom: 4,
  },
  emptyBody: {
    fontSize: 14,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: tokens.color.ink.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.color.brand.accent,
  },
  retryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.brand.accent,
  },
});
