/**
 * transcribeAudio — POST an audio file to /chat/transcribe and return the
 * transcribed text with a coarse confidence level.
 *
 * Uses a raw `fetch` with an Authorization header (not `apiFetch`) because
 * the body is multipart/form-data, not JSON. The Authorization token is read
 * from the same auth-store that `apiFetch` uses.
 *
 * On native, the audio file is read from its local URI via `fetch(uri)` and
 * then sent as a Blob. On web (Playwright) the same path works because the
 * URI is an `ObjectURL` or a `file:` URL.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { Platform } from 'react-native';

import { getTokens } from '../auth-store';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

export type TranscribeResult = {
  text: string;
  confidence: 'high' | 'medium' | 'low';
};

/**
 * Per-word timestamp returned by Whisper's `verbose_json` shape with
 * `timestamp_granularities=['word']`. The shimmer animation replays the
 * transcript at the actual cadence the supervisor spoke.
 */
export type TranscribeWord = {
  readonly word: string;
  /** Seconds from the start of the recording. */
  readonly start: number;
  readonly end: number;
};

/**
 * Streaming-shape transcription result. Includes word-level timestamps so
 * the mobile shimmer overlay can reveal tokens one-by-one at the recorded
 * cadence. When the backend deployment lacks word timestamps (older Whisper
 * tier), `words` is `[]` and the caller falls back to a constant-rate
 * shimmer over the final text.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C — live transcript shimmer)
 */
export type TranscribeStreamResult = {
  readonly text: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly languageDetected: string | null;
  readonly words: ReadonlyArray<TranscribeWord>;
  readonly durationSeconds: number | null;
};

/**
 * Upload an audio file to the backend transcription proxy and return the
 * transcript with a coarse confidence level.
 *
 * @param uri    - Local file URI returned by `useVoiceRecorder().stop()`.
 * @param language - Optional BCP-47 language hint forwarded to Whisper.
 *                   Pass `'en'`, `'hi'`, or `'te'`.
 *
 * @throws Error with a human-readable message on network or server failure.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export async function transcribeAudio(
  uri: string,
  language?: 'en' | 'hi' | 'te',
): Promise<TranscribeResult> {
  const tokens = await getTokens();
  if (!tokens) {
    throw new Error('Not authenticated');
  }

  // On native, fetch the file into a Blob via its local URI.
  // On web (ObjectURL / blob URL), the same works natively.
  let audioBlob: Blob;
  if (Platform.OS === 'web') {
    const fileRes = await fetch(uri);
    audioBlob = await fileRes.blob();
  } else {
    // React Native's global `fetch` can resolve file:// URIs and return a
    // response whose `.blob()` gives us the binary content.
    const fileRes = await fetch(uri);
    audioBlob = await fileRes.blob();
  }

  // Infer a reasonable filename from the URI extension or fall back to .m4a.
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
  const filename = `recording.${ext}`;

  const formData = new FormData();
  // React Native's FormData accepts { uri, type, name } objects directly.
  // On web, use the Blob.
  if (Platform.OS !== 'web') {
    (formData as FormData).append('audio', {
      uri,
      type: `audio/${ext}`,
      name: filename,
      // React Native FormData typing expects this cast; it works at runtime.
    } as unknown as Blob);
  } else {
    formData.append('audio', audioBlob, filename);
  }

  const url = `${API_BASE}/chat/transcribe${language ? `?language=${language}` : ''}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      // Do NOT set Content-Type — fetch sets multipart/form-data with the
      // correct boundary automatically when the body is FormData.
    },
    body: formData,
  });

  if (!res.ok) {
    let msg = `Transcription failed (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.message) msg = body.message;
      else if (body.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as { text: string; confidence: 'high' | 'medium' | 'low' };
  return { text: data.text, confidence: data.confidence };
}

/**
 * Build a multipart/form-data FormData for an audio upload. Extracted so
 * `transcribeAudio` and `transcribeAudioStream` share the exact same
 * filename / mimetype heuristics.
 */
async function buildAudioFormData(uri: string): Promise<FormData> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
  const filename = `recording.${ext}`;
  const formData = new FormData();

  if (Platform.OS !== 'web') {
    (formData as FormData).append('audio', {
      uri,
      type: `audio/${ext}`,
      name: filename,
    } as unknown as Blob);
  } else {
    const fileRes = await fetch(uri);
    const audioBlob = await fileRes.blob();
    formData.append('audio', audioBlob, filename);
  }
  return formData;
}

/**
 * Stream-shape transcription. Hits `POST /chat/transcribe-stream` (Wave 3
 * backend) which returns the final transcript PLUS word-level timestamps.
 * The mobile shimmer overlay uses `words[]` to reveal tokens at the actual
 * cadence the supervisor spoke; this is faithful to reality, not a
 * synthesised animation.
 *
 * Why this is a separate function (not a flag on `transcribeAudio`):
 *   - Different response shape (`words[]`, `durationSeconds`).
 *   - Different network cost — word-timestamp Whisper is marginally heavier;
 *     the chat surface uses streaming only when the shimmer overlay is
 *     mounted. Non-shimmer code paths (e.g. future bulk transcribe) keep
 *     the lighter endpoint.
 *
 * Error handling: same envelope as `transcribeAudio` — throws `Error` with
 * the backend-supplied `message` field on 4xx/5xx.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C — live transcript shimmer)
 */
export async function transcribeAudioStream(
  uri: string,
  language?: 'en' | 'hi' | 'te',
): Promise<TranscribeStreamResult> {
  const tokens = await getTokens();
  if (!tokens) {
    throw new Error('Not authenticated');
  }

  const formData = await buildAudioFormData(uri);
  const url = `${API_BASE}/chat/transcribe-stream${language ? `?language=${language}` : ''}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    let msg = `Transcription failed (HTTP ${res.status})`;
    try {
      const errBody = (await res.json()) as { error?: string; message?: string };
      if (errBody.message) msg = errBody.message;
      else if (errBody.error) msg = errBody.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as {
    text?: string;
    confidence?: 'high' | 'medium' | 'low';
    languageDetected?: string | null;
    words?: Array<{ word: string; start: number; end: number }>;
    durationSeconds?: number | null;
  };

  return {
    text: data.text ?? '',
    confidence: data.confidence ?? 'medium',
    languageDetected: data.languageDetected ?? null,
    words: Array.isArray(data.words) ? data.words : [],
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : null,
  };
}
