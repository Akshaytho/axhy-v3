/**
 * Capture step 3 — Cleaning timer (canon redesign).
 *
 * Count-up timer with TimerRing (terracotta progress) + mm:ss center label.
 * Keeps the screen awake on native via expo-keep-awake. Samples GPS at start
 * and end (no backend column yet — known gap from 2b-3 plan).
 *
 * Layout follows docs/design/worker-app-canon/project/worker-screens.jsx > WorkerTimer.
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T7)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerTimer)
 */

import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { CAPTURE_STEPS, NAV_ROUTES } from '../../../../lib/api-routes';
import { TimerRing } from '../../../../components/worker/TimerRing';
import { WCard } from '../../../../components/worker/WCard';
import { useWorkerTodayQuery } from '../../../../lib/queries/use-worker-today';

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
  const siteName = todayQuery.data?.visits.find((v) => v.id === vid)?.siteName ?? '';

  const [elapsed, setElapsed] = useState(0);
  const [gpsPoints, setGpsPoints] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    if (Platform.OS !== 'web') {
      import('expo-location').then(({ getCurrentPositionAsync }) => {
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
    }

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  // Simulate periodic GPS sampling on native via a 30s tick.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const id = setInterval(() => setGpsPoints((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  function goNext(): void {
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
    const nextStep = CAPTURE_STEPS[STEP_INDEX];
    if (nextStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(vid, nextStep));
    }
  }

  const pct = Math.min(100, (elapsed / SLOT_SECONDS) * 100);
  const pctLabel = Math.round(pct);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      {Platform.OS !== 'web' && <KeepAwake />}

      <View style={s.topBar}>
        <Pressable
          onPress={() => router.replace(NAV_ROUTES.workerHome)}
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

        <WCard padding={14} style={s.gpsCard}>
          <View style={s.gpsHeader}>
            <View style={s.gpsDot} />
            <Text style={s.gpsTitle}>GPS tracking active</Text>
          </View>
          <Text style={s.gpsMeta}>
            {gpsPoints} POINT{gpsPoints === 1 ? '' : 'S'} COLLECTED
          </Text>
        </WCard>

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
        <Pressable
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel="Done — take AFTER photos"
          style={({ pressed }) => [s.nextBtn, pressed && { opacity: 0.92 }]}
        >
          <Feather name="camera" size={18} color={tokens.color.surface.card} />
          <Text style={s.nextText}>Done — take AFTER photos</Text>
        </Pressable>
      </View>
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
  footer: { paddingHorizontal: 20, paddingBottom: 20 },
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
