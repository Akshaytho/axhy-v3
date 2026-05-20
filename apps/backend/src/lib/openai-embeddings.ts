/**
 * Thin OpenAI embeddings wrapper for axhy_chat turn embedding.
 *
 * Uses `modelFor('embed_general')` — never hardcodes a model name.
 * Returns a 1536-dimensional vector suitable for insertion into
 * `axhy_chat.turn_embeddings` as a pgvector literal.
 *
 * NOT the same as vector-knowledge.ts::embed() — that targets axhy_brain
 * (dev-time docs). This module targets axhy_chat (production chat turns).
 * Both use the same embed_general surface but are intentionally separate
 * files so schema concerns don't bleed across.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §11)
 * @derives(docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md §2.3)
 * @derives(ADR-0023) — modelFor pattern
 */

import pino from 'pino';
import { modelFor } from '@axhy/ai-tools';

const log = pino({ name: 'openai-embeddings' });

/** Expected dimensionality for embed_general (text-embedding-3-small). */
const EXPECTED_DIMENSIONS = 1536;

/** Timeout for the embeddings API call, in milliseconds. */
const EMBED_TIMEOUT_MS = 5_000;

/** Max chars of response body included in error messages for debugging. */
const ERROR_BODY_PREVIEW_CHARS = 200;

export class OpenAIEmbeddingError extends Error {
  readonly code = 'OPENAI_EMBEDDING_ERROR';
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'OpenAIEmbeddingError';
  }
}

export class OpenAIEmbeddingMissingKeyError extends Error {
  readonly code = 'OPENAI_EMBEDDING_MISSING_API_KEY';
  constructor() {
    super('OPENAI_API_KEY is not set. Embedding unavailable.');
    this.name = 'OpenAIEmbeddingMissingKeyError';
  }
}

export class OpenAIEmbeddingMalformedError extends Error {
  readonly code = 'OPENAI_EMBEDDING_MALFORMED_RESPONSE';
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIEmbeddingMalformedError';
  }
}

/**
 * Call the OpenAI embeddings endpoint and return a 1536-dim vector.
 *
 * Throws:
 *   - `OpenAIEmbeddingMissingKeyError` if `OPENAI_API_KEY` is absent.
 *   - `OpenAIEmbeddingError` (with `statusCode`) on non-2xx HTTP response.
 *   - `OpenAIEmbeddingMalformedError` if `data[0].embedding` is missing or
 *     has the wrong dimensionality.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIEmbeddingMissingKeyError();
  }

  const policy = modelFor('embed_general');

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: policy.model, input: text, dimensions: EXPECTED_DIMENSIONS }),
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  });

  if (!res.ok) {
    const bodyPreview = (await res.text()).slice(0, ERROR_BODY_PREVIEW_CHARS);
    log.warn({ statusCode: res.status, bodyPreview }, 'OpenAI embeddings API returned non-2xx');
    throw new OpenAIEmbeddingError(
      `OpenAI embeddings returned HTTP ${res.status}: ${bodyPreview}`,
      res.status,
    );
  }

  const payload = (await res.json()) as unknown;

  // Narrow: validate shape before trusting
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('data' in payload) ||
    !Array.isArray((payload as Record<string, unknown>).data) ||
    (payload as { data: unknown[] }).data.length === 0
  ) {
    throw new OpenAIEmbeddingMalformedError('OpenAI embeddings response missing data array.');
  }

  const first = (payload as { data: unknown[] }).data[0];
  if (
    typeof first !== 'object' ||
    first === null ||
    !('embedding' in first) ||
    !Array.isArray((first as Record<string, unknown>).embedding)
  ) {
    throw new OpenAIEmbeddingMalformedError(
      'OpenAI embeddings response missing data[0].embedding.',
    );
  }

  const embedding = (first as { embedding: number[] }).embedding;

  if (embedding.length !== EXPECTED_DIMENSIONS) {
    throw new OpenAIEmbeddingMalformedError(
      `Expected ${EXPECTED_DIMENSIONS}-dim embedding, got ${embedding.length}.`,
    );
  }

  return embedding;
}
