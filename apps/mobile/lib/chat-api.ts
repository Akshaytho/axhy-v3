/**
 * Typed wrappers for chat backend routes with retry-with-key on network failure.
 *
 * @derives(master-plan §G)
 */

import { apiFetch, ApiError } from './api';

export type DecisionCardData = {
  toolName?: string;
  toolCallId?: string;
  title?: string;
  description?: string;
  fields?: Record<string, unknown>;
  severity?: 'OK' | 'CONFIRM' | 'WARN' | 'BLOCKED';
  presets?: { chips?: Array<{ label: string; value: string }> };
} | null;

export type ChatMessageResponse = {
  chatMessageId: string;
  assistantText: string;
  decisionCard: DecisionCardData;
};

export type SendChatMessageInput = {
  text: string;
  voiceConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  idempotencyKey: string;
  /** For testing: shorten retry backoff. Default 2000. */
  retryDelayMs?: number;
};

/**
 * Send a chat message with retry-with-same-key on network failure.
 * 3 retries with exponential backoff. Same Idempotency-Key on every retry.
 */
export async function sendChatMessage(input: SendChatMessageInput): Promise<ChatMessageResponse> {
  const baseDelay = input.retryDelayMs ?? 2000;
  const maxRetries = 3;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiFetch<ChatMessageResponse>('/chat/messages', {
        method: 'POST',
        body: { text: input.text, voiceConfidence: input.voiceConfidence },
        headers: { 'Idempotency-Key': input.idempotencyKey },
      });
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        throw err;
      }
      if (attempt === maxRetries) break;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export type ApplyDecisionCardInput = {
  chatMessageId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
};

export async function applyDecisionCard(input: ApplyDecisionCardInput): Promise<unknown> {
  return apiFetch<unknown>('/chat/apply', {
    method: 'POST',
    body: {
      chatMessageId: input.chatMessageId,
      toolName: input.toolName,
      toolInput: input.toolInput,
    },
  });
}
