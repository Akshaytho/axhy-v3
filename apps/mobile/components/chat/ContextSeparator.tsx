/**
 * ContextSeparator — centered mono "TODAY · HH:MM · CONTEXT LOADED" line.
 *
 * R6 reference: `docs/prototypes/supervisor-mobile-r6/project/src/chat.jsx`
 * Renders as a dim monospace caption centred in the message list, signalling
 * that AI context is loaded and ready.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type ContextSeparatorProps = {
  /** Override the displayed time, e.g. "6:14 AM". Defaults to current time. */
  timeLabel?: string;
};

function currentTimeLabel(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function ContextSeparator({ timeLabel }: ContextSeparatorProps) {
  const time = timeLabel ?? currentTimeLabel();

  return <Text style={s.label}>TODAY · {time} · CONTEXT LOADED</Text>;
}

const s = StyleSheet.create({
  label: {
    textAlign: 'center',
    fontSize: tokens.type.monoSm.size,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.placeholder,
    letterSpacing: 0.08 * tokens.type.monoSm.size,
    textTransform: 'uppercase',
    marginVertical: tokens.space[4],
    lineHeight: tokens.type.monoSm.size * tokens.type.monoSm.lineHeight,
  },
});
