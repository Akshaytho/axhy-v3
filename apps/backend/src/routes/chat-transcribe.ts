/**
 * POST /chat/transcribe — proxy audio to OpenAI Whisper and return transcript.
 *
 * Accepts multipart/form-data with a single `audio` field (m4a / mp3 / wav / webm).
 * Optional `?language=en|hi|te` query param is forwarded to Whisper's `language` field.
 *
 * Returns `{ text, confidence, languageDetected }`.
 *
 * Confidence heuristic (Whisper does not return a confidence score; this is
 * a coarse approximation based on response shape):
 *   - `high`   — response is >5 words AND language hint was provided AND the
 *                detected language matches the hint.
 *   - `medium` — text exists but either no hint was given or the detected
 *                language does not match the hint.
 *   - `low`    — Whisper returned an empty or whitespace-only string.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';

import { requireAuth } from '../middleware/tenant-context.js';

/** Whisper REST response shape (only `text` is guaranteed; `language` is a
 *  non-standard extension on some wrapper APIs). */
type WhisperResponse = {
  text: string;
  /** Some Whisper deployments return detected language. Axhy ignores it unless present. */
  language?: string;
};

type TranscribeResponse = {
  text: string;
  confidence: 'high' | 'medium' | 'low';
  languageDetected: string | null;
};

/** Supported language hint values — must match Whisper's BCP-47 codes. */
const SUPPORTED_LANGUAGES = new Set(['en', 'hi', 'te'] as const);
type LanguageHint = 'en' | 'hi' | 'te';

/**
 * Derive a coarse confidence level from Whisper's output.
 *
 * Heuristic only — Whisper v1 does not expose per-utterance confidence scores.
 * This approximation gives the mobile UI a signal to show (e.g. amber badge)
 * without surfacing raw probabilities that are meaningless to supervisors.
 */
function deriveConfidence(
  text: string,
  languageHint: LanguageHint | null,
  detectedLanguage: string | null,
): 'high' | 'medium' | 'low' {
  const trimmed = text.trim();
  if (!trimmed) return 'low';

  const wordCount = trimmed.split(/\s+/).length;
  const hasHint = languageHint !== null;
  const hintMatches =
    hasHint && detectedLanguage != null && detectedLanguage.startsWith(languageHint);

  if (wordCount > 5 && hintMatches) return 'high';
  return 'medium';
}

export async function registerChatTranscribeRoutes(app: FastifyInstance): Promise<void> {
  // Register multipart plugin scoped to this route registration context.
  // fileSize capped at 10 MB — Whisper supports up to 25 MB but we impose a
  // conservative limit to protect backend memory on Railway's shared instances.
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
      files: 1,
    },
  });

  app.post('/chat/transcribe', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      reply.code(500).send({
        error: 'AI_NOT_CONFIGURED',
        message: 'OPENAI_API_KEY missing — set it in apps/backend/.env.local',
      });
      return;
    }

    // Parse optional language query param.
    const rawLang = (req.query as Record<string, string>)['language'];
    const languageHint: LanguageHint | null = SUPPORTED_LANGUAGES.has(rawLang as LanguageHint)
      ? (rawLang as LanguageHint)
      : null;

    // Read the single `audio` multipart field.
    let audioPart: import('@fastify/multipart').MultipartFile | undefined;
    try {
      audioPart = await req.file();
    } catch {
      reply
        .code(400)
        .send({ error: 'MULTIPART_PARSE_ERROR', message: 'Could not parse multipart body' });
      return;
    }

    if (!audioPart) {
      reply
        .code(400)
        .send({ error: 'AUDIO_REQUIRED', message: 'Multipart field `audio` is required' });
      return;
    }

    if (audioPart.fieldname !== 'audio') {
      reply
        .code(400)
        .send({ error: 'WRONG_FIELD', message: 'Expected multipart field named `audio`' });
      return;
    }

    let audioBuffer: Buffer;
    try {
      audioBuffer = await audioPart.toBuffer();
    } catch {
      reply.code(400).send({ error: 'READ_ERROR', message: 'Could not read audio stream' });
      return;
    }

    if (audioBuffer.length === 0) {
      reply.code(400).send({ error: 'EMPTY_AUDIO', message: 'Audio file is empty' });
      return;
    }

    // Build multipart/form-data to forward to OpenAI Whisper.
    // We construct it manually with fetch's FormData (available in Node 18+)
    // to avoid adding another npm dependency.
    const filename =
      audioPart.filename || `recording.${audioPart.mimetype?.split('/')[1] ?? 'm4a'}`;
    const formData = new FormData();
    formData.append('model', 'whisper-1');
    formData.append(
      'file',
      new Blob([audioBuffer], { type: audioPart.mimetype || 'audio/m4a' }),
      filename,
    );
    if (languageHint) {
      formData.append('language', languageHint);
    }
    // Ask Whisper for verbose_json so we can potentially read back detected language.
    formData.append('response_format', 'verbose_json');

    let whisperRes: Response;
    try {
      whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error reaching OpenAI';
      reply.code(502).send({ error: 'OPENAI_UNREACHABLE', message: msg });
      return;
    }

    if (!whisperRes.ok) {
      let errMsg = `Whisper returned HTTP ${whisperRes.status}`;
      try {
        const errBody = (await whisperRes.json()) as { error?: { message?: string } };
        if (errBody?.error?.message) errMsg = errBody.error.message;
      } catch {
        // ignore parse failure
      }
      reply.code(502).send({ error: 'WHISPER_ERROR', message: errMsg });
      return;
    }

    let whisperData: WhisperResponse;
    try {
      whisperData = (await whisperRes.json()) as WhisperResponse;
    } catch {
      reply
        .code(502)
        .send({ error: 'WHISPER_PARSE_ERROR', message: 'Could not parse Whisper response' });
      return;
    }

    const text = (whisperData.text ?? '').trim();
    const detectedLanguage = whisperData.language ?? null;
    const confidence = deriveConfidence(text, languageHint, detectedLanguage);

    const response: TranscribeResponse = {
      text,
      confidence,
      languageDetected: detectedLanguage,
    };

    reply.code(200).send(response);
  });
}
