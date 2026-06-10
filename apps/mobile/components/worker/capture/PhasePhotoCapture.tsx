/**
 * Shared photo-capture surface for the before/after phases.
 *
 * Uses the canon camera layout while keeping the real persistence/upload
 * behavior intact. Native persists into the worker partition; web renders the
 * same flow with simulated captures so QA can still walk the screen honestly.
 *
 * BUG-02: captures up to MAX_PHOTOS_PER_PHASE (8); the "Done →" CTA enables at
 * MIN_PHOTOS_PER_PHASE (3). BUG-03: "Done →" advances to the dedicated review
 * checkpoint (before-photos-review / after-photos-review). Clock-in is NOT
 * fired here — it moves to Before-Review's "Start cleaning →".
 *
 * @derives(docs/capture-submission_flow/02-before-photos-capture.md)
 * @derives(docs/capture-submission_flow/05-after-photos-capture.md)
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { File } from 'expo-file-system';
import { tokens } from '@axhy/ui-tokens';
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
import {
  MIN_PHOTOS_PER_PHASE,
  MAX_PHOTOS_PER_PHASE,
  beforePhaseAdvanceStep,
  nextOpenCaptureSlot,
} from '../../../lib/capture-flow';
import { consumeRetakePreservedSlots } from '../../../lib/capture-retake-state';

import { CameraView, type CapturedPhoto } from './CameraView';

type Props = {
  visitId: string;
  phase: PhotoPhase;
  currentStep: CaptureStep;
  preservedSlotIndices?: ReadonlyArray<number>;
  /** Step label shown in the badge above the body (e.g. "Step 2 of 8"). */
  title: string;
};

type CapturedSlot = {
  index: number;
  localUri: string;
};

/** Path of the next CAPTURE_STEPS entry after `current` (after-photos →
 *  after-photos-review). Falls back to home at the end. */
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
 *  surface, so the hook only mounts on native.
 *
 *  Guarded like timer.tsx:56-64 (walk 2026-06-10-2345 bug #4 hygiene): the
 *  bare useKeepAwake() hook has no error handling, so a failed activation
 *  becomes an unhandled promise rejection. Activation failure is harmless
 *  (screen may sleep) and must never throw. */
function KeepDeviceAwake(): null {
  useEffect(() => {
    let deactivate: (() => void) | undefined;
    let mounted = true;
    import('expo-keep-awake').then(({ activateKeepAwakeAsync, deactivateKeepAwake }) => {
      if (!mounted) return;
      const tag = 'phase-photo-capture';
      activateKeepAwakeAsync(tag).catch((e) => {
        console.warn('[capture] keep-awake denied', e);
      });
      deactivate = () => deactivateKeepAwake(tag);
    });
    return () => {
      mounted = false;
      deactivate?.();
    };
  }, []);
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
  const { data, isLoading, isError } = useWorkerTodayQuery();
  const [captured, setCaptured] = useState<CapturedSlot[]>([]);
  // CRIT-6: a failed capture must surface a quiet, recoverable error — never an
  // uncaught throw that crashes the camera and loses every photo.
  const [captureError, setCaptureError] = useState<string | null>(null);
  const workerId = data?.workerId ?? '';
  const siteName = findWorkerTodayVisit(data, visitId)?.siteName ?? 'Capture';
  const requiresWorkerProfile = canPersistCaptures();

  const visit = findWorkerTodayVisit(data, visitId);
  // Synchronous slot reservation. Two rapid shutter presses race against the
  // `await writePhoto` between reading and committing setCaptured; a ref-based
  // slot set prevents both presses from claiming the same missing slot.
  const reservedSlotsRef = useRef<Set<number>>(new Set());

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
      if (reservedSlotsRef.current.size >= MAX_PHOTOS_PER_PHASE) return;
      const slotIndex = nextOpenCaptureSlot([...reservedSlotsRef.current], MAX_PHOTOS_PER_PHASE);
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
        setCaptureError(null);
      } catch (err) {
        // CRIT-6: re-throwing here bubbled into CameraView's uncaught
        // `void handleShutter()` as an unhandled promise rejection and crashed
        // Android. Free just this slot (so the worker retakes one photo, not
        // all) and show a quiet inline error; the other slots stay intact.
        reservedSlotsRef.current.delete(slotIndex);
        setCaptureError("Couldn't save that photo — try again.");
        if (__DEV__) {
          console.warn(
            '[capture] write/enqueue failed',
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    },
    [phase, requiresWorkerProfile, visitId, workerId],
  );

  const goNext = useCallback(() => {
    // Both phases advance to their dedicated review checkpoint (BUG-03). Clock-in
    // (→IN_PROGRESS) is NOT fired here anymore — it moves to Before-Review's
    // "Start cleaning →" (contract 03). before-photos → before-photos-review;
    // after-photos → after-photos-review (the next CAPTURE_STEPS entry).
    const nextPath =
      phase === 'before'
        ? NAV_ROUTES.workerCaptureStep(visitId, beforePhaseAdvanceStep(visit?.state))
        : nextStepPath(visitId, currentStep);
    router.replace(nextPath);
  }, [currentStep, phase, visit?.state, visitId]);

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

  const completed = captured.length >= MIN_PHOTOS_PER_PHASE;
  const slotNumber = completed
    ? Math.min(captured.length + 1, MAX_PHOTOS_PER_PHASE)
    : (nextOpenCaptureSlot(
        captured.map((item) => item.index),
        MAX_PHOTOS_PER_PHASE,
      ) ?? MAX_PHOTOS_PER_PHASE);

  return (
    <View style={s.root}>
      {Platform.OS !== 'web' && <KeepDeviceAwake />}
      <CameraView
        mode={phase}
        siteName={siteName}
        photoCount={captured.length}
        minPhotos={MIN_PHOTOS_PER_PHASE}
        maxPhotos={MAX_PHOTOS_PER_PHASE}
        slotNumber={slotNumber}
        stepTitle={title}
        onBack={goBack}
        onCapture={onCapture}
        onReviewPress={completed ? goNext : undefined}
      />
      {captureError ? (
        <Pressable
          style={s.errorBanner}
          accessibilityRole="button"
          accessibilityLabel="Dismiss photo error"
          onPress={() => setCaptureError(null)}
        >
          <Text style={s.errorText}>{captureError}</Text>
          <Text style={s.errorHint}>Tap to dismiss</Text>
        </Pressable>
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
  errorHint: {
    color: 'rgba(253,250,243,0.7)',
    fontSize: 11,
    marginTop: 4,
  },
  statusText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },
});
