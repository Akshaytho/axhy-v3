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

/**
 * Strip common markdown so RN Text renders cleanly. AI consistently emits
 * tables ("Field | Detail / --- ---"), headers ("### Soft Conflict"), and
 * bold markers — none of which RN Text understands.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\|/g, '  ') // table pipes → spaces FIRST so |---|---| becomes a strippable dash line
    .replace(/^>[ \t]?/gm, '') // blockquote prefix "> ... " → "..."
    .replace(/^#{1,6}[ \t]+/gm, '') // H1-H6 markers — "### Foo" → "Foo"
    .replace(/^[ \t]*[-–—]{2,}[ \t\-–—]*$/gm, '') // dash-separator lines (table sep, HR)
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** → bold (keep content)
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '$1') // *italic* → italic (single * markers)
    .replace(/\*\*/g, '') // any leftover ** markers
    .replace(/`([^`]+)`/g, '$1') // `code` → code
    .replace(/\n{3,}/g, '\n\n') // collapse triple+ newlines
    .trim();
}

import type { DecisionCardData } from '../lib/chat-api';

import { DecisionCard } from './DecisionCard';

type Props = {
  role: 'user' | 'assistant';
  text: string;
  chatMessageId?: string;
  decisionCard?: DecisionCardData;
  /** Wave 4a-PRO Task 16 — batch DecisionCards for compound utterances. */
  decisionCards?: NonNullable<DecisionCardData>[] | null;
  status?: 'pending' | 'sent' | 'failed';
  onCardApplied?: () => void;
  onCardCancelled?: () => void;
};

export function MessageBubble({
  role,
  text,
  chatMessageId,
  decisionCard,
  decisionCards,
  status,
  onCardApplied,
  onCardCancelled,
}: Props) {
  const isUser = role === 'user';
  const batch = decisionCards && decisionCards.length > 0 ? decisionCards : null;
  return (
    <View style={[s.row, isUser ? s.userRow : s.assistantRow]}>
      <View style={[s.bubble, isUser ? s.userBubble : s.assistantBubble]}>
        <Text style={[s.text, isUser ? s.userText : s.assistantText]}>
          {isUser ? text : stripMarkdown(text)}
        </Text>
        {status === 'pending' && <Text style={s.status}>Sending…</Text>}
        {status === 'failed' && <Text style={s.statusFail}>Failed</Text>}
      </View>
      {batch && chatMessageId ? (
        <View style={s.batchWrapper}>
          <Text style={s.batchTitle}>Apply {batch.length} changes?</Text>
          {batch.map((c, i) => (
            <DecisionCard
              key={`${chatMessageId}-${i}`}
              chatMessageId={chatMessageId}
              card={c}
              onApplied={onCardApplied}
              onCancelled={onCardCancelled}
            />
          ))}
        </View>
      ) : decisionCard && chatMessageId ? (
        <DecisionCard
          chatMessageId={chatMessageId}
          card={decisionCard}
          onApplied={onCardApplied}
          onCancelled={onCardCancelled}
        />
      ) : null}
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
  batchWrapper: { marginVertical: tokens.space[2] },
  batchTitle: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[1],
  },
});
