/**
 * Renders a single chat bubble — user or assistant.
 * For assistant messages with a decisionCard, renders the card after the text.
 *
 * Uses the terracotta+paper token system (panel-locked 2026-05-07).
 * User bubbles use brand.accentSoft + accentInk text to signal authorship.
 * Assistant bubbles use surface.card (elevated, neutral) with ink.primary text.
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
        {status === 'pending' && <Text style={s.status}>Sending…</Text>}
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
  row: { marginVertical: tokens.space[1] },
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    paddingVertical: tokens.space[2] + 2, // 10
    paddingHorizontal: tokens.space[3] + 2, // 14
    borderRadius: tokens.radius.r4,
  },
  /** User bubble: soft terracotta tint — authorship signal without full-accent weight */
  userBubble: {
    backgroundColor: tokens.color.brand.accentSoft,
    borderWidth: 1,
    borderColor: tokens.color.brand.accent,
  },
  /** Assistant bubble: elevated card surface — calm, readable, distinct from canvas */
  assistantBubble: {
    backgroundColor: tokens.color.surface.card,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
  },
  text: {
    fontSize: tokens.type.body.size,
    lineHeight: tokens.type.body.size * tokens.type.body.lineHeight,
  },
  userText: {
    color: tokens.color.brand.accentInk,
  },
  assistantText: {
    color: tokens.color.ink.primary,
  },
  status: {
    fontSize: tokens.type.caption.size,
    marginTop: tokens.space[1],
    color: tokens.color.ink.tertiary,
  },
  statusFail: {
    fontSize: tokens.type.caption.size,
    marginTop: tokens.space[1],
    color: tokens.color.semantic.bad,
  },
});
