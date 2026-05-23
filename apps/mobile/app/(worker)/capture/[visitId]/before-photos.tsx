/**
 * Capture step 2 — Before photos.
 *
 * Renders the shared PhasePhotoCapture surface scoped to phase='before'.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { useLocalSearchParams } from 'expo-router';

import { PhasePhotoCapture } from '../../../../components/worker/capture/PhasePhotoCapture';

/** @derives(master-plan §G) */
export default function BeforePhotosStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  return (
    <PhasePhotoCapture
      visitId={visitId ?? ''}
      phase="before"
      currentStep="before-photos"
      title="Step 2 of 6 — Before photos"
    />
  );
}
