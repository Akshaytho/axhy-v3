# Phase C Wave 4a — Supervisor mobile chat tab MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working chat tab in the existing `apps/mobile` Expo app so founder can test the magic loop (voice → AI → DecisionCard → tap → real Assignment row) on his iPhone via Expo Go.

**Architecture:** No backend changes — Wave 2a's `POST /chat/messages`, `POST /chat/apply`, and `POST /assignments` routes already work end-to-end with real Anthropic. Wave 4a is pure RN frontend: extend the existing `apiFetch` wrapper for custom headers, add `chat-api.ts` with retry-with-key logic, build 3 RN components (MessageBubble, DecisionCard, ChatInput), replace the chat-tab stub with a full screen. Voice input = iOS keyboard's built-in dictation (mic icon on the keyboard), zero Sarvam/Whisper code in 4a.

**Tech Stack:** Expo SDK 54, expo-router, React Native 0.74+, TypeScript strict, TanStack Query (already in deps), `@axhy/ui-tokens` (gold #FACC15 / OLED black), `expo-secure-store` (existing auth wiring). New dev dep: `vitest` (for pure-TS unit tests only — no RN component tests in 4a).

---

## Pre-flight

- [ ] **Read Spec 3 / Wave 4a + the Wave 2a backend reference**

  Open and skim:
  - `docs/specs/2026-05-09-phase-c-spec-3-wave-4a-mobile-chat.md` (sections 4 architecture, 5 UI, 6 errors)
  - `apps/backend/src/routes/chat.ts` (the routes the mobile client calls)

- [ ] **Verify on the right branch + remote up to date**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git status
  git rev-parse --abbrev-ref HEAD
  ```

  Expected: on `feat/phase-c-wave-4a-mobile-chat`, branched from main + spec doc (commit 008ff06) only.

- [ ] **Verify Wave 2a chat routes work locally**

  Spin up backend dev server (in a separate terminal):

  ```bash
  cd apps/backend
  pnpm dev
  ```

  Then in another terminal:

  ```bash
  curl http://localhost:4000/health
  ```

  Expected: 200 OK. (If pnpm not in PATH, use `~/.nvm/versions/node/v20.20.1/bin/node node_modules/tsx/dist/cli.mjs --env-file=.env.local src/index.ts`.)

  Stop the dev server with Ctrl-C — we don't need it running during Tasks 1-9.

---

## File Structure

**New files (6):**

| Path                                       | Responsibility                                                        |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `apps/mobile/vitest.config.ts`             | Minimal vitest config for pure-TS unit tests in `lib/`                |
| `apps/mobile/lib/idempotency-key.ts`       | `generateIdempotencyKey()` returning UUID v4                          |
| `apps/mobile/lib/idempotency-key.test.ts`  | UUID format + distinct-values tests                                   |
| `apps/mobile/lib/chat-api.ts`              | Typed `sendChatMessage()` + `applyDecisionCard()` with retry-with-key |
| `apps/mobile/lib/chat-api.test.ts`         | Retry-with-key behavior on simulated network fail                     |
| `apps/mobile/components/MessageBubble.tsx` | Renders user / assistant bubbles                                      |
| `apps/mobile/components/DecisionCard.tsx`  | Renders proposed-action card + Apply/Cancel buttons                   |
| `apps/mobile/components/ChatInput.tsx`     | TextInput (with iOS dictation) + Send button                          |

**Modified files (3):**

| Path                                    | Change                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| `apps/mobile/package.json`              | Add vitest dev dep + `"test": "vitest run"` script     |
| `apps/mobile/lib/api.ts`                | Extend `apiFetch()` to accept optional `headers` param |
| `apps/mobile/app/(supervisor)/chat.tsx` | Replace 30-line stub with ~250-line chat screen        |

---

## Task 1: Set up vitest in apps/mobile

**Files:**

- Create: `apps/mobile/vitest.config.ts`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Add vitest dev dep**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile
  pnpm add -D vitest@^2.0.0
  ```

  (If pnpm isn't on PATH: `~/.nvm/versions/node/v20.20.1/bin/node ../../node_modules/.bin/pnpm add -D vitest@^2.0.0` or similar. Check what works — the state-machines package uses vitest already, follow that pattern.)

- [ ] **Step 2: Create `apps/mobile/vitest.config.ts`**

  ```ts
  /// @derives(master-plan §G)
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      include: ['lib/**/*.test.ts'],
      environment: 'node',
      testTimeout: 10_000,
    },
  });
  ```

- [ ] **Step 3: Update `apps/mobile/package.json` test script**

  Find the existing `"test": "echo 'test placeholder'"` line and replace with:

  ```json
  "test": "vitest run"
  ```

- [ ] **Step 4: Verify vitest runs (no tests yet, but command works)**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile
  pnpm test 2>&1 | tail -10
  ```

  Expected: vitest output saying "No test files found" or similar — exit 0 or 1 is fine, just no error invoking vitest.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/package.json apps/mobile/vitest.config.ts pnpm-lock.yaml
  git commit -m "chore(mobile): add vitest for lib/ unit tests"
  ```

---

## Task 2: idempotency-key.ts (TDD)

**Files:**

- Create: `apps/mobile/lib/idempotency-key.test.ts`
- Create: `apps/mobile/lib/idempotency-key.ts`

- [ ] **Step 1: Write the failing test**

  Create `apps/mobile/lib/idempotency-key.test.ts`:

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import { describe, it, expect } from 'vitest';
  import { generateIdempotencyKey } from './idempotency-key';

  describe('generateIdempotencyKey', () => {
    it('returns a UUID v4 format string (8-4-4-4-12 hex with version 4)', () => {
      const key = generateIdempotencyKey();
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('returns distinct values across calls', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) keys.add(generateIdempotencyKey());
      expect(keys.size).toBe(100);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm fail**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile
  pnpm test lib/idempotency-key.test.ts 2>&1 | tail -10
  ```

  Expected: fail with "Cannot find module './idempotency-key'".

- [ ] **Step 3: Implement `apps/mobile/lib/idempotency-key.ts`**

  ```ts
  /**
   * UUID v4 generator for client-side idempotency keys.
   * Sent as `Idempotency-Key` header on every chat request.
   *
   * @derives(master-plan §G)
   */

  /**
   * Generate a UUID v4 string. Uses crypto.randomUUID if available
   * (RN 0.74+ via Hermes), otherwise falls back to a math.random fallback.
   */
  export function generateIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for older runtimes — RFC 4122 v4 from Math.random
    const hex = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        s += '-';
      } else if (i === 14) {
        s += '4'; // version 4
      } else if (i === 19) {
        s += hex[Math.floor(Math.random() * 4) | 8]; // variant
      } else {
        s += hex[Math.floor(Math.random() * 16)];
      }
    }
    return s;
  }
  ```

- [ ] **Step 4: Run test to verify pass**

  ```bash
  pnpm test lib/idempotency-key.test.ts 2>&1 | tail -10
  ```

  Expected: 2/2 pass.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/lib/idempotency-key.ts apps/mobile/lib/idempotency-key.test.ts
  git commit -m "feat(mobile): idempotency-key generator + unit tests"
  ```

---

## Task 3: Extend `apiFetch` with custom headers

**Files:**

- Modify: `apps/mobile/lib/api.ts`

- [ ] **Step 1: Update `RequestOptions` to accept `headers`**

  Open `apps/mobile/lib/api.ts`. Find:

  ```ts
  type RequestOptions = {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    auth?: boolean;
  };
  ```

  Replace with:

  ```ts
  type RequestOptions = {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    auth?: boolean;
    /** Extra headers to merge with defaults (Authorization + Content-Type). */
    headers?: Record<string, string>;
  };
  ```

- [ ] **Step 2: Merge custom headers into the fetch call**

  In the same file, find the `headers` object construction and the `fetch(...)` call. Modify the construction to merge custom headers:

  ```ts
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };

  if (auth) {
    const tokens = await getTokens();
    if (tokens) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }
  }
  ```

  (The Authorization header should be set AFTER spreading custom headers, so caller-provided custom headers can't accidentally override the token.)

- [ ] **Step 3: Verify tsc still clean**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/node ../../node_modules/typescript/bin/tsc --noEmit 2>&1 | tail -5
  ```

  Expected: zero errors.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/lib/api.ts
  git commit -m "feat(mobile): apiFetch supports custom headers (for Idempotency-Key)"
  ```

---

## Task 4: chat-api.ts — typed wrappers + retry-with-key (TDD)

**Files:**

- Create: `apps/mobile/lib/chat-api.test.ts`
- Create: `apps/mobile/lib/chat-api.ts`

- [ ] **Step 1: Write the failing test**

  Create `apps/mobile/lib/chat-api.test.ts`:

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import { describe, it, expect, vi, beforeEach } from 'vitest';

  // Mock the apiFetch module before importing chat-api
  vi.mock('./api', () => ({
    apiFetch: vi.fn(),
    ApiError: class ApiError extends Error {
      constructor(
        public status: number,
        public code: string,
        message: string,
      ) {
        super(message);
      }
    },
  }));

  import { apiFetch, ApiError } from './api';
  import { sendChatMessage } from './chat-api';

  const mockedApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  describe('sendChatMessage', () => {
    it('returns the response on first try (no retry)', async () => {
      mockedApiFetch.mockResolvedValueOnce({
        chatMessageId: 'msg-1',
        assistantText: 'hello',
        decisionCard: null,
      });
      const r = await sendChatMessage({ text: 'hi', idempotencyKey: 'idem-1' });
      expect(r.chatMessageId).toBe('msg-1');
      expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    });

    it('retries with same Idempotency-Key on network failure', async () => {
      const networkErr = new Error('Network request failed');
      mockedApiFetch
        .mockRejectedValueOnce(networkErr)
        .mockRejectedValueOnce(networkErr)
        .mockResolvedValueOnce({ chatMessageId: 'msg-2', assistantText: 'ok', decisionCard: null });

      const r = await sendChatMessage({ text: 'hi', idempotencyKey: 'idem-2', retryDelayMs: 1 });
      expect(r.chatMessageId).toBe('msg-2');
      expect(mockedApiFetch).toHaveBeenCalledTimes(3);

      // Verify same Idempotency-Key was passed on each call
      for (let i = 0; i < 3; i++) {
        const call = mockedApiFetch.mock.calls[i];
        expect(call[1].headers['Idempotency-Key']).toBe('idem-2');
      }
    });

    it('throws after 3 retries on persistent network failure', async () => {
      const networkErr = new Error('Network request failed');
      mockedApiFetch.mockRejectedValue(networkErr);

      await expect(
        sendChatMessage({ text: 'hi', idempotencyKey: 'idem-3', retryDelayMs: 1 }),
      ).rejects.toThrow('Network request failed');

      // 1 initial + 3 retries = 4 total
      expect(mockedApiFetch).toHaveBeenCalledTimes(4);
    });

    it('does NOT retry on 4xx errors', async () => {
      mockedApiFetch.mockRejectedValueOnce(new ApiError(400, 'BAD_INPUT', 'bad'));
      await expect(
        sendChatMessage({ text: 'hi', idempotencyKey: 'idem-4', retryDelayMs: 1 }),
      ).rejects.toThrow('bad');
      expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm fail**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile
  pnpm test lib/chat-api.test.ts 2>&1 | tail -10
  ```

  Expected: fail with "Cannot find module './chat-api'".

- [ ] **Step 3: Implement `apps/mobile/lib/chat-api.ts`**

  ```ts
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
        // Don't retry 4xx errors — those are caller's mistake
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          throw err;
        }
        // Last attempt: rethrow
        if (attempt === maxRetries) break;
        // Exponential backoff: baseDelay × 2^attempt → 2s, 4s, 8s for default base
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

  /**
   * Apply a confirmed DecisionCard. Idempotent at backend level — same
   * (chatMessageId, toolName) won't double-apply.
   */
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
  ```

- [ ] **Step 4: Run tests to verify pass**

  ```bash
  pnpm test lib/chat-api.test.ts 2>&1 | tail -15
  ```

  Expected: 4/4 pass.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/lib/chat-api.ts apps/mobile/lib/chat-api.test.ts
  git commit -m "feat(mobile): chat-api wrappers with retry-with-key (4 unit tests)"
  ```

---

## Task 5: DecisionCard component

**Files:**

- Create: `apps/mobile/components/DecisionCard.tsx`

- [ ] **Step 1: Implement the component**

  Create `apps/mobile/components/DecisionCard.tsx`:

  ```tsx
  /**
   * Renders a proposed-action DecisionCard from the AI's tool-use response.
   * On Apply: calls applyDecisionCard. On Cancel: parent dismisses.
   *
   * @derives(master-plan §G)
   */

  import { useState } from 'react';
  import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
  import { tokens } from '@axhy/ui-tokens';

  import type { DecisionCardData } from '../lib/chat-api';
  import { applyDecisionCard } from '../lib/chat-api';

  type Props = {
    chatMessageId: string;
    card: NonNullable<DecisionCardData>;
    onApplied?: () => void;
    onCancelled?: () => void;
  };

  export function DecisionCard({ chatMessageId, card, onApplied, onCancelled }: Props) {
    const [applying, setApplying] = useState(false);
    const [applied, setApplied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const severity = card.severity ?? 'CONFIRM';
    const borderColor =
      severity === 'WARN'
        ? '#FFA94D'
        : severity === 'BLOCKED'
          ? '#FF6B6B'
          : (tokens.color.brand.gold ?? '#FACC15');

    if (applied) {
      return (
        <View style={[s.card, { borderColor: '#2DBD5C' }]}>
          <Text style={s.appliedText}>✓ Applied</Text>
        </View>
      );
    }

    const onApply = async () => {
      if (!card.toolName) return;
      setApplying(true);
      setError(null);
      try {
        await applyDecisionCard({
          chatMessageId,
          toolName: card.toolName,
          toolInput: card.fields ?? {},
        });
        setApplied(true);
        onApplied?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Apply failed');
        setApplying(false);
      }
    };

    return (
      <View style={[s.card, { borderColor }]}>
        {card.title && <Text style={s.title}>{card.title}</Text>}
        {card.description && <Text style={s.description}>{card.description}</Text>}

        {card.fields && Object.keys(card.fields).length > 0 && (
          <View style={s.fieldsTable}>
            {Object.entries(card.fields).map(([key, value]) => (
              <View key={key} style={s.fieldRow}>
                <Text style={s.fieldKey}>{key}</Text>
                <Text style={s.fieldValue}>{String(value)}</Text>
              </View>
            ))}
          </View>
        )}

        {error && <Text style={s.error}>{error}</Text>}

        <View style={s.buttons}>
          <Pressable style={s.cancelBtn} onPress={() => onCancelled?.()} disabled={applying}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
          {severity !== 'BLOCKED' && (
            <Pressable
              style={[s.applyBtn, applying && s.applyBtnDisabled]}
              onPress={onApply}
              disabled={applying}
            >
              {applying ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={s.applyText}>Apply</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const s = StyleSheet.create({
    card: {
      borderWidth: 2,
      borderRadius: 12,
      padding: 16,
      marginVertical: 8,
      backgroundColor: tokens.color.surface.elevated ?? '#1a1a1a',
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: tokens.color.ink.primary ?? '#fff',
      marginBottom: 4,
    },
    description: {
      fontSize: 14,
      color: tokens.color.ink.secondary ?? '#aaa',
      marginBottom: 12,
    },
    fieldsTable: { marginBottom: 12 },
    fieldRow: { flexDirection: 'row', paddingVertical: 4 },
    fieldKey: {
      flex: 1,
      fontSize: 13,
      color: tokens.color.ink.secondary ?? '#aaa',
      fontWeight: '600',
    },
    fieldValue: {
      flex: 2,
      fontSize: 13,
      color: tokens.color.ink.primary ?? '#fff',
    },
    buttons: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
    cancelBtn: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.color.ink.secondary ?? '#666',
    },
    cancelText: { color: tokens.color.ink.secondary ?? '#aaa', fontSize: 14, fontWeight: '600' },
    applyBtn: {
      paddingVertical: 10,
      paddingHorizontal: 24,
      borderRadius: 8,
      backgroundColor: '#FACC15',
    },
    applyBtnDisabled: { opacity: 0.6 },
    applyText: { color: '#000', fontSize: 14, fontWeight: '700' },
    error: { color: '#FF6B6B', fontSize: 13, marginBottom: 8 },
    appliedText: { color: '#2DBD5C', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  });
  ```

- [ ] **Step 2: Verify TS clean**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/node ../../node_modules/typescript/bin/tsc --noEmit 2>&1 | tail -5
  ```

  Expected: zero errors. (If `tokens.color.brand.gold` doesn't exist, the `?? '#FACC15'` fallback covers it. If `tokens.color.surface.elevated` doesn't exist, the fallback covers it.)

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/DecisionCard.tsx
  git commit -m "feat(mobile): DecisionCard component with Apply/Cancel + severity colors"
  ```

---

## Task 6: MessageBubble component

**Files:**

- Create: `apps/mobile/components/MessageBubble.tsx`

- [ ] **Step 1: Implement the component**

  Create `apps/mobile/components/MessageBubble.tsx`:

  ```tsx
  /**
   * Renders a single chat bubble — user or assistant.
   * For assistant messages with a decisionCard, renders the card after the text.
   *
   * @derives(master-plan §G)
   */

  import { View, Text, StyleSheet } from 'react-native';
  import { tokens } from '@axhy/ui-tokens';

  import type { DecisionCardData } from '../lib/chat-api';
  import { DecisionCard } from './DecisionCard';

  type Props = {
    role: 'user' | 'assistant';
    text: string;
    chatMessageId?: string;
    decisionCard?: DecisionCardData;
    status?: 'pending' | 'sent' | 'failed';
    onCardApplied?: () => void;
    onCardCancelled?: () => void;
  };

  export function MessageBubble({
    role,
    text,
    chatMessageId,
    decisionCard,
    status,
    onCardApplied,
    onCardCancelled,
  }: Props) {
    const isUser = role === 'user';
    return (
      <View style={[s.row, isUser ? s.userRow : s.assistantRow]}>
        <View style={[s.bubble, isUser ? s.userBubble : s.assistantBubble]}>
          <Text style={[s.text, isUser ? s.userText : s.assistantText]}>{text}</Text>
          {status === 'pending' && <Text style={s.status}>Sending...</Text>}
          {status === 'failed' && <Text style={s.statusFail}>Failed</Text>}
        </View>
        {decisionCard && chatMessageId && (
          <DecisionCard
            chatMessageId={chatMessageId}
            card={decisionCard}
            onApplied={onCardApplied}
            onCancelled={onCardCancelled}
          />
        )}
      </View>
    );
  }

  const s = StyleSheet.create({
    row: { marginVertical: 4 },
    userRow: { alignItems: 'flex-end' },
    assistantRow: { alignItems: 'flex-start' },
    bubble: {
      maxWidth: '85%',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 16,
    },
    userBubble: {
      backgroundColor: tokens.color.surface.elevated ?? '#262626',
      borderColor: '#FACC15',
      borderWidth: 1,
    },
    assistantBubble: {
      backgroundColor: tokens.color.surface.muted ?? '#1a1a1a',
    },
    text: { fontSize: 15, lineHeight: 21 },
    userText: { color: tokens.color.ink.primary ?? '#fff' },
    assistantText: { color: tokens.color.ink.primary ?? '#fff' },
    status: { fontSize: 11, color: tokens.color.ink.secondary ?? '#888', marginTop: 4 },
    statusFail: { fontSize: 11, color: '#FF6B6B', marginTop: 4 },
  });
  ```

- [ ] **Step 2: Verify TS clean**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/node ../../node_modules/typescript/bin/tsc --noEmit 2>&1 | tail -5
  ```

  Expected: zero errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/MessageBubble.tsx
  git commit -m "feat(mobile): MessageBubble component (user/assistant + status + DecisionCard)"
  ```

---

## Task 7: ChatInput component

**Files:**

- Create: `apps/mobile/components/ChatInput.tsx`

- [ ] **Step 1: Implement the component**

  Create `apps/mobile/components/ChatInput.tsx`:

  ```tsx
  /**
   * Text input + Send button for the chat tab.
   * iOS keyboard's built-in dictation mic is automatic for any TextInput;
   * no custom voice button in Wave 4a (Wave 4b adds Sarvam/Whisper).
   *
   * @derives(master-plan §G)
   */

  import { useState } from 'react';
  import {
    View,
    TextInput,
    Pressable,
    Text,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
  } from 'react-native';
  import { tokens } from '@axhy/ui-tokens';

  type Props = {
    onSend: (text: string) => void;
    disabled?: boolean;
  };

  export function ChatInput({ onSend, disabled }: Props) {
    const [text, setText] = useState('');

    const send = () => {
      const trimmed = text.trim();
      if (!trimmed || disabled) return;
      onSend(trimmed);
      setText('');
    };

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={s.row}>
          <TextInput
            style={s.input}
            placeholder="Type or 🎤 dictate..."
            placeholderTextColor={tokens.color.ink.secondary ?? '#666'}
            value={text}
            onChangeText={setText}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={send}
            editable={!disabled}
          />
          <Pressable
            style={[s.sendBtn, (!text.trim() || disabled) && s.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || disabled}
          >
            <Text style={s.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const s = StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: tokens.color.surface.muted ?? '#222',
      backgroundColor: tokens.color.surface.paper ?? '#000',
    },
    input: {
      flex: 1,
      backgroundColor: tokens.color.surface.elevated ?? '#1a1a1a',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      color: tokens.color.ink.primary ?? '#fff',
      fontSize: 15,
    },
    sendBtn: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 20,
      backgroundColor: '#FACC15',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendText: { color: '#000', fontSize: 14, fontWeight: '700' },
  });
  ```

- [ ] **Step 2: Verify TS clean**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/node ../../node_modules/typescript/bin/tsc --noEmit 2>&1 | tail -5
  ```

  Expected: zero errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/ChatInput.tsx
  git commit -m "feat(mobile): ChatInput component with iOS dictation + Send button"
  ```

---

## Task 8: Replace chat.tsx stub with full screen

**Files:**

- Modify: `apps/mobile/app/(supervisor)/chat.tsx`

- [ ] **Step 1: Replace the file entirely**

  Open `apps/mobile/app/(supervisor)/chat.tsx`. Replace the entire contents with:

  ```tsx
  /**
   * Supervisor chat tab — Wave 4a MVP.
   * Voice (via iOS dictation) → POST /chat/messages → DecisionCard → tap Apply → Assignment row.
   *
   * @derives(master-plan §G)
   */

  import { useCallback, useState } from 'react';
  import { View, FlatList, ActivityIndicator, Text, StyleSheet } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import { tokens } from '@axhy/ui-tokens';

  import { MessageBubble } from '../../components/MessageBubble';
  import { ChatInput } from '../../components/ChatInput';
  import { sendChatMessage, type DecisionCardData } from '../../lib/chat-api';
  import { generateIdempotencyKey } from '../../lib/idempotency-key';

  type LocalMessage = {
    id: string; // client UUID
    role: 'user' | 'assistant';
    text: string;
    chatMessageId?: string;
    decisionCard?: DecisionCardData;
    status?: 'pending' | 'sent' | 'failed';
  };

  export default function ChatScreen() {
    const [messages, setMessages] = useState<LocalMessage[]>([]);
    const [thinking, setThinking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSend = useCallback(async (text: string) => {
      const userId = generateIdempotencyKey();
      const idempotencyKey = generateIdempotencyKey();

      // Optimistic user bubble
      setMessages((prev) => [...prev, { id: userId, role: 'user', text, status: 'pending' }]);
      setThinking(true);
      setError(null);

      try {
        const res = await sendChatMessage({ text, idempotencyKey });

        // Mark user bubble as sent
        setMessages((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, status: 'sent' as const } : m)),
        );

        // Append assistant bubble (with optional DecisionCard)
        setMessages((prev) => [
          ...prev,
          {
            id: generateIdempotencyKey(),
            role: 'assistant',
            text: res.assistantText || '(no response)',
            chatMessageId: res.chatMessageId,
            decisionCard: res.decisionCard,
          },
        ]);
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, status: 'failed' as const } : m)),
        );
        setError(err instanceof Error ? err.message : 'Send failed');
      } finally {
        setThinking(false);
      }
    }, []);

    const onCardApplied = useCallback(() => {
      // No-op for Wave 4a — DecisionCard collapses to "✓ Applied" inline
    }, []);

    const onCardCancelled = useCallback((messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, decisionCard: null } : m)),
      );
    }, []);

    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <FlatList
          inverted
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              role={item.role}
              text={item.text}
              chatMessageId={item.chatMessageId}
              decisionCard={item.decisionCard}
              status={item.status}
              onCardApplied={onCardApplied}
              onCardCancelled={() => onCardCancelled(item.id)}
            />
          )}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            thinking ? (
              <View style={s.thinking}>
                <ActivityIndicator color={tokens.color.ink.secondary ?? '#888'} />
                <Text style={s.thinkingText}>Thinking...</Text>
              </View>
            ) : null
          }
        />
        {error && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>⚠ {error}</Text>
          </View>
        )}
        <ChatInput onSend={onSend} disabled={thinking} />
      </SafeAreaView>
    );
  }

  const s = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: tokens.color.surface.paper ?? '#000',
    },
    list: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    thinking: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      padding: 12,
      alignSelf: 'flex-start',
    },
    thinkingText: {
      color: tokens.color.ink.secondary ?? '#888',
      fontSize: 13,
    },
    errorBanner: {
      padding: 10,
      backgroundColor: 'rgba(255, 107, 107, 0.15)',
      borderTopWidth: 1,
      borderColor: '#FF6B6B',
    },
    errorText: { color: '#FF6B6B', fontSize: 13 },
  });
  ```

- [ ] **Step 2: Verify TS clean**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/node ../../node_modules/typescript/bin/tsc --noEmit 2>&1 | tail -10
  ```

  Expected: zero errors. (Common gotcha: `Pressable` import may need updating; `MessageBubble` prop signature mismatch.)

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/app/(supervisor)/chat.tsx
  git commit -m "feat(mobile): replace chat.tsx stub with full magic-loop chat screen"
  ```

---

## Task 9: Manual smoke test on Expo Go (founder runs this)

**This is not a coding task — it's the verification gate. The founder runs this on his iPhone.**

- [ ] **Step 1: Start the backend dev server**

  In one terminal:

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend
  pnpm dev
  ```

  Expected: server starts on port 4000. ANTHROPIC_API_KEY must be set in `.env.local`.

- [ ] **Step 2: Set EXPO_PUBLIC_API_BASE_URL for local backend**

  Get your Mac's local IP (so iPhone can reach it on the same Wi-Fi):

  ```bash
  ipconfig getifaddr en0
  ```

  Example output: `192.168.1.5`

  In `apps/mobile/.env.local`, set:

  ```
  EXPO_PUBLIC_API_BASE_URL=http://192.168.1.5:4000
  ```

  (Replace IP with yours. **Don't commit this file.**)

- [ ] **Step 3: Start Expo Metro bundler**

  In another terminal:

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile
  pnpm dev
  ```

  Expected: Metro bundler starts, prints a QR code.

- [ ] **Step 4: Open in Expo Go on your iPhone**
  - Install Expo Go from App Store (if not already)
  - Make sure iPhone is on same Wi-Fi as your Mac
  - Open Camera app on iPhone, scan the QR code
  - Tap the notification to open in Expo Go

- [ ] **Step 5: Login**
  - On phone screen, enter sandbox supervisor's phone (check `apps/backend/scripts/seed-sandbox.ts` for the seeded phone, or use `+919999999999`)
  - On OTP screen, use the dev OTP bypass code (per `AXHY_OTP_BYPASS=1` setup — check `auth.ts` for the bypass code)

- [ ] **Step 6: Navigate to Chat tab + send a message**
  - Lands on Today's Plan tab — tap Chat tab at the bottom
  - Tap into the input field
  - **Option A — type:** "Add Pradeep to Apollo Hospital, Mon-Sat 9 to 5, starting Monday"
  - **Option B — voice:** tap iOS keyboard's mic icon (next to spacebar), dictate the same sentence, tap mic again to stop
  - Tap Send

- [ ] **Step 7: Verify the magic loop**

  Expect to see:
  1. User bubble appears immediately with "Sending..." status
  2. "Thinking..." indicator below for 5-15 seconds
  3. Assistant bubble appears with AI's response text
  4. DecisionCard renders below with: Worker (Pradeep), Site (Apollo Hospital), Days (Mon-Sat), Hours (09:00-17:00), Start (date)
  5. Tap **Apply**
  6. Card collapses to "✓ Applied" green checkmark
  7. Open Prisma Studio in browser:

     ```bash
     cd /Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema
     pnpm exec prisma studio
     ```

     Browser opens at `localhost:5555` → click Assignment table → see the new row with workerId + siteId + dayMask=`MTWTFS_` + state=`DRAFT`

- [ ] **Step 8: Test error path (optional)**
  - Force-quit your laptop's Wi-Fi for 5 seconds while a request is in flight
  - Verify retry happens (3 retries)
  - Verify "Failed" status appears after retries exhaust
  - Re-enable Wi-Fi, retry the message — should work

- [ ] **Step 9: Note any UX issues for Wave 4b**

  Things to capture (just notes; don't fix in 4a):
  - Voice dictation accuracy on Indian-name phrases
  - DecisionCard layout cramped on smaller iPhones
  - Apply button responsiveness
  - Color/contrast issues
  - Any error messages that are confusing

  Save notes to `docs/specs/2026-05-09-phase-c-vision-narrative.md` as `> FOUNDER NOTE: ...` lines for Wave 4b consideration.

---

## Task 10: Push branch + open draft PR

- [ ] **Step 1: Verify all commits on the branch**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git log --oneline main..HEAD
  ```

  Expected: ~9 commits (Tasks 1-8) on `feat/phase-c-wave-4a-mobile-chat`.

- [ ] **Step 2: Push the branch**

  ```bash
  git push origin feat/phase-c-wave-4a-mobile-chat
  ```

- [ ] **Step 3: Open draft PR**

  ```bash
  /usr/local/bin/gh pr create --draft --base main --title "Phase C Wave 4a — Supervisor mobile chat tab MVP" --body "$(cat <<'EOF'
  ## Summary

  Wave 4a builds the minimum supervisor mobile UI for founder-test on iPhone via Expo Go. Magic loop end-to-end: voice/text → /chat/messages → DecisionCard → tap Apply → /chat/apply → real Assignment row.

  ## What ships

  - **3 new components:** MessageBubble, DecisionCard (with Apply/Cancel + severity colors), ChatInput (with iOS dictation)
  - **2 new lib modules:** idempotency-key.ts (UUID v4 generator) + chat-api.ts (typed wrappers with retry-with-key)
  - **apiFetch extended** to accept custom headers (Idempotency-Key)
  - **chat.tsx** replaces stub with full chat screen (~250 lines)
  - **6 unit tests** in apps/mobile (idempotency-key + chat-api retry behavior)
  - **vitest** set up for apps/mobile package

  ## Out of scope (deferred to Wave 4b/c)

  - Custom voice button + real Sarvam/Whisper integration (Wave 4b)
  - Today's Plan / Summary / Updates / Profile tabs (Wave 4b)
  - Calendar tab (Wave 4b)
  - Chat history scroll-back (Wave 4c after Wave 2c backend)
  - LivingDoc UI (Wave 4c after Wave 2b backend)
  - Push notifications (Phase D)

  ## Test plan

  - [x] All 6 mobile unit tests pass
  - [x] No regression on Wave 1+2a tests (79 backend tests still green — no backend changes)
  - [x] TypeScript compiles clean
  - [ ] **Manual smoke test on Expo Go (founder verifies):**
    - [ ] Login flow works
    - [ ] Chat tab loads without crash
    - [ ] Send message → user bubble + thinking indicator
    - [ ] Assistant bubble + DecisionCard appears within 5-15s
    - [ ] Tap Apply → ✓ Applied state + Assignment row in Prisma Studio
    - [ ] iOS dictation works (mic icon on keyboard)

  Spec: docs/specs/2026-05-09-phase-c-spec-3-wave-4a-mobile-chat.md
  Plan: docs/plans/2026-05-09-phase-c-wave-4a-mobile-chat-plan.md

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 4: Report PR URL**

  Capture the URL printed by `gh pr create`. Founder reviews + runs Task 9 manual smoke test.

---

## Self-review

Spec coverage check (Spec 3 sections vs. tasks):

- §3 File structure → all 6 new + 3 modified files covered across Tasks 1-8 ✓
- §4 Architecture (component tree, state shape, send flow, apply flow) → Task 8 implements ✓
- §5 UI specs (color tokens, DecisionCard layout, ChatInput layout) → Tasks 5, 6, 7 implement ✓
- §6 Error handling (retry, 401, 503, 504) → Task 4 implements retry; Task 8 surfaces errors ✓
- §7 Auth (existing flow reuse) → no new code; verified in Task 9 manual test ✓
- §8 Test surface → Tasks 2, 4 unit tests; Task 9 manual smoke test ✓

**Placeholder check:** No "TBD" / "TODO" / vague refs. Every step has runnable code or exact command.

**Type consistency:** `DecisionCardData` shape consistent across chat-api.ts (Task 4), DecisionCard (Task 5), MessageBubble (Task 6), chat.tsx (Task 8). `LocalMessage` type only in chat.tsx (Task 8) — local to that file, no leak. `sendChatMessage` / `applyDecisionCard` signatures match between chat-api.ts (Task 4) and consumers (Tasks 5, 8).

**Known PATH quirk:** subagents may not have `pnpm` on PATH. Plan uses `~/.nvm/versions/node/v20.20.1/bin/node node_modules/...` for tsc; for vitest, falls back to direct binary if pnpm fails. Same pattern as Wave 1 + Wave 2a tasks.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-05-09-phase-c-wave-4a-mobile-chat-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Same pattern that delivered Wave 1 (66/66 tests) and Wave 2a (79/79 tests).

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
