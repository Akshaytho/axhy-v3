/**
 * Capture step 1 — QR scan (placeholder).
 *
 * Real implementation: worker scans the site QR sticker at arrival, which
 * (a) confirms physical presence and (b) attaches the site fingerprint
 * to the visit's photo bundle for AI verification. Camera + scan logic
 * lands in 2b-2.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 */

import { useLocalSearchParams } from 'expo-router';

import { CaptureStepShell } from '../../../../components/worker/capture/CaptureStepShell';

/** @derives(master-plan §G) */
export default function QrScanStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  return (
    <CaptureStepShell
      visitId={visitId ?? ''}
      step="qr-scan"
      title="Scan the site QR"
      body="When you arrive, scan the QR sticker at the site entrance to confirm you're at the right place. The camera flow lands in the next slice."
    />
  );
}
