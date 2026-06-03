/**
 * Capture step 1 — Site check-in (honest deferred-QR pass-through).
 *
 * QR scanning is deferred per the locked decision ("Full QR deferred until a
 * site requests it; no QR scan screen wired by default, conditional on a site
 * flag only" — brain QR/location). Rather than animate a fake scan-line over a
 * dark box that reads no camera and decodes nothing, this screen is truthful:
 * it confirms the worker is starting the visit at the named site, and the only
 * action is Continue. When real QR lands, swap this for an expo-camera viewport
 * + decode + a qrCheckedIn/qrSkipped server event, gated on the site's QR flag.
 *
 * @derives(docs/capture-submission_flow/01-qr-scan.md — QR deferred interim)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerQRScan)
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { CAPTURE_STEPS, NAV_ROUTES } from '../../../../lib/api-routes';
import { useWorkerTodayQuery } from '../../../../lib/queries/use-worker-today';
import {
  findWorkerTodayVisit,
  workerCaptureRouteForVisit,
} from '../../../../lib/worker-today-helpers';

const STEP = 'qr-scan';
const STEP_INDEX = CAPTURE_STEPS.indexOf(STEP) + 1;
const ACCENT = tokens.color.brand.accent;

/** @derives(master-plan §G) */
export default function QrScanStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const vid = visitId ?? '';
  const { data } = useWorkerTodayQuery();
  const siteLabel = findWorkerTodayVisit(data, vid)?.siteName ?? 'Your site';

  function continueToVisit(): void {
    const nextStep = CAPTURE_STEPS[STEP_INDEX];
    if (nextStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(vid, nextStep));
    }
  }

  function closeToSafeDestination(): void {
    const visit = findWorkerTodayVisit(data, vid);
    if (!visit) {
      router.replace(NAV_ROUTES.workerHome);
      return;
    }
    const nextRoute = workerCaptureRouteForVisit(visit);
    router.replace(
      nextRoute === NAV_ROUTES.workerCaptureEntry(vid) ? NAV_ROUTES.workerHome : nextRoute,
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.topBar}>
        <Pressable
          onPress={closeToSafeDestination}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          hitSlop={12}
          style={s.closeBtn}
        >
          <Feather name="x" size={16} color={tokens.color.surface.card} />
        </Pressable>
        <Text style={s.topTitle}>SITE CHECK-IN</Text>
        <View style={s.closeBtn} />
      </View>

      <View style={s.sitePillRow}>
        <View style={s.sitePill}>
          <Text style={s.sitePillText}>{siteLabel}</Text>
        </View>
      </View>

      <View style={s.framingArea}>
        <View style={s.iconCircle}>
          <Feather name="map-pin" size={38} color={ACCENT} />
        </View>
        <Text style={s.title}>Start your visit</Text>
        <Text style={s.hint}>
          QR check-in isn’t set up for this site yet. Tap Continue to begin with your before photos.
        </Text>
      </View>

      <View style={s.footer}>
        <Pressable
          onPress={continueToVisit}
          accessibilityRole="button"
          accessibilityLabel="Continue to before photos"
          style={({ pressed }) => [s.continueBtn, pressed && { opacity: 0.9 }]}
        >
          <Text style={s.continueText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1612' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(253,250,243,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: tokens.font.mono,
    fontSize: 12,
    letterSpacing: 1.2,
    color: tokens.color.surface.card,
  },
  sitePillRow: { paddingTop: 12, paddingBottom: 16, alignItems: 'center' },
  sitePill: {
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sitePillText: {
    color: ACCENT,
    fontFamily: tokens.font.mono,
    fontSize: 12,
    letterSpacing: 0.96,
  },
  framingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 18,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(192,73,42,0.4)',
    backgroundColor: 'rgba(192,73,42,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: tokens.color.surface.card,
    letterSpacing: -0.3,
  },
  hint: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    color: 'rgba(253,250,243,0.8)',
  },
  footer: { paddingBottom: 36, paddingHorizontal: 20 },
  continueBtn: {
    height: 52,
    backgroundColor: ACCENT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    color: tokens.color.surface.card,
    fontSize: 16,
    fontWeight: '700',
  },
});
