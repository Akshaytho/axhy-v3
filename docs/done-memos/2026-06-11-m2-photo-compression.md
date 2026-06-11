# Done memo — M2 capture photo compression

**Date:** 2026-06-11 10:05 IST · **Slice:** m2-capture-photo-compression

## What shipped

`apps/mobile/components/worker/capture/PhasePhotoCapture.tsx` — in `onCapture`, before `writePhoto`/`enqueue`, native captures with a long edge > 1600px are downscaled to a 1600px long edge JPEG at 0.7 via `expo-image-manipulator` (already a dependency, previously unused). Gated on `canPersistCaptures()` (web demo path untouched). Inner try/catch falls back to the **original** photo on any manipulation failure — a worker can never lose a photo to compression.

## Live device proof

Captured a before-photo on a freshly seeded visit (0067e4ee). Pulled the persisted file:

- `before-01.jpg` = **946 × 1600**, valid JPEG, 12.7 KB — the resize branch executed (portrait → `{height:1600}`).
- Capture pipeline intact: file persisted under `files/captures/{workerId}/{visitId}/` (ownership partition unchanged); zero capture/compression errors in logcat.

Evidence: `docs/walks/worker-screens/2026-06-10-2345/evidence/m2_compressed_946x1600.jpg`, `m2_capture_screen.png`.

## Verification

mobile tsc 0 · vitest 109/109 · live emulator capture (above).

## Known gaps

EXIF orientation via manipulateAsync default; no resumable upload (M3, separate); compression ratio not surfaced in UI.
