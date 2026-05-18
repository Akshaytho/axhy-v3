/**
 * useVoiceRecorder — thin hook over expo-audio's AudioRecorder.
 *
 * Handles permission requests internally. Returns a stable `{ isRecording,
 * durationMs, start, stop }` interface so the chat screen stays free of
 * expo-audio import details.
 *
 * Permission denial: `stop()` returns null if permission was denied during
 * `start()`. The caller is responsible for surfacing an error.
 *
 * Cleanup: the AudioRecorder is released on unmount via the `useAudioRecorder`
 * hook's built-in lifecycle management.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from 'expo-audio';

export type VoiceRecorderResult = {
  /** URI of the recorded audio file. */
  uri: string;
  /** Duration of the recording in milliseconds. */
  durationMs: number;
};

export type VoiceRecorderHook = {
  /** True while microphone is capturing audio. */
  isRecording: boolean;
  /** Elapsed recording time in milliseconds. Updates ~100ms. */
  durationMs: number;
  /** Request mic permission (if needed) and start recording. */
  start: () => Promise<void>;
  /**
   * Stop recording and return the audio file URI + duration.
   * Returns null if permission was denied, no recording was started, or the
   * file could not be obtained.
   */
  stop: () => Promise<VoiceRecorderResult | null>;
};

/**
 * Hook that wraps expo-audio for voice capture in the Chat tab.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export function useVoiceRecorder(): VoiceRecorderHook {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);

  // Track whether permission was denied so stop() can return null early.
  const permissionDeniedRef = useRef(false);

  // Capture the start-time ms so we can compute durationMs on stop().
  const startTimeRef = useRef<number | null>(null);

  // Expose durationMs from recorderState so it updates live while recording.
  const durationMs = recorderState.durationMillis;
  const isRecording = recorderState.isRecording;

  const start = useCallback(async (): Promise<void> => {
    permissionDeniedRef.current = false;

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      permissionDeniedRef.current = true;
      return;
    }

    await recorder.prepareToRecordAsync();
    startTimeRef.current = Date.now();
    recorder.record();
  }, [recorder]);

  const stop = useCallback(async (): Promise<VoiceRecorderResult | null> => {
    if (permissionDeniedRef.current) return null;
    if (!recorderState.isRecording) return null;

    const capturedDurationMs = recorderState.durationMillis;
    await recorder.stop();

    const uri = recorder.uri;
    if (!uri) return null;

    return { uri, durationMs: capturedDurationMs };
  }, [recorder, recorderState]);

  // Safety: stop the recorder if the component unmounts while recording.
  // useAudioRecorder handles the SharedObject release; we just need to
  // ensure we don't leave an active capture open.
  //
  // Guarded with try/catch because under fast-refresh / route-unmount the
  // native shared object can be released BEFORE this cleanup runs, in
  // which case `recorder.isRecording` throws
  // `NativeSharedObjectNotFoundException` from ExpoModulesCore. That
  // crash bubbles up as a perpetual-loading screen for the supervisor
  // because the chat tab is part of the (supervisor) tabs layout — see
  // `feedback_play_store_quality_no_lag_no_jank.md` for the no-crashes-
  // on-cleanup rule.
  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) {
          void recorder.stop();
        }
      } catch {
        // Native object already torn down — nothing to clean up.
      }
    };
  }, [recorder]);

  return { isRecording, durationMs, start, stop };
}
