/**
 * Supervisor chat tab — R6 voice-first capture surface.
 *
 * R6 reference: `docs/prototypes/supervisor-mobile-r6/project/src/chat.jsx`
 * Screenshot reference: `apps/mobile/screenshots-r6-reference/r6-chat.png`
 *
 * Layout:
 *   TopAppBar (subtitle "VOICE · MESSY INPUT" + title "Chat")
 *   GreetingCard (avatar + Namaste + sites/workers counts)
 *   FlatList of message pairs
 *     ContextSeparator (shown once at the top of the message list)
 *     ChatBubble (user — dark ink bg, right-aligned)
 *       VoiceWaveformPill inside user bubble when voice metadata present
 *       TranscriptionMeta below user bubble when voice metadata present
 *     ChatBubble (assistant — card bg, left-aligned)
 *       DecisionLinkPill below assistant bubble when decisions were extracted
 *   Capture footer: text input + terracotta mic circle
 *
 * Dimming: the most-recent user+assistant pair renders at full opacity;
 * every older pair renders at opacity 0.55 via `dimmed` prop on ChatBubble.
 *
 * Empty state: GreetingCard + "Try saying:" phrase list; no bubbles.
 *
 * Backend wiring preserved:
 *   - `sendChatMessage` → POST /chat/messages with Idempotency-Key
 *   - AI response may carry `decisionCard` or `decisionCards`; count drives DecisionLinkPill
 *   - Daily budget cap handled with distinct goldenrod banner
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useCallback, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { MeOutput } from '@axhy/shared-schema';

import { TopAppBar } from '../../components/today/TopAppBar';
import { SkeletonBubble } from '../../components/SkeletonBubble';
import { GreetingCard } from '../../components/chat/GreetingCard';
import { ContextSeparator } from '../../components/chat/ContextSeparator';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { VoiceWaveformPill } from '../../components/chat/VoiceWaveformPill';
import { TranscriptionMeta } from '../../components/chat/TranscriptionMeta';
import { DecisionLinkPill } from '../../components/chat/DecisionLinkPill';
import { sendChatMessage, type DecisionCardData } from '../../lib/chat-api';
import { generateIdempotencyKey } from '../../lib/idempotency-key';
import { apiFetch, isAIBudgetExceededError } from '../../lib/api';
import { useSupervisorContextQuery } from '../../lib/queries/use-supervisor-context';

/** Example phrases shown in the empty state. */
const EXAMPLE_PHRASES = [
  '"Mark Suresh absent today"',
  '"Add Ravi to Hospital A Mon–Sat 9–5"',
  '"Pradeep sick for 3 days"',
] as const;

type LocalMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  chatMessageId?: string;
  decisionCard?: DecisionCardData;
  /** Batch DecisionCards from compound utterance. */
  decisionCards?: NonNullable<DecisionCardData>[] | null;
  status?: 'pending' | 'sent' | 'failed';
};

/**
 * Derive the total decision count for a message so we can render
 * the DecisionLinkPill with the right number.
 */
