// [ORCHESTRATOR_EXCEPTION] canon redesign — Submit / Success

/**
 * Capture step 6 — Submit + Verify polling (canon redesign).
 *
 * Existing submit + polling logic is preserved (collect uploaded photos,
 * POST /submit, poll /verify-status). Only the success-state visuals match
 * the canon "Site verified" screen: concentric rings burst, terracotta
 * check, score card (AI VERIFICATION SCORE / 92/100 / "Excellent work"),
 * stats row, terracotta "SITE COMPLETED · WORK LOGGED" strip, outline
 * "Back to home" button.
 *
 * The 92 score is a placeholder until the verify-status response surfaces
 * a quality score; see DESIGN_MISSING.md.
 *
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T8)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerSuccess)
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { CAPTURE_STEPS, NAV_ROUTES } from '../../../../lib/api-routes';
import { r2UploadQueue } from '../../../../lib/r2-upload-queue';
import { submitVisit, fetchVerifyStatus } from '../../../../lib/api-submit';
import { WCard } from '../../../../components/worker/WCard';

const STEP = 'submit';
const STEP_INDEX = CAPTURE_STEPS.indexOf(STEP) + 1;
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX = 40;

type ScreenState = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

const PLACEHOLDER_SCORE = 92;
const ACCENT = tokens.color.brand.accent;

/** @derives(master-plan §G) */
export default function SubmitStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const vid = visitId ?? '';

  const [state, setState] = useState<ScreenState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling(): void {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleSubmit(): Promise<void> {
    const snap = r2UploadQueue.snapshot();
    const photos = Array.from(snap.values()).filter(
      (item) => item.visitId === vid && item.status === 'done',
    );

    if (photos.length === 0) {
      setErrorMsg('No uploaded photos found. Make sure all photos finished uploading.');
      setState('error');
      return;
    }

    setState('submitting');
    try {
      await submitVisit(
        vid,
        photos.map((p) => ({ phase: p.phase, index: p.index, contentType: p.contentType })),
      );
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : 'Submit failed. Please try again.');
      setState('error');
      return;
    }

    if (!mountedRef.current) return;
    setState('polling');
    let count = 0;

    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) {
        stopPolling();
        return;
      }
      count += 1;
      setPollCount(count);

      try {
        const status = await fetchVerifyStatus(vid);
        if (status.visitState !== 'AWAITING_VERIFICATION') {
          stopPolling();
          if (mountedRef.current) setState('done');
        } else if (count >= POLL_MAX) {
          stopPolling();
          if (mountedRef.current) setState('done');
        }
      } catch {
        // transient network error — keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  function goBack(): void {
    const prevStep = CAPTURE_STEPS[STEP_INDEX - 2];
    if (prevStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(vid, prevStep));
    }
  }

  function goHome(): void {
    router.replace(NAV_ROUTES.workerHome);
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      {state !== 'done' && (
        <View style={s.topBar}>
          {state === 'idle' || state === 'error' ? (
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel="Back to review"
              hitSlop={12}
              style={s.iconBtn}
            >
              <Feather name="arrow-left" size={20} color={tokens.color.ink.primary} />
            </Pressable>
          ) : (
            <View style={s.iconBtn} />
          )}
          <Text style={s.title}>Submit</Text>
          <View style={s.iconBtn} />
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll}>
        {state === 'idle' && (
          <View style={s.center}>
            <Feather name="upload-cloud" size={48} color={ACCENT} />
            <Text style={s.idleTitle}>Submit your work</Text>
            <Text style={s.idleHint}>
              Your photos are uploaded. Tap below to send them for AI verification.
            </Text>
          </View>
        )}

        {state === 'submitting' && (
          <View style={s.center}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={s.idleTitle}>Submitting photos…</Text>
          </View>
        )}

        {state === 'polling' && (
          <View style={s.center}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={s.idleTitle}>Verifying photos…</Text>
            <Text style={s.idleHint}>This usually takes under a minute.</Text>
            {pollCount > 0 ? (
              <Text style={s.pollCount}>
                Check {pollCount} of {POLL_MAX}
              </Text>
            ) : null}
          </View>
        )}

        {state === 'done' && (
          <View style={s.successWrap}>
            <View style={s.successRings}>
              <View style={s.successRingOuter} />
              <View style={s.successRingMid} />
              <View style={s.successCheckCircle}>
                <Feather name="check" size={28} color={tokens.color.surface.card} />
              </View>
            </View>

            <Text style={s.successTitle}>Site verified</Text>
            <Text style={s.successSubtitle}>Phoenix Mall — B1 · Whitefield, Bangalore</Text>

            <WCard padding={20} style={s.scoreCard}>
              <Text style={s.scoreEyebrow}>AI VERIFICATION SCORE</Text>
              <View style={s.scoreRow}>
                <Text style={s.scoreValue}>{PLACEHOLDER_SCORE}</Text>
                <Text style={s.scoreSlash}>/100</Text>
              </View>
              <Text style={s.scoreRating}>Excellent work</Text>
              <View style={s.scoreDivider} />
              <View style={s.scoreStatsRow}>
                {[
                  { n: '8', l: 'Photos' },
                  { n: '28m', l: 'Duration' },
                  { n: 'OK', l: 'GPS' },
                ].map((stat) => (
                  <View key={stat.l} style={s.scoreStatCell}>
                    <Text style={s.scoreStatValue}>{stat.n}</Text>
                    <Text style={s.scoreStatLabel}>{stat.l}</Text>
                  </View>
                ))}
              </View>
            </WCard>

            <View style={s.completedStrip}>
              <Text style={s.completedMono}>SITE COMPLETED</Text>
              <Text style={s.completedHeavy}>WORK LOGGED</Text>
            </View>
          </View>
        )}

        {state === 'error' && (
          <View style={s.center}>
            <Feather name="alert-circle" size={48} color={tokens.color.semantic.bad} />
            <Text style={s.idleTitle}>Something went wrong</Text>
            <Text style={s.idleHint}>{errorMsg}</Text>
          </View>
        )}
      </ScrollView>

      <View style={s.footer}>
        {state === 'idle' && (
          <Pressable
            onPress={() => void handleSubmit()}
            accessibilityRole="button"
            accessibilityLabel="Submit photos"
            style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={s.primaryBtnText}>Submit photos</Text>
          </Pressable>
        )}

        {state === 'error' && (
          <Pressable
            onPress={() => void handleSubmit()}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={s.primaryBtnText}>Try again</Text>
          </Pressable>
        )}

        {state === 'done' && (
          <Pressable
            onPress={goHome}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            style={({ pressed }) => [s.outlineBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={s.outlineBtnText}>Back to home</Text>
          </Pressable>
        )}
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
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  idleTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: tokens.color.ink.primary,
    textAlign: 'center',
  },
  idleHint: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  pollCount: {
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },

  successWrap: { alignItems: 'center', paddingTop: 24 },
  successRings: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  successRingOuter: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: tokens.color.brand.accentSoft,
  },
  successRingMid: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(192,73,42,0.4)',
  },
  successCheckCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: tokens.color.ink.primary,
  },
  successSubtitle: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    marginTop: 4,
    marginBottom: 28,
    textAlign: 'center',
  },
  scoreCard: { width: '100%', marginBottom: 14 },
  scoreEyebrow: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 1.1,
    color: tokens.color.ink.tertiary,
    marginBottom: 8,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  scoreValue: {
    fontWeight: '800',
    fontSize: 64,
    letterSpacing: -2,
    color: ACCENT,
  },
  scoreSlash: {
    fontSize: 22,
    color: tokens.color.ink.tertiary,
    fontWeight: '600',
  },
  scoreRating: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#2e5037',
    marginBottom: 16,
  },
  scoreDivider: {
    height: 1,
    backgroundColor: tokens.color.surface.paper3,
    marginBottom: 14,
  },
  scoreStatsRow: { flexDirection: 'row', gap: 8 },
  scoreStatCell: { flex: 1, alignItems: 'center' },
  scoreStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  scoreStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  completedStrip: {
    width: '100%',
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completedMono: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: tokens.color.surface.card,
  },
  completedHeavy: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: tokens.color.surface.card,
  },

  footer: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  primaryBtn: {
    height: 52,
    backgroundColor: ACCENT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.surface.card,
  },
  outlineBtn: {
    height: 52,
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
});
