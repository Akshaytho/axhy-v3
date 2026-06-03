/**
 * Capture step 6 — After Photos Review (contract 06).
 *
 * The quality checkpoint before the combined final review. "Continue to final
 * review" navigates forward; clock-out (→ PHOTOS_PENDING) stays at the Timer's
 * "Done" so cleaning duration stays accurate and resume is deterministic
 * (documented deviation from the contract's after-phase=IN_PROGRESS model).
 *
 * @derives(docs/capture-submission_flow/06-after-photos-review.md)
 */

import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { PhaseReview } from '../../../../components/worker/capture/PhaseReview';
import { NAV_ROUTES } from '../../../../lib/api-routes';

/** @derives(master-plan §G) */
export default function AfterPhotosReviewStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const vid = visitId ?? '';

  const continueToFinal = useCallback(() => {
    router.replace(NAV_ROUTES.workerCaptureStep(vid, 'review'));
  }, [vid]);

  return (
    <PhaseReview
      visitId={vid}
      phase="after"
      headerTitle="After review"
      captureStep="after-photos"
      primaryLabel="Continue to final review"
      onPrimary={continueToFinal}
    />
  );
}
