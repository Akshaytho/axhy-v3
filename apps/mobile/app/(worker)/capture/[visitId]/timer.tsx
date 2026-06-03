/**
 * Capture step 3 — Cleaning timer (canon redesign).
 *
 * Count-up timer with TimerRing (terracotta progress) + mm:ss center label.
 * Keeps the screen awake on native via expo-keep-awake. Samples GPS at start
 * and end (no backend column yet — known gap from 2b-3 plan).
 *
 * Lifecycle ownership split: clock-in (→ IN_PROGRESS) fires from the
 * before-photos goNext (PhasePhotoCapture); by the time timer mounts the
 * visit is already IN_PROGRESS and this screen is the resume source of
 * truth. Clock-out (→ PHOTOS_PENDING) fires on the Done press and BLOCKS
 * navigation until the server confirms — only on success (or already-
 * pending idempotent ack) do we advance to after-photos. A failure shows
 * a small inline error and re-enables the button so the worker can retry.
 *
 * Layout follows docs/design/worker-app-canon/project/worker-screens.jsx > WorkerTimer.
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T7)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerTimer)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import { useQueryClient } from '@tanstack/react-query';

import { CAPTURE_STEPS, NAV_ROUTES } from '../../../../lib/api-routes';
import { TimerRing } from '../../../../components/worker/TimerRing';
import { WCard } from '../../../../components/worker/WCard';
import { useWorkerTodayQuery } from '../../../../lib/queries/use-worker-today';
import { postWorkerClockOut } from '../../../../lib/api-lifecycle';

const STEP = 'timer';
const STEP_INDEX = CAPTURE_STEPS.indexOf(STEP) + 1;

const SLOT_SECONDS = 30 * 60; // 30-minute reference slot for "% OF SLOT"

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function KeepAwake(): null {
  useEffect(() => {
    let deactivate: (() => void) | null = null;
    import('expo-keep-awake').then(({ activateKeepAwakeAsync, deactivateKeepAwake }) => {
      const tag = 'axhy-timer';
      activateKeepAwakeAsync(tag).catch((e) => {
        console.warn('[timer] keep-awake denied', e);
      });
      deactivate = () => deactivateKeepAwake(tag);
    });
    return () => {
      deactivate?.();
    };
  }, []);
  return null;
}

/** @derives(master-plan §G) */
export default function TimerStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const vid = visitId ?? '';

  const todayQuery = useWorkerTodayQuery();
  const visit = todayQuery.data?.visits.find((v) => v.id === vid);
  const siteName = visit?.siteName ?? '';
  // BUG-10: real clock-in time, so elapsed survives leaving/reopening the timer.
  const startedAtMs = visit?.startedAt ? new Date(visit.startedAt).getTime() : null;
  const queryClient = useQueryClient();

  const [elapsed, setElapsed] = useState(0);
  const [gpsPoints, setGpsPoints] = useState(0);
  const [confirmExitVisible, setConfirmExitVisible] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock-in fires in before-photos goNext (PhasePhotoCapture); by the time the
  // timer mounts the visit is already IN_PROGRESS, so refresh caches on mount.
  useEffect(() => {
    if (vid) {
      void queryClient.invalidateQueries({ queryKey: ['worker-today'] });
      void queryClient.invalidateQueries({ queryKey: ['worker-visit', vid] });
    }
  }, [vid, queryClient]);

  // BUG-10: derive elapsed from the real clock-in time every second, so leaving
  // and reopening shows the true cleaning session instead of restarting at
  // 00:00. Fall back to a local count-up only while startedAt is still loading.
  useEffect(() => {
    function tick(): void {
      if (startedAtMs != null) {
        setElapsed(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
      } else {
        setElapsed((s) => s + 1);
      }
    }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [startedAtMs]);

  // BUG-11: one real GPS sample at start (when location policy is on). The UI
  // must not fabricate an incrementing "points collected" counter or claim
  // continuous tracking that does not happen.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void import('expo-location').then(({ getCurrentPositionAsync }) => {
      getCurrentPositionAsync({ accuracy: 3 })
        .then((pos) => {
          setGpsPoints(1);
          if (__DEV__) {
            console.warn('[timer] GPS start', pos.coords.latitude, pos.coords.longitude);
          }
        })
        .catch((e) => {
          console.warn('[timer] GPS unavailable', e);
        });
    });
  }, [vid]);

  // BUG-12: Android hardware/system back opens the same exit-confirmation sheet
  // as the on-screen home control (toggle: closed -> open, open -> dismiss).
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setConfirmExitVisible((open) => !open);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  function leaveToHome(): void {
    setConfirmExitVisible(false);
    router.replace(NAV_ROUTES.workerHome);
  }

  async function goNext(): Promise<void> {
    if (transitioning) return;
    if (Platform.OS !== 'web') {
      import('expo-location').then(({ getCurrentPositionAsync }) => {
        getCurrentPositionAsync({ accuracy: 3 })
          .then((pos) => {
            // Privacy: GPS coords are dev-only — production logs see no lat/lng.
            if (__DEV__) {
              console.warn('[timer] GPS end', pos.coords.latitude, pos.coords.longitude);
            }
          })
          .catch((e) => {
            console.warn('[timer] GPS unavailable', e);
          });
      });
    }
    if (!vid) return;
    // Worker-owned lifecycle: leaving the timer = clock-out. We refuse to
    // advance to after-photos until PHOTOS_PENDING is durable (or the server
    // confirms it was already pending — idempotent retries). Anything less
    // would let the worker reach /submit against a stale IN_PROGRESS row.
    setTransitioning(true);
    setTransitionError(null);
    try {
      await postWorkerClockOut(vid);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['worker-today'] }),
        queryClient.invalidateQueries({ queryKey: ['worker-visit', vid] }),
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not finish cleaning yet.';
      setTransitionError(message);
      setTransitioning(false);
      return;
    }
    const nextStep = CAPTURE_STEPS[STEP_INDEX];
    if (nextStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(vid, nextStep));
    }
    setTransitioning(false);
  }

  const pct = Math.min(100, (elapsed / SLOT_SECONDS) * 100);
  const pctLabel = Math.round(pct);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      {Platform.OS !== 'web' && <KeepAwake />}

      <View style={s.topBar}>
        <Pressable
          onPress={() => setConfirmExitVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          hitSlop={12}
          style={s.iconBtn}
        >
          <Feather name="home" size={20} color={tokens.color.ink.tertiary} />
        </Pressable>
        <View style={s.statusPill}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>Cleaning in progress</Text>
        </View>
        <View style={s.iconBtn} />
      </View>

      <View style={s.body}>
        <View style={s.ringWrap}>
          <TimerRing size={240} stroke={10} pct={pct} />
          <Text style={s.clock} accessibilityLabel={`Elapsed time ${formatElapsed(elapsed)}`}>
            {formatElapsed(elapsed)}
          </Text>
        </View>

        <Text style={s.elapsedCaption}>
          ELAPSED <Text style={{ color: tokens.color.brand.accent }}>·</Text> {pctLabel}% OF SLOT
        </Text>

        {gpsPoints > 0 ? (
          <WCard padding={14} style={s.gpsCard}>
            <View style={s.gpsHeader}>
              <View style={s.gpsDot} />
              <Text style={s.gpsTitle}>Location captured</Text>
            </View>
            <Text style={s.gpsMeta}>SITE CHECK-IN CONFIRMED</Text>
          </WCard>
        ) : null}

        {siteName ? (
          <View style={s.siteLabelWrap}>
            <Text style={s.siteLabelEyebrow}>CLEANING AT</Text>
            <Text style={s.siteLabelTitle} numberOfLines={1}>
              {siteName}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={s.footer}>
        {transitionError ? (
          <Text style={s.errorText} accessibilityLiveRegion="polite">
            {transitionError} Tap Done to try again.
          </Text>
        ) : null}
        <Pressable
          onPress={goNext}
          disabled={transitioning}
          accessibilityRole="button"
          accessibilityLabel={transitioning ? 'Finishing cleaning' : 'Done — take AFTER photos'}
          accessibilityState={{ disabled: transitioning, busy: transitioning }}
          style={({ pressed }) => [s.nextBtn, (pressed || transitioning) && { opacity: 0.92 }]}
        >
          {transitioning ? (
            <ActivityIndicator size="small" color={tokens.color.surface.card} />
          ) : (
            <Feather name="camera" size={18} color={tokens.color.surface.card} />
          )}
          <Text style={s.nextText}>
            {transitioning ? 'Finishing…' : 'Done — take AFTER photos'}
          </Text>
        </Pressable>
      </View>

      {confirmExitVisible ? (
        <View style={s.confirmOverlay}>
          <Pressable
            style={s.confirmBackdrop}
            accessibilityRole="button"
            accessibilityLabel="Stay on timer"
            onPress={() => setConfirmExitVisible(false)}
          />
          <WCard padding={18} style={s.confirmCard}>
            <Text style={s.confirmTitle}>Leave cleaning?</Text>
            <Text style={s.confirmBody}>
              Go back home now? You can reopen this visit from Home if you need to continue.
            </Text>
            <View style={s.confirmActions}>
              <Pressable
                onPress={() => setConfirmExitVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Stay on timer"
                style={({ pressed }) => [s.confirmSecondaryBtn, pressed && { opacity: 0.92 }]}
              >
                <Text style={s.confirmSecondaryText}>Stay here</Text>
              </Pressable>
              <Pressable
                onPress={leaveToHome}
                accessibilityRole="button"
                accessibilityLabel="Leave cleaning and go home"
                style={({ pressed }) => [s.confirmPrimaryBtn, pressed && { opacity: 0.92 }]}
              >
                <Text style={s.confirmPrimaryText}>Go home</Text>
              </Pressable>
            </View>
          </WCard>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface.paper },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.color.brand.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(192,73,42,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.brand.accent,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.brand.accent,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 28,
  },
  ringWrap: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clock: {
    position: 'absolute',
    fontWeight: '800',
    fontSize: 56,
    lineHeight: 56,
    letterSpacing: -1.5,
    color: tokens.color.ink.primary,
    fontVariant: ['tabular-nums'],
  },
  elapsedCaption: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 0.9,
    color: tokens.color.ink.tertiary,
  },
  siteLabelWrap: { alignItems: 'center', marginTop: 18 },
  siteLabelEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(40,30,20,0.55)',
    marginBottom: 4,
  },
  siteLabelTitle: { fontSize: 18, fontWeight: '700', color: 'rgba(20,18,15,0.92)' },
  gpsCard: { width: '100%' },
  gpsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  gpsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4a7c59' },
  gpsTitle: { fontSize: 14, fontWeight: '700', color: tokens.color.ink.primary },
  gpsMeta: {
    paddingLeft: 14,
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 0.9,
    color: tokens.color.ink.tertiary,
  },
  footer: { paddingHorizontal: 20, paddingBottom: 20, gap: 8 },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.brand.accent,
    textAlign: 'center',
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,18,12,0.24)',
  },
  confirmCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  confirmBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.color.ink.secondary,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  confirmSecondaryBtn: {
    flex: 1,
    minHeight: tokens.tap.minMobile,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  confirmSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.ink.primary,
  },
  confirmPrimaryBtn: {
    flex: 1,
    minHeight: tokens.tap.minMobile,
    borderRadius: 14,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  confirmPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.surface.card,
  },
  nextBtn: {
    height: 56,
    backgroundColor: tokens.color.brand.accent,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.surface.card,
  },
});
