/**
 * Capture step 5 — Review (placeholder).
 *
 * Real implementation: thumbnail grid of before + after photos with
 * retake-per-photo affordances and a final "looks good" check before
 * Submit. Lands in slice 2b-2.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 */

import { useLocalSearchParams } from 'expo-router';

import { CaptureStepShell } from '../../../../components/worker/capture/CaptureStepShell';

/** @derives(master-plan §G) */
export default function ReviewStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  return (
    <CaptureStepShell
      visitId={visitId ?? ''}
      step="review"
      title="Review your photos"
      body="Check your before and after photos look right. You can retake any photo before you submit. The review grid lands in slice 2b-2."
    />
  );
}
