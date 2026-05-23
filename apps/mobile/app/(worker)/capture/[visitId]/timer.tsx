/**
 * Capture step 3 — Cleaning timer.
 *
 * Count-up timer that starts when the screen mounts. Keeps the screen awake
 * on native (expo-keep-awake — web guard matches the 2b-2 PhasePhotoCapture
 * fix). Samples GPS on native once at mount so the position is logged even
 * though no backend column exists yet (known gap, deferred to 2b-4+).
 *
 * Worker taps "Done cleaning" to proceed to after-photos.
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T7)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { CAPTURE_STEPS, NAV_ROUTES } from '../../../../lib/api-routes';

const STEP = 'timer';
const STEP_INDEX = CAPTURE_STEPS.indexOf(STEP) + 1;
const TOTAL_STEPS = CAPTURE_STEPS.length;

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

  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    if (Platform.OS !== 'web') {
      import('expo-location').then(({ getCurrentPositionAsync }) => {
        getCurrentPositionAsync({ accuracy: 3 })
          .then((pos) => {
            console.log('[timer] GPS start', pos.coords.latitude, pos.coords.longitude);
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

  function goBack(): void {
    const prevStep = CAPTURE_STEPS[STEP_INDEX - 2];
    if (prevStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(vid, prevStep));
    }
  }

  function goNext(): void {
    if (Platform.OS !== 'web') {
      import('expo-location').then(({ getCurrentPositionAsync }) => {
        getCurrentPositionAsync({ accuracy: 3 })
          .then((pos) => {
            console.log('[timer] GPS end', pos.coords.latitude, pos.coords.longitude);
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

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      {Platform.OS !== 'web' && <KeepAwake />}

      <View style={s.topBar}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to before photos"
          style={s.backBtn}
        >
          <Feather name="chevron-left" size={18} color={tokens.color.ink.secondary} />
          <Text style={s.backText}>Back</Text>
        </Pressable>
        <Text style={s.stepBadge}>
          Step {STEP_INDEX} of {TOTAL_STEPS}
        </Text>
      </View>

      <View style={s.body}>
        <Text style={s.label}>Cleaning time</Text>
        <Text style={s.clock} accessibilityLabel={`Elapsed time ${formatElapsed(elapsed)}`}>
          {formatElapsed(elapsed)}
        </Text>
        <Text style={s.hint}>Tap "Done cleaning" when you finish.</Text>
      </View>

      <View style={s.footer}>
        <Pressable
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel="Done cleaning"
          style={s.nextBtn}
        >
          <Text style={s.nextText}>Done cleaning</Text>
        </Pressable>
      </View>
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
    paddingTop: tokens.space[2],
    paddingBottom: tokens.space[3],
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
  },
  backText: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.secondary,
  },
  stepBadge: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.tertiary,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[6],
    gap: tokens.space[4],
  },
  label: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  clock: {
    fontSize: 72,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[4],
  },
  nextBtn: {
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[4],
    alignItems: 'center',
  },
  nextText: {
    fontSize: tokens.type.body.size,
    fontWeight: '600',
    color: tokens.color.surface.paper,
  },
});
