/**
 * Capture step 6 — Submit + Verify polling.
 *
 * Collects the set of successfully uploaded photos from the in-memory
 * r2UploadQueue, calls POST /worker/visits/:visitId/submit, then polls
 * GET /worker/visits/:visitId/verify-status every 3 seconds until the
 * visit leaves AWAITING_VERIFICATION or the poll limit is reached.
 *
 * State flow: idle → submitting → polling → done | error
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T8)
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { CAPTURE_STEPS, NAV_ROUTES } from '../../../../lib/api-routes';
import { r2UploadQueue } from '../../../../lib/r2-upload-queue';
import { submitVisit, fetchVerifyStatus } from '../../../../lib/api-submit';

const STEP = 'submit';
const STEP_INDEX = CAPTURE_STEPS.indexOf(STEP) + 1;
const TOTAL_STEPS = CAPTURE_STEPS.length;
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX = 40;

type ScreenState = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

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
      <View style={s.topBar}>
        {state === 'idle' || state === 'error' ? (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back to review"
            style={s.backBtn}
          >
            <Feather name="chevron-left" size={18} color={tokens.color.ink.secondary} />
            <Text style={s.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={s.backBtn} />
        )}
        <Text style={s.stepBadge}>
          Step {STEP_INDEX} of {TOTAL_STEPS}
        </Text>
      </View>

      <View style={s.body}>
        {state === 'idle' && (
          <>
            <Feather name="upload-cloud" size={48} color={tokens.color.brand.accent} />
            <Text style={s.title}>Submit your work</Text>
            <Text style={s.hint}>
              Your photos are uploaded. Tap below to send them for AI verification.
            </Text>
          </>
        )}

        {state === 'submitting' && (
          <>
            <ActivityIndicator size="large" color={tokens.color.brand.accent} />
            <Text style={s.statusText}>Submitting photos…</Text>
          </>
        )}

        {state === 'polling' && (
          <>
            <ActivityIndicator size="large" color={tokens.color.brand.accent} />
            <Text style={s.statusText}>Verifying photos…</Text>
            <Text style={s.hint}>This usually takes under a minute.</Text>
            {pollCount > 0 && (
              <Text style={s.pollCount}>
                Check {pollCount} of {POLL_MAX}
              </Text>
            )}
          </>
        )}

        {state === 'done' && (
          <>
            <Feather name="check-circle" size={48} color={tokens.color.semantic.ok} />
            <Text style={s.title}>All done!</Text>
            <Text style={s.hint}>Your photos have been submitted for verification.</Text>
          </>
        )}

        {state === 'error' && (
          <>
            <Feather name="alert-circle" size={48} color={tokens.color.semantic.bad} />
            <Text style={s.title}>Something went wrong</Text>
            <Text style={s.hint}>{errorMsg}</Text>
          </>
        )}
      </View>

      <View style={s.footer}>
        {state === 'idle' && (
          <Pressable
            onPress={() => void handleSubmit()}
            accessibilityRole="button"
            accessibilityLabel="Submit photos"
            style={s.primaryBtn}
          >
            <Text style={s.primaryBtnText}>Submit photos</Text>
          </Pressable>
        )}

        {state === 'error' && (
          <Pressable
            onPress={() => void handleSubmit()}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={s.primaryBtn}
          >
            <Text style={s.primaryBtnText}>Try again</Text>
          </Pressable>
        )}

        {state === 'done' && (
          <Pressable
            onPress={goHome}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            style={s.primaryBtn}
          >
            <Text style={s.primaryBtnText}>Back to home</Text>
          </Pressable>
        )}
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
    minHeight: tokens.tap.minMobile,
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
  title: {
    fontSize: tokens.type.heading.size,
    fontWeight: '600',
    color: tokens.color.ink.primary,
    textAlign: 'center',
  },
  hint: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.secondary,
    textAlign: 'center',
  },
  statusText: {
    fontSize: tokens.type.subhead.size,
    fontWeight: '500',
    color: tokens.color.ink.primary,
    textAlign: 'center',
  },
  pollCount: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[4],
  },
  primaryBtn: {
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[4],
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: tokens.type.body.size,
    fontWeight: '600',
    color: tokens.color.surface.paper,
  },
});
