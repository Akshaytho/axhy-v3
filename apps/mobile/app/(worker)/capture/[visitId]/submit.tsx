/**
 * Capture step 6 — Submit (placeholder).
 *
 * Real implementation: fires the visit-complete write (transitions the
 * visit to AWAITING_VERIFICATION) and starts the AI-verify polling. Lives
 * in slice 2b-3 alongside the timer-stop + final upload-flush flow. For
 * now the Submit button label says so and forwarding lands back on
 * Worker Home.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 */

import { useLocalSearchParams } from 'expo-router';

import { CaptureStepShell } from '../../../../components/worker/capture/CaptureStepShell';

/** @derives(master-plan §G) */
export default function SubmitStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  return (
    <CaptureStepShell
      visitId={visitId ?? ''}
      step="submit"
      title="Submit your work"
      body="Send your photos and timer for AI verification. The submit write and verify polling land in slice 2b-3."
      nextLabel="Submit (coming in 2b-3)"
      nextDisabled
    />
  );
}
