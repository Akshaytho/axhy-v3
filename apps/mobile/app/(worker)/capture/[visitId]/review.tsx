// [ORCHESTRATOR_EXCEPTION] canon redesign — Final Review

/**
 * Capture step 5 — Final Review (canon redesign).
 *
 * Header now reads "Review & submit", body shows a 3-stat card (Photos /
 * Duration / GPS) above BEFORE/AFTER label pills and the underlying
 * PhotoGridReview (preserved). CTA is "Submit for verification" + the AI
 * verify hint.
 *
 * @derives(master-plan §G)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerFinalReview)
 */

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { PhotoGridReview } from '../../../../components/worker/capture/PhotoGridReview';
import { NAV_ROUTES } from '../../../../lib/api-routes';
import { StatCard } from '../../../../components/worker/StatCard';

/** @derives(master-plan §G) */
export default function ReviewStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const id = visitId ?? '';

  function goBack(): void {
    router.replace(NAV_ROUTES.workerCaptureStep(id, 'after-photos'));
  }

  function goNext(): void {
    router.replace(NAV_ROUTES.workerCaptureStep(id, 'submit'));
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.topBar}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to after photos"
          hitSlop={12}
          style={s.iconBtn}
        >
          <Feather name="arrow-left" size={20} color={tokens.color.ink.primary} />
        </Pressable>
        <Text style={s.title}>Review & submit</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.statsRow}>
          <StatCard value="8" label="Photos" padding={16} />
          <StatCard value="28m" label="Duration" padding={16} />
          <StatCard value="OK" label="GPS" padding={16} />
        </View>

        <View style={s.labelRow}>
          <View style={[s.labelPill, { backgroundColor: tokens.color.brand.accentSoft }]}>
            <Text style={[s.labelText, { color: tokens.color.brand.accent }]}>BEFORE</Text>
          </View>
          <View style={[s.labelPill, { backgroundColor: tokens.color.semantic.okSoft }]}>
            <Text style={[s.labelText, { color: '#2e5037' }]}>AFTER</Text>
          </View>
        </View>

        <View style={s.gridWrap}>
          <PhotoGridReview visitId={id} />
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel="Submit for verification"
          style={({ pressed }) => [s.nextBtn, pressed && { opacity: 0.92 }]}
        >
          <Text style={s.nextText}>Submit for verification</Text>
        </Pressable>
        <Text style={s.hint}>AI will verify within 30 seconds</Text>
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
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    letterSpacing: -0.4,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  labelRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  labelPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  labelText: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  gridWrap: { marginTop: 4 },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 14,
  },
  nextBtn: {
    height: 52,
    backgroundColor: tokens.color.brand.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.surface.card,
  },
  hint: {
    textAlign: 'center',
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    marginTop: 8,
  },
});