function decisionCount(msg: LocalMessage): number {
  if (msg.decisionCards && msg.decisionCards.length > 0) return msg.decisionCards.length;
  if (msg.decisionCard) return 1;
  return 0;
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export default function ChatScreen() {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Spec 2 §9.4 — daily AI budget cap reached. Distinct from generic
   * `error` because the UX is different (goldenrod banner, no retry,
   * input disabled until UTC midnight).
   */
  const [budgetCapped, setBudgetCapped] = useState(false);

  const textInputRef = useRef<TextInput>(null);

  // Pull supervisor data from /me — cached by react-query, same as Profile tab.
  const { data: me } = useQuery<MeOutput>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeOutput>('/me'),
    staleTime: 5 * 60_000,
  });

  const supervisorFirstName = me?.user.name?.trim().split(/\s+/)[0] ?? 'there';

  // Supervisor portfolio counts — fetched from GET /supervisor/context.
  // Falls back to { sitesActive: 0, workersActive: 0 } while loading or on error.
  const { data: context } = useSupervisorContextQuery();
  const { sitesActive, workersActive } = context ?? { sitesActive: 0, workersActive: 0 };

  const onSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || budgetCapped) return;

      const userId = generateIdempotencyKey();
      const idempotencyKey = generateIdempotencyKey();

      setMessages((prev) => [
        ...prev,
        { id: userId, role: 'user', text: trimmed, status: 'pending' },
      ]);
      setThinking(true);
      setError(null);

      try {
        const res = await sendChatMessage({ text: trimmed, idempotencyKey });

        setMessages((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, status: 'sent' as const } : m)),
        );

        setMessages((prev) => [
          ...prev,
          {
            id: generateIdempotencyKey(),
            role: 'assistant',
            text: res.assistantText || '(no response)',
            chatMessageId: res.chatMessageId,
            decisionCard: res.decisionCard,
            decisionCards: res.decisionCards,
          },
        ]);
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, status: 'failed' as const } : m)),
        );
        if (isAIBudgetExceededError(err)) {
          setBudgetCapped(true);
          setError(
            'Daily AI usage limit reached. Try again tomorrow or contact your administrator.',
          );
        } else {
          setError(err instanceof Error ? err.message : 'Send failed');
        }
      } finally {
        setThinking(false);
      }
    },
    [budgetCapped],
  );

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || thinking || budgetCapped) return;
    setDraft('');
    void onSend(trimmed);
  }, [draft, thinking, budgetCapped, onSend]);

  const handleMicPress = useCallback(() => {
    // Native voice capture is a follow-up slice; for now focus the text input.
    textInputRef.current?.focus();
  }, []);

  const handleDecisionPillPress = useCallback(() => {
    router.push('/(supervisor)/decisions');
  }, []);

  // Determine the index of the last assistant message to identify the most-recent pair.
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.role === 'assistant') return i;
    }
    return -1;
  })();

  const lastUserIdx = (() => {
    // The "most recent pair" = the user message immediately before the last assistant.
    if (lastAssistantIdx <= 0) return -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.role === 'user') return i;
    }
    return -1;
  })();

  /**
   * Render a single message item. The FlatList is NOT inverted (we want
   * chronological top-to-bottom order with the most recent exchange at the bottom).
   */
  const renderItem = useCallback(
    ({ item, index }: { item: LocalMessage; index: number }) => {
      // A message is in the "most recent pair" if it is either:
      //   - the last assistant message, or
      //   - the user message immediately before the last assistant
      const isRecentPair = index === lastAssistantIdx || index === lastUserIdx;
      const dimmed = !isRecentPair && lastAssistantIdx !== -1;

      const isUser = item.role === 'user';
      const count = decisionCount(item);

      return (
        <View>
          <ChatBubble role={item.role} text={item.text} dimmed={dimmed} status={item.status} />
          {/* VoiceWaveformPill + TranscriptionMeta: shown on the most-recent user bubble.
              Voice capture is a follow-up; we render the pill shape when user is in the
              most-recent pair and there is text (placeholder approach for now). */}
          {isUser && index === lastUserIdx && (
            <View style={[s.voiceMeta, dimmed && s.dimmed]}>
              <VoiceWaveformPill duration="0:00" listening={false} />
              <TranscriptionMeta confidence="HIGH" />
            </View>
          )}
          {/* DecisionLinkPill below AI response that produced decisions */}
          {!isUser && count > 0 && (
            <View style={[s.pillWrapper, dimmed && s.dimmed]}>
              <DecisionLinkPill count={count} onPress={handleDecisionPillPress} />
            </View>
          )}
        </View>
      );
    },
    [lastAssistantIdx, lastUserIdx, handleDecisionPillPress],
  );

  const isEmpty = messages.length === 0 && !thinking;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {/* TopAppBar */}
      <TopAppBar title="Chat" subtitle="VOICE · MESSY INPUT" />

      {/* GreetingCard — always shown, even in empty state */}
      <GreetingCard
        firstName={supervisorFirstName}
        siteCount={sitesActive}
        activeWorkerCount={workersActive}
      />

      {/* Message list or empty state */}
      {isEmpty ? (
        <View style={s.emptyArea}>
          <Text style={s.emptyTip}>Try saying:</Text>
          {EXAMPLE_PHRASES.map((phrase, i) => (
            <Text key={i} style={s.emptyPhrase}>
              {phrase}
            </Text>
          ))}
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ListHeaderComponent={<ContextSeparator />}
          ListFooterComponent={
            thinking ? (
              <View style={s.thinking}>
                <SkeletonBubble />
              </View>
            ) : null
          }
        />
      )}

      {/* Error / budget banner */}
      {error && (
        <View style={budgetCapped ? s.budgetBanner : s.errorBanner}>
          <Text style={budgetCapped ? s.budgetText : s.errorText}>
            {budgetCapped ? '⌚ ' : '⚠ '}
            {error}
          </Text>
        </View>
      )}

      {/* Capture footer */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={s.footer}>
          <TextInput
            ref={textInputRef}
            style={s.input}
            placeholder="Type or hold the mic to speak…"
            placeholderTextColor={tokens.color.ink.placeholder}
            value={draft}
            onChangeText={setDraft}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!thinking && !budgetCapped}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voice capture"
            onPress={handleMicPress}
            style={({ pressed }) => [s.micBtn, pressed && s.micBtnPressed]}
          >
            <Feather name="mic" size={22} color={tokens.color.surface.card} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  list: {
    paddingHorizontal: tokens.space[3],
    paddingBottom: tokens.space[4],
  },
  emptyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[6],
    gap: tokens.space[2],
  },
  emptyTip: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[1],
  },
  emptyPhrase: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    lineHeight: tokens.type.body.size * 1.6,
  },
  thinking: {
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
  },
  voiceMeta: {
    alignItems: 'flex-end',
    marginTop: -tokens.space[2],
    marginBottom: tokens.space[2],
  },
  pillWrapper: {
    paddingHorizontal: 0,
    marginBottom: tokens.space[2],
  },
  dimmed: {
    opacity: 0.55,
  },
  // Error banners
  errorBanner: {
    padding: tokens.space[2] + 2,
    backgroundColor: tokens.color.semantic.badSoft,
    borderTopWidth: 1,
    borderColor: tokens.color.semantic.bad,
  },
  errorText: {
    color: tokens.color.semantic.bad,
    fontSize: 13,
  },
  // Spec 2 §9.4 — goldenrod "try tomorrow" banner.
  budgetBanner: {
    padding: tokens.space[2] + 2,
    backgroundColor: tokens.color.semantic.warnSoft,
    borderTopWidth: 1,
    borderColor: tokens.color.semantic.warn,
  },
  budgetText: {
    color: tokens.color.semantic.warn,
    fontSize: 13,
  },
  // Capture footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    paddingTop: tokens.space[2],
    paddingBottom: tokens.space[3],
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper,
  },
  input: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    borderRadius: tokens.radius.r4,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[2] + 2, // 10
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
    minHeight: 44,
  },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // iOS shadow
    shadowColor: tokens.color.brand.accent2,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  micBtnPressed: {
    opacity: 0.85,
  },
});
