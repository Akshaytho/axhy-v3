/**
 * Shared 3-photo capture surface for the before/after phases.
 *
 * Uses the canon camera layout while keeping the real persistence/upload
 * behavior intact. Native persists into the worker partition; web renders the
 * same flow with simulated captures so QA can still walk the screen honestly.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { File } from 'expo-file-system';
import { tokens } from '@axhy/ui-tokens';
import { useQueryClient } from '@tanstack/react-query';
import type { PhotoPhase } from '@axhy/shared-schema';

import { useWorkerTodayQuery } from '../../../lib/queries/use-worker-today';
import {
  writePhoto,
  canPersistCaptures,
  listPhotos,
} from '../../../lib/storage/per-user-partition';
import { r2UploadQueue } from '../../../lib/r2-upload-queue';
import { CAPTURE_STEPS, NAV_ROUTES, type CaptureStep } from '../../../lib/api-routes';
import { findWorkerTodayVisit } from '../../../lib/worker-today-helpers';
import { postWorkerClockIn } from '../../../lib/api-lifecycle';
import { ApiError } from '../../../lib/api';
import { beforePhaseAdvanceStep, nextOpenCaptureSlot } from '../../../lib/capture-flow';
import { consumeRetakePreservedSlots } from '../../../lib/capture-retake-state';

import { CameraView, type CapturedPhoto } from './CameraView';

const PHOTOS_PER_PHASE = 3;

type Props = {
  visitId: string;
  phase: PhotoPhase;
  currentStep: CaptureStep;
  preservedSlotIndices?: ReadonlyArray<number>;
  /** Step label shown in the badge above the body (e.g. "Step 2 of 6"). */
  title: string;
};

type CapturedSlot = {
  index: number;
  localUri: string;
};

/** Compute the next step path from the current step. */
function nextStepPath(visitId: string, current: CaptureStep): string {
  const idx = CAPTURE_STEPS.indexOf(current);
  const next = CAPTURE_STEPS[idx + 1];
  if (!next) return NAV_ROUTES.workerHome;
  return NAV_ROUTES.workerCaptureStep(visitId, next);
}

/** Expo's Wake Lock API throws "permission denied" on browsers that gate
 *  navigator.wakeLock behind a user gesture (Playwright headless Chromium,
 *  some Safari modes), pushing a fullscreen dev-error overlay that intercepts
 *  pointer events. Web has no genuine screen-sleep concern for the capture
 *  surface, so the hook only mounts on native. */
function KeepDeviceAwake(): null {
  useKeepAwake();
  return null;
}

