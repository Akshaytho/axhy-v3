/**
 * Capture step 6 — Submit + Verify polling (canon redesign).
 *
 * Submit collects uploaded photos, POSTs /submit, polls /verify-status,
 * then renders an OUTCOME-SPECIFIC screen — never a blanket "Site verified."
 *
 * State machine outcomes the worker actually sees:
 *   - VERIFIED        → green check, "Site verified"
 *   - FLAGGED         → amber alert, "Flagged for supervisor review"
 *   - timeout         → blue info, "Still processing" (no lie about done)
 *   - CANCELLED /
 *     NO_SHOW /
 *     ARCHIVED        → neutral closure, "Visit closed"
 *
 * Back-navigation is LOCKED once submitting begins and stays locked through
 * every terminal outcome (Android hardware-back + iOS swipe-gesture). A
 * worker cannot re-enter /review or re-submit after the AI has answered.
 *
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T8)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerSuccess)
 * @derives(master-plan §G)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { CAPTURE_STEPS, NAV_ROUTES } from '../../../../lib/api-routes';
import { r2UploadQueue } from '../../../../lib/r2-upload-queue';
import { submitVisit, fetchVerifyStatus } from '../../../../lib/api-submit';
import { WCard } from '../../../../components/worker/WCard';
import { useWorkerTodayQuery } from '../../../../lib/queries/use-worker-today';
import {
  findWorkerTodayVisit,
  formatWorkerVisitLocation,
} from '../../../../lib/worker-today-helpers';

const STEP = 'submit';
const STEP_INDEX = CAPTURE_STEPS.indexOf(STEP) + 1;
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX = 40;

type ScreenState =
  | 'idle'
  | 'submitting'
  | 'polling'
  | 'verified'
  | 'flagged'
  | 'closed'
  | 'timeout'
  | 'error';

type VerifyOutcome = { visitState: string; reason: string | null };

const TERMINAL_STATES: ReadonlySet<ScreenState> = new Set([
  'verified',
  'flagged',
  'closed',
  'timeout',
]);

const NON_IDLE_STATES: ReadonlySet<ScreenState> = new Set([
  'submitting',
  'polling',
  'verified',
  'flagged',
  'closed',
  'timeout',
]);

const ACCENT = tokens.color.brand.accent;

/** @derives(master-plan §G) */
export default function SubmitStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const vid = visitId ?? '';
  const { data } = useWorkerTodayQuery();

  const [state, setState] = useState<ScreenState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const [uploadSummary, setUploadSummary] = useState({ total: 0, uploaded: 0 });
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // CRIT-5: guards against overlapping verify-status polls on slow networks.
  const pollInFlightRef = useRef(false);
  const visit = findWorkerTodayVisit(data, vid);
  const visitLabel = formatWorkerVisitLocation(visit);
  const uploadsReady = uploadSummary.total > 0 && uploadSummary.uploaded === uploadSummary.total;
  const backLocked = NON_IDLE_STATES.has(state);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, []);

  // Android hardware-back lock during submit + every terminal outcome. iOS
  // swipe-gesture lock is enforced via Stack.Screen `gestureEnabled` below.
  useFocusEffect(
    useCallback(() => {
      if (!backLocked || Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [backLocked]),
  );

  useEffect(() => {
    function syncUploadSummary(snapshot: ReturnType<typeof r2UploadQueue.snapshot>): void {
      let total = 0;
      let uploaded = 0;
      snapshot.forEach((item) => {
        if (item.visitId !== vid) return;
        total += 1;
        if (item.status === 'done') uploaded += 1;
      });
      setUploadSummary({ total, uploaded });
    }

    syncUploadSummary(r2UploadQueue.snapshot());
    return r2UploadQueue.onChange(syncUploadSummary);
  }, [vid]);

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
    pollInFlightRef.current = false;

    pollRef.current = setInterval(() => {
      if (!mountedRef.current) {
        stopPolling();
        return;
      }
      // CRIT-5 (2026-05-24 code review): skip this tick while the previous poll
      // is still in flight. Without it, a verify-status call slower than the 3s
      // interval (common on Indian mobile networks) lets overlapping requests
      // accumulate — memory pressure and stale-closure poll counts. count only
      // advances on a poll that actually fired, so POLL_MAX stays meaningful.
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      count += 1;
      setPollCount(count);

      void (async () => {
        try {
          const status = await fetchVerifyStatus(vid);
          const vs = status.visitState;

          if (vs === 'AWAITING_VERIFICATION') {
            if (count >= POLL_MAX) {
              stopPolling();
              if (mountedRef.current) setState('timeout');
            }
            return;
          }

          stopPolling();
          if (!mountedRef.current) return;
          setOutcome({
            visitState: vs,
            reason: (status as { verificationText?: string | null }).verificationText ?? null,
          });
          if (vs === 'VERIFIED') setState('verified');
          else if (vs === 'FLAGGED') setState('flagged');
          else setState('closed');
        } catch {
          if (count >= POLL_MAX) {
            stopPolling();
            if (mountedRef.current) setState('timeout');
          }
        } finally {
          pollInFlightRef.current = false;
        }
      })();
    }, POLL_INTERVAL_MS);
  }

  function goBack(): void {
    if (backLocked) return;
    const prevStep = CAPTURE_STEPS[STEP_INDEX - 2];
    if (prevStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(vid, prevStep));
    }
  }

  function goHome(): void {
    router.replace(NAV_ROUTES.workerHome);
  }

  const showTopBar = state === 'idle' || state === 'error';
  const showSpinnerView = state === 'submitting' || state === 'polling';
  const isTerminal = TERMINAL_STATES.has(state);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          gestureEnabled: !backLocked,
          headerShown: false,
        }}
      />

      {showTopBar && (
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
              {uploadsReady
                ? 'Your photos are uploaded. Tap below to send them for AI verification.'
                : uploadSummary.total === 0
                  ? 'Upload at least one photo before you submit this visit.'
                  : `Wait for uploads to finish before submitting (${uploadSummary.uploaded}/${uploadSummary.total} ready).`}
            </Text>
          </View>
        )}

        {showSpinnerView && (
          <View style={s.center}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={s.idleTitle}>
              {state === 'submitting' ? 'Submitting photos…' : 'Verifying photos…'}
            </Text>
            {state === 'polling' ? (
              <>
                <Text style={s.idleHint}>This usually takes under a minute.</Text>
                {pollCount > 0 ? (
                  <Text style={s.pollCount}>
                    Check {pollCount} of {POLL_MAX}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        )}

        {state === 'verified' && (
          <View style={s.successWrap}>
            <View style={s.successRings}>
              <View style={s.successRingOuter} />
              <View style={s.successRingMid} />
              <View style={[s.successCheckCircle, { backgroundColor: ACCENT }]}>
                <Feather name="check" size={28} color={tokens.color.surface.card} />
              </View>
            </View>

            <Text style={s.successTitle}>Site verified</Text>
            <Text style={s.successSubtitle}>{visitLabel}</Text>

            <WCard padding={20} style={s.scoreCard}>
              <Text style={s.scoreEyebrow}>AI VERIFICATION</Text>
              <Text style={[s.statusValue, { color: ACCENT }]}>Completed</Text>
              <Text style={s.scoreRating}>Photos accepted and work logged.</Text>
              <View style={s.scoreDivider} />
              <View style={s.scoreStatsRow}>
                {[
                  { n: String(uploadSummary.uploaded), l: 'Photos' },
                  { n: 'Done', l: 'Upload' },
                  { n: 'Verified', l: 'Status' },
                ].map((stat) => (
                  <View key={stat.l} style={s.scoreStatCell}>
                    <Text style={s.scoreStatValue}>{stat.n}</Text>
                    <Text style={s.scoreStatLabel}>{stat.l}</Text>
                  </View>
                ))}
              </View>
            </WCard>

            <View style={[s.completedStrip, { backgroundColor: ACCENT }]}>
              <Text style={s.completedMono}>SITE COMPLETED</Text>
              <Text style={s.completedHeavy}>WORK LOGGED</Text>
            </View>
          </View>
        )}

        {state === 'flagged' && (
          <View style={s.successWrap}>
            <View style={s.successRings}>
              <View style={[s.successRingOuter, { borderColor: tokens.color.semantic.warnSoft }]} />
              <View style={[s.successRingMid, { borderColor: tokens.color.semantic.warn }]} />
              <View style={[s.successCheckCircle, { backgroundColor: tokens.color.semantic.warn }]}>
                <Feather name="alert-triangle" size={28} color={tokens.color.surface.card} />
              </View>
            </View>

            <Text style={s.successTitle}>Flagged for review</Text>
            <Text style={s.successSubtitle}>{visitLabel}</Text>

            <WCard padding={20} style={s.scoreCard}>
              <Text style={s.scoreEyebrow}>AI VERIFICATION</Text>
              <Text style={[s.statusValue, { color: tokens.color.semantic.warn }]}>
                Needs supervisor review
              </Text>
              <Text style={s.scoreRating}>
                {outcome?.reason
                  ? outcome.reason
                  : 'Your supervisor will review the photos and reach out if anything needs to be redone. No action needed from you right now.'}
              </Text>
            </WCard>

            <View style={[s.completedStrip, { backgroundColor: tokens.color.semantic.warn }]}>
              <Text style={s.completedMono}>VISIT SUBMITTED</Text>
              <Text style={s.completedHeavy}>AWAITING REVIEW</Text>
            </View>
          </View>
        )}

        {state === 'closed' && (
          <View style={s.successWrap}>
            <View style={s.successRings}>
              <View style={[s.successRingOuter, { borderColor: tokens.color.surface.paper3 }]} />
              <View style={[s.successRingMid, { borderColor: tokens.color.ink.tertiary }]} />
              <View style={[s.successCheckCircle, { backgroundColor: tokens.color.ink.tertiary }]}>
                <Feather name="x" size={28} color={tokens.color.surface.card} />
              </View>
            </View>

            <Text style={s.successTitle}>Visit closed</Text>
            <Text style={s.successSubtitle}>{visitLabel}</Text>

            <WCard padding={20} style={s.scoreCard}>
              <Text style={s.scoreEyebrow}>VISIT STATUS</Text>
              <Text style={[s.statusValue, { color: tokens.color.ink.primary }]}>
                {outcomeStateLabel(outcome?.visitState)}
              </Text>
              <Text style={s.scoreRating}>
                This visit was closed by your supervisor or HR. If this looks wrong, talk to your
                supervisor.
              </Text>
            </WCard>
          </View>
        )}

        {state === 'timeout' && (
          <View style={s.successWrap}>
            <View style={s.successRings}>
              <View style={[s.successRingOuter, { borderColor: tokens.color.semantic.infoSoft }]} />
              <View style={[s.successRingMid, { borderColor: tokens.color.semantic.infoInk }]} />
              <View
                style={[s.successCheckCircle, { backgroundColor: tokens.color.semantic.infoInk }]}
              >
                <Feather name="clock" size={28} color={tokens.color.surface.card} />
              </View>
            </View>

            <Text style={s.successTitle}>Still processing</Text>
            <Text style={s.successSubtitle}>{visitLabel}</Text>

            <WCard padding={20} style={s.scoreCard}>
              <Text style={s.scoreEyebrow}>AI VERIFICATION</Text>
              <Text style={[s.statusValue, { color: tokens.color.semantic.infoInk }]}>
                Taking longer than usual
              </Text>
              <Text style={s.scoreRating}>
                Your photos were submitted. The verification is still running. You can head home —
                we&apos;ll notify you when it&apos;s done.
              </Text>
            </WCard>
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
            onPress={uploadsReady ? () => void handleSubmit() : undefined}
            accessibilityRole="button"
            accessibilityLabel="Submit photos"
            disabled={!uploadsReady}
            style={({ pressed }) => [
              s.primaryBtn,
              !uploadsReady && s.primaryBtnDisabled,
              pressed && uploadsReady && { opacity: 0.92 },
            ]}
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

        {/* BUG-09: State B (polling) must let the worker leave — "Submit success
            frees the worker". The hardware/gesture lock still blocks re-entering
            /review or re-firing submit; this button is the sanctioned exit. */}
        {(isTerminal || state === 'polling') && (
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

function outcomeStateLabel(visitState: string | undefined): string {
  switch (visitState) {
    case 'CANCELLED':
      return 'Cancelled';
    case 'NO_SHOW':
      return 'Marked no-show';
    case 'ARCHIVED':
      return 'Archived';
    default:
      return 'Closed';
  }
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
    textAlign: 'center',
  },
  statusValue: {
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 28,
    letterSpacing: -0.8,
  },
  scoreRating: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.ink.secondary,
    marginTop: 8,
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
  primaryBtnDisabled: {
    opacity: 0.45,
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
