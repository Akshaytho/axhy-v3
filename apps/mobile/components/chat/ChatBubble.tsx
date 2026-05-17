/**
 * ChatBubble — R6 voice-first chat surface bubble.
 *
 * R6 reference: `docs/prototypes/supervisor-mobile-r6/project/src/chat.jsx`
 *
 * User bubbles:   dark ink bg (tokens.color.ink.secondary), surface.card text,
 *                 right-aligned, borderBottomRightRadius 4.
 * Assistant bubbles: surface.card bg, ink.primary text, left-aligned,
 *                 borderBottomLeftRadius 4.
 *
 * When `dimmed` is true the entire bubble renders at opacity 0.55 — used for
 * older pairs so the newest exchange dominates visually (R6 §chat-capture-surface).
 *
 * Strip common markdown from assistant text so RN Text renders cleanly.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

/** Strip markdown so RN Text renders cleanly. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\|/g, '  ')
    .replace(/^>[ \t]?/gm, '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[-–—]{2,}[ \t\-–—]*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type ChatBubbleProps = {
  role: 'user' | 'assistant';
  text: string;
  /** When true, renders at opacity 0.55 — older pair dimming per R6. */
  dimmed?: boolean;
  status?: 'pending' | 'sent' | 'failed';
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function ChatBubble({ role, text, dimmed = false, status }: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <View style={[s.wrapper, isUser ? s.userWrapper : s.assistantWrapper, dimmed && s.dimmed]}>
      <View style={[s.bubble, isUser ? s.userBubble : s.assistantBubble]}>
        <Text style={[s.text, isUser ? s.userText : s.assistantText]}>
          {isUser ? text : stripMarkdown(text)}
        </Text>
        {status === 'pending' && <Text style={s.statusLabel}>Sending…</Text>}
        {status === 'failed' && <Text style={s.statusFail}>Failed</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginBottom: tokens.space[3] + 2, // 14
  },
  userWrapper: {
    alignItems: 'flex-end',
  },
  assistantWrapper: {
    alignItems: 'flex-start',
  },
  dimmed: {
    opacity: 0.55,
  },
  bubble: {
    maxWidth: '75%',
    paddingVertical: tokens.space[2] + 2, // 10
    paddingHorizontal: tokens.space[3] + 2, // 14
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: tokens.color.ink.secondary,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: tokens.color.surface.card,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: tokens.type.body.size,
    lineHeight: tokens.type.body.size * tokens.type.body.lineHeight,
    fontWeight: String(tokens.weight.medium) as '500',
  },
  userText: {
    color: tokens.color.surface.card,
  },
  assistantText: {
    color: tokens.color.ink.primary,
  },
  statusLabel: {
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