/** @derives(master-plan §G) */
export function PhasePhotoCapture({
  visitId,
  phase,
  currentStep,
  preservedSlotIndices = [],
  title,
}: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useWorkerTodayQuery();
  const [captured, setCaptured] = useState<CapturedSlot[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const workerId = data?.workerId ?? '';
  const siteName = findWorkerTodayVisit(data, visitId)?.siteName ?? 'Capture';
  const requiresWorkerProfile = canPersistCaptures();

  const visit = findWorkerTodayVisit(data, visitId);
  // Synchronous slot reservation. Two rapid shutter presses race against the
  // `await writePhoto` between reading and committing setCaptured; a ref-based
  // slot set prevents both presses from claiming the same missing slot.
  const reservedSlotsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setTransitioning(false);
    setTransitionError(null);
  }, [visitId, phase]);

  const hydrateCaptured = useCallback(
    async (preservedSeed: ReadonlyArray<number> = preservedSlotIndices): Promise<void> => {
      let existing: CapturedSlot[] = preservedSeed.map((index) => ({
        index,
        localUri: `preserved://${phase}/${index}`,
      }));

      if (canPersistCaptures()) {
        if (!workerId) {
          reservedSlotsRef.current = new Set();
          setCaptured([]);
          return;
        }

        const stored = await listPhotos(workerId, visitId, phase);
        existing = stored
          .map((localUri) => {
            const match = localUri.match(new RegExp(`${phase}-(\\d+)\\.`));
            if (!match) return null;
            return { index: Number(match[1]), localUri };
          })
          .filter((slot): slot is CapturedSlot => slot !== null)
          .sort((a, b) => a.index - b.index);
      } else {
        existing = Array.from(r2UploadQueue.snapshot().values())
          .filter((item) => item.visitId === visitId && item.phase === phase)
          .map((item) => ({ index: item.index, localUri: item.localUri }))
          .sort((a, b) => a.index - b.index);
      }

      if (preservedSeed.length > 0) {
        for (const preservedIndex of preservedSeed) {
          if (!existing.some((slot) => slot.index === preservedIndex)) {
            existing.push({
              index: preservedIndex,
              localUri: `preserved://${phase}/${preservedIndex}`,
            });
          }
        }
        existing.sort((a, b) => a.index - b.index);
      }
      reservedSlotsRef.current = new Set(existing.map((slot) => slot.index));
      setCaptured(existing);
    },
    [phase, preservedSlotIndices, visitId, workerId],
  );

  useEffect(() => {
    void hydrateCaptured();
    const unsubscribe = r2UploadQueue.onChange(() => {
      void hydrateCaptured();
    });

    return () => {
      unsubscribe();
    };
  }, [hydrateCaptured]);

  useFocusEffect(
    useCallback(() => {
      const preservedFromRetake = consumeRetakePreservedSlots(visitId, phase);
      if (preservedFromRetake.length > 0) {
        void hydrateCaptured(preservedFromRetake);
      }
    }, [hydrateCaptured, phase, visitId]),
  );

  const onCapture = useCallback(
    async (photo: CapturedPhoto) => {
      if (requiresWorkerProfile && !workerId) return;
      if (reservedSlotsRef.current.size >= PHOTOS_PER_PHASE) return;
      const slotIndex = nextOpenCaptureSlot([...reservedSlotsRef.current], PHOTOS_PER_PHASE);
      if (!slotIndex) return;
      reservedSlotsRef.current.add(slotIndex);

      try {
        const localUri = canPersistCaptures()
          ? await writePhoto(workerId, visitId, phase, slotIndex, photo.uri)
          : photo.uri;

        // Server-side hint for rate-limiting + observability. Read actual size
        // when we own the file on disk; fall back to a sane default for the
        // web stub (external URL — can't be stat'd).
        const fileSize = canPersistCaptures() ? Math.max(1, new File(localUri).size ?? 0) : 500_000;

        r2UploadQueue.enqueue({
          visitId,
          phase,
          index: slotIndex,
          localUri,
          contentType: 'image/jpeg',
          fileSize,
        });

        setCaptured((prev) =>
          [...prev.filter((item) => item.index !== slotIndex), { index: slotIndex, localUri }].sort(
            (a, b) => a.index - b.index,
          ),
        );
      } catch (err) {
        reservedSlotsRef.current.delete(slotIndex);
        throw err;
      }
    },
    [phase, requiresWorkerProfile, visitId, workerId],
  );

  const goNext = useCallback(() => {
    const nextPath =
      phase === 'before'
        ? NAV_ROUTES.workerCaptureStep(visitId, beforePhaseAdvanceStep(visit?.state))
        : nextStepPath(visitId, currentStep);
    if (phase !== 'before' || visit?.state === 'PHOTOS_PENDING') {
      router.replace(nextPath);
      return;
    }

    if (transitioning) return;
    setTransitioning(true);
    setTransitionError(null);

    postWorkerClockIn(visitId)
      .then(async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['worker-today'] }),
          queryClient.invalidateQueries({ queryKey: ['worker-visit', visitId] }),
        ]);
        router.replace(nextPath);
      })
      .catch((err) => {
        // Rule A — another visit is already in progress. Refresh the cache
        // (Home will surface that active visit as the hero card per the
        // deterministic priority) and bounce the worker back so they can
        // resume it before starting a second timer.
        if (err instanceof ApiError && err.code === 'ACTIVE_TIMER_EXISTS') {
          void queryClient.invalidateQueries({ queryKey: ['worker-today'] });
          setTransitionError(
            'You already have a visit in progress. Finish it before starting this one.',
          );
          setTransitioning(false);
          return;
        }
        const message = err instanceof Error ? err.message : 'Could not start cleaning yet.';
        setTransitionError(message);
        setTransitioning(false);
      });
  }, [currentStep, phase, queryClient, transitioning, visit?.state, visitId]);

  const goBack = useCallback(() => {
    const idx = CAPTURE_STEPS.indexOf(currentStep);
    const prev = CAPTURE_STEPS[idx - 1];
    if (prev) {
      router.replace(NAV_ROUTES.workerCaptureStep(visitId, prev));
    } else {
      router.replace(NAV_ROUTES.workerHome);
    }
  }, [visitId, currentStep]);

  if (requiresWorkerProfile && (isLoading || !data)) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={tokens.color.brand.accent} />
        <Text style={s.statusText}>Loading…</Text>
      </View>
    );
  }

  if ((requiresWorkerProfile && (isError || !workerId)) || (!requiresWorkerProfile && isError)) {
    return (
      <View style={s.center}>
        <Text style={s.statusText}>Could not load worker profile. Please try again.</Text>
      </View>
    );
  }

  const completed = captured.length >= PHOTOS_PER_PHASE;
  const slotNumber = completed
    ? PHOTOS_PER_PHASE
    : (nextOpenCaptureSlot(
        captured.map((item) => item.index),
        PHOTOS_PER_PHASE,
      ) ?? PHOTOS_PER_PHASE);

  return (
    <View style={s.root}>
      {Platform.OS !== 'web' && <KeepDeviceAwake />}
      <CameraView
        mode={phase}
        siteName={siteName}
        photoCount={captured.length}
        minPhotos={PHOTOS_PER_PHASE}
        slotNumber={slotNumber}
        totalSlots={PHOTOS_PER_PHASE}
        stepTitle={title}
        onBack={goBack}
        onCapture={onCapture}
        onReviewPress={completed && !transitioning ? goNext : undefined}
      />
      {transitioning ? (
        <View style={s.overlay}>
          <ActivityIndicator color={tokens.color.brand.accent} />
          <Text style={s.overlayTitle}>Starting cleaning…</Text>
          <Text style={s.overlayBody}>Saving your visit start before the timer opens.</Text>
        </View>
      ) : null}
      {transitionError ? (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{transitionError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry starting cleaning"
            onPress={goNext}
            style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[3],
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[3],
    backgroundColor: 'rgba(26,22,18,0.78)',
    paddingHorizontal: tokens.space[6],
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.surface.card,
  },
  overlayBody: {
    fontSize: tokens.type.body.size,
    lineHeight: tokens.type.body.size * 1.45,
    color: 'rgba(253,250,243,0.86)',
    textAlign: 'center',
  },
  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(56,28,20,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(192,73,42,0.32)',
    padding: 14,
    gap: 10,
  },
  errorText: {
    color: tokens.color.surface.card,
    fontSize: 14,
    lineHeight: 20,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    minHeight: tokens.tap.minMobile,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: tokens.color.surface.card,
    fontSize: 14,
    fontWeight: '700',
  },
  statusText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },
});
