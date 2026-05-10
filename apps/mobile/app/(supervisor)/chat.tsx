/**
 * Supervisor chat tab — Wave 4a MVP.
 * Voice (via iOS dictation) → POST /chat/messages → DecisionCard → tap Apply → Assignment row.
 *
 * @derives(master-plan §G)
 */

import { useCallback, useState } from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '@axhy/ui-tokens';
import type { MeOutput } from '@axhy/shared-schema';

import { MessageBubble } from '../../components/MessageBubble';
import { ChatInput } from '../../components/ChatInput';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonBubble } from '../../components/SkeletonBubble';
import { sendChatMessage, type DecisionCardData } from '../../lib/chat-api';
import { generateIdempotencyKey } from '../../lib/idempotency-key';
import { apiFetch } from '../../lib/api';

type LocalMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  chatMessageId?: string;
  decisionCard?: DecisionCardData;
  /** Wave 4a-PRO Task 16 — batch DecisionCards from compound utterance. */
  decisionCards?: NonNullable<DecisionCardData>[] | null;
  status?: 'pending' | 'sent' | 'failed';
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull supervisor name from /me for the EmptyState greeting.
  // Cached by react-query — same data Profile tab uses, so on tab-switch
  // there's no extra request.
  const { data: me } = useQuery<MeOutput>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeOutput>('/me'),
    staleTime: 5 * 60_000,
  });
  const supervisorFirstName = me?.user.name?.trim().split(/\s+/)[0] ?? '';

  const onSend = useCallback(async (text: string) => {
    const userId = generateIdempotencyKey();
    const idempotencyKey = generateIdempotencyKey();

    setMessages((prev) => [...prev, { id: userId, role: 'user', text, status: 'pending' }]);
    setThinking(true);
    setError(null);

    try {
      const res = await sendChatMessage({ text, idempotencyKey });

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
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setThinking(false);
    }
  }, []);

  const onCardCancelled = useCallback((messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, decisionCard: null } : m)));
  }, []);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {messages.length === 0 && !thinking ? (
        <EmptyState supervisorName={supervisorFirstName} />
      ) : (
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
              decisionCards={item.decisionCards}
              status={item.status}
              onCardCancelled={() => onCardCancelled(item.id)}
            />
          )}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            thinking ? (
              <View style={s.thinking}>
                <SkeletonBubble />
              </View>
            ) : null
          }
        />
      )}
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
    backgroundColor: tokens.color.surface.paper,
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
    color: tokens.color.ink.tertiary,
    fontSize: tokens.type.caption.size,
  },
  errorBanner: {
    padding: 10,
    backgroundColor: tokens.color.semantic.badSoft,
    borderTopWidth: 1,
    borderColor: tokens.color.semantic.bad,
  },
  errorText: {
    color: tokens.color.semantic.bad,
    fontSize: 13,
  },
});
