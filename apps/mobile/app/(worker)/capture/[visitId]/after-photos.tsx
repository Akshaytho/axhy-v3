/**
 * Capture step 4 — After photos (placeholder).
 *
 * Real implementation: 3 mandatory after-photos via the camera, stored
 * under the per-user partition and uploaded incrementally to R2. Camera
 * pipeline + R2 upload land in 2b-2.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 */

import { useLocalSearchParams } from 'expo-router';

import { CaptureStepShell } from '../../../../components/worker/capture/CaptureStepShell';

/** @derives(master-plan §G) */
export default function AfterPhotosStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  return (
    <CaptureStepShell
      visitId={visitId ?? ''}
      step="after-photos"
      title="After photos"
      body="Take 3 photos of the site after cleaning. The camera flow lands in slice 2b-2."
    />
  );
}
