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
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { File } from 'expo-file-system';
import { tokens } from '@axhy/ui-tokens';
import type { PhotoPhase } from '@axhy/shared-schema';

import { useWorkerTodayQuery } from '../../../lib/queries/use-worker-today';
import { writePhoto, canPersistCaptures } from '../../../lib/storage/per-user-partition';
import { r2UploadQueue } from '../../../lib/r2-upload-queue';
import { CAPTURE_STEPS, NAV_ROUTES, type CaptureStep } from '../../../lib/api-routes';
import { findWorkerTodayVisit } from '../../../lib/worker-today-helpers';

import { CameraView, type CapturedPhoto } from './CameraView';

const PHOTOS_PER_PHASE = 3;

type Props = {
  visitId: string;
  phase: PhotoPhase;
  currentStep: CaptureStep;
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
  title,
}: Props): React.JSX.Element {
  const { data, isLoading, isError } = useWorkerTodayQuery();
  const [captured, setCaptured] = useState<CapturedSlot[]>([]);
  const workerId = data?.workerId ?? '';
  const siteName = findWorkerTodayVisit(data, visitId)?.siteName ?? 'Capture';
  const requiresWorkerProfile = canPersistCaptures();

  // Synchronous slot reservation. Two rapid shutter presses race against the
  // `await writePhoto` between reading and committing setCaptured; using a ref
  // (incremented atomically) prevents both presses from claiming the same slot.
  const reservedCountRef = useRef(0);

  useEffect(() => {
    setCaptured([]);
    reservedCountRef.current = 0;
  }, [visitId, phase]);

  const onCapture = useCallback(
    async (photo: CapturedPhoto) => {
      if (requiresWorkerProfile && !workerId) return;
      if (reservedCountRef.current >= PHOTOS_PER_PHASE) return;
      const slotIndex = ++reservedCountRef.current;

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

        setCaptured((prev) => [...prev, { index: slotIndex, localUri }]);
      } catch (err) {
        reservedCountRef.current = Math.max(0, reservedCountRef.current - 1);
        throw err;
      }
    },
    [phase, requiresWorkerProfile, visitId, workerId],
  );

  const goNext = useCallback(() => {
    router.replace(nextStepPath(visitId, currentStep));
  }, [visitId, currentStep]);

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

  return (
    <View style={s.root}>
      {Platform.OS !== 'web' && <KeepDeviceAwake />}
      <CameraView
        mode={phase}
        siteName={siteName}
        photoCount={captured.length}
        minPhotos={PHOTOS_PER_PHASE}
        slotNumber={Math.min(captured.length + 1, PHOTOS_PER_PHASE)}
        totalSlots={PHOTOS_PER_PHASE}
        stepTitle={title}
        onBack={goBack}
        onCapture={onCapture}
        onReviewPress={completed ? goNext : undefined}
      />
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
  statusText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },
});
