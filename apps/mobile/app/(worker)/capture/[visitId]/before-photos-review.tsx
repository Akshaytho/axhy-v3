/**
 * Capture step 3 — Before Photos Review (contract 03).
 *
 * The quality checkpoint before cleaning starts. Its primary action
 * "Start cleaning" is the clock-in point (visit → IN_PROGRESS), relocated here
 * from before-photos "Done" so the CTA does exactly what it says. Keeps the
 * existing ACTIVE_TIMER_EXISTS one-active-timer guard.
 *
 * @derives(docs/capture-submission_flow/03-before-photos-review.md)
 */

import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { PhaseReview } from '../../../../components/worker/capture/PhaseReview';
import { NAV_ROUTES } from '../../../../lib/api-routes';
import { postWorkerClockIn } from '../../../../lib/api-lifecycle';
import { ApiError } from '../../../../lib/api';

/** @derives(master-plan §G) */
export default function BeforePhotosReviewStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const vid = visitId ?? '';
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCleaning = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Worker-owned lifecycle: "Start cleaning" clocks in (→ IN_PROGRESS) and
    // BLOCKS forward navigation until the server confirms. Only on success do we
    // open the timer, so the worker can never reach the timer on a stale state.
    postWorkerClockIn(vid)
      .then(async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['worker-today'] }),
          queryClient.invalidateQueries({ queryKey: ['worker-visit', vid] }),
        ]);
        router.replace(NAV_ROUTES.workerCaptureStep(vid, 'timer'));
      })
      .catch((err) => {
        // Rule A — another visit is already timing. Refresh the cache (Home will
        // surface that active visit) and keep the worker here with a plain note.
        if (err instanceof ApiError && err.code === 'ACTIVE_TIMER_EXISTS') {
          void queryClient.invalidateQueries({ queryKey: ['worker-today'] });
          setError('You already have a visit in progress. Finish it before starting this one.');
          setBusy(false);
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not start cleaning yet.');
        setBusy(false);
      });
  }, [busy, queryClient, vid]);

  return (
    <PhaseReview
      visitId={vid}
      phase="before"
      headerTitle="Before review"
      captureStep="before-photos"
      primaryLabel="Start cleaning"
      onPrimary={startCleaning}
      primaryBusy={busy}
      primaryError={error}
    />
  );
}
