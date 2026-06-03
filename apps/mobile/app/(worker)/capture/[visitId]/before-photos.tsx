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
  const { visitId, preserved } = useLocalSearchParams<{ visitId: string; preserved?: string }>();
  const preservedSlotIndices = (preserved ?? '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return (
    <PhasePhotoCapture
      visitId={visitId ?? ''}
      phase="before"
      currentStep="before-photos"
      preservedSlotIndices={preservedSlotIndices}
      title="Step 2 of 8 — Before photos"
    />
  );
}
