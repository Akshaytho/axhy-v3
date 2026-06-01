// [ORCHESTRATOR_EXCEPTION] canon redesign — QR Scan

/**
 * Capture step 1 — QR Scan (canon visual).
 *
 * Renders the canon QR-scan viewport: site pill on top, dark overlay with a
 * 240x240 cutout + terracotta corner brackets + scan line, "Skip QR" pill at
 * the bottom. Real camera + decode logic lands in slice 2b-2; this screen
 * provides the canon visual today and uses the Skip CTA to advance the flow.
 *
 * Real camera integration plan:
 *   - swap the placeholder cutout for `expo-camera` <CameraView>
 *   - keep the brackets / scan line as overlay
 *   - decode QR via `expo-barcode-scanner` (or expo-camera onBarcodeScanned)
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerQRScan)
 */

import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { CAPTURE_STEPS, NAV_ROUTES } from '../../../../lib/api-routes';

const STEP = 'qr-scan';
const STEP_INDEX = CAPTURE_STEPS.indexOf(STEP) + 1;
const ACCENT = tokens.color.brand.accent;

const SITE_PLACEHOLDER = 'SITE — QR';

/** @derives(master-plan §G) */
export default function QrScanStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const vid = visitId ?? '';

  const scan = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scan]);

  function skip(): void {
    const nextStep = CAPTURE_STEPS[STEP_INDEX];
    if (nextStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(vid, nextStep));
    }
  }

  const translateY = scan.interpolate({ inputRange: [0, 1], outputRange: [-100, 100] });

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close QR scan"
          hitSlop={12}
          style={s.closeBtn}
        >
          <Feather name="x" size={16} color={tokens.color.surface.card} />
        </Pressable>
        <Text style={s.topTitle}>SCAN QR</Text>
        <View style={s.closeBtn} />
      </View>

      <View style={s.sitePillRow}>
        <View style={s.sitePill}>
          <Text style={s.sitePillText}>{SITE_PLACEHOLDER}</Text>
        </View>
      </View>

      <View style={s.framingArea}>
        <View style={s.viewport}>
          {[
            { top: 0, left: 0 },
            { top: 0, right: 0 },
            { bottom: 0, left: 0 },
            { bottom: 0, right: 0 },
          ].map((p, i) => (
            <View
              key={i}
              style={[
                s.bracket,
                p,
                {
                  borderTopWidth: p.top === 0 ? 3 : 0,
                  borderLeftWidth: p.left === 0 ? 3 : 0,
                  borderBottomWidth: p.bottom === 0 ? 3 : 0,
                  borderRightWidth: p.right === 0 ? 3 : 0,
                },
              ]}
            />
          ))}
          <Animated.View style={[s.scanLine, { transform: [{ translateY }] }]} />
        </View>
        <Text style={s.hint}>Point at the site QR code</Text>
      </View>

      <View style={s.footer}>
        <Pressable
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel="Skip QR"
          style={({ pressed }) => [s.skipBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.skipText}>Skip QR</Text>
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
    gap: 22,
  },
  viewport: {
    width: 240,
    height: 240,
    backgroundColor: '#2a221a',
    position: 'relative',
    overflow: 'hidden',
  },
  bracket: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: ACCENT,
    borderStyle: 'solid',
  },
  scanLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: '50%',
    height: 1,
    backgroundColor: ACCENT,
    opacity: 0.7,
    shadowColor: ACCENT,
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  hint: {
    fontSize: 14,
    color: 'rgba(253,250,243,0.85)',
  },
  footer: { paddingBottom: 36, alignItems: 'center' },
  skipBtn: {
    backgroundColor: 'rgba(253,250,243,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(253,250,243,0.18)',
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 12,
  },
  skipText: {
    color: tokens.color.surface.card,
    fontSize: 14,
  },
});
