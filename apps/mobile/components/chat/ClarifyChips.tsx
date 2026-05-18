/**
 * ClarifyChips — tappable option chips rendered below an assistant message
 * when the AI emits `propose_clarify` (Wave 3, confidence < 0.7).
 *
 * Backend contract (chat.ts):
 *   decisionCard = {
 *     toolName: 'propose_clarify',
 *     title:    p.question,
 *     description: 'Tap an option to continue.',
 *     fields: { question: string, options: string[2..4] },
 *     clarify: true,
 *   }
 *
 * Tap behaviour: the chosen option text becomes the next user message —
 * injected via the chat surface's `onSend` path so the chat tool-loop
 * sees the supervisor's choice as a normal turn (no special API).
 *
 * Once any chip is tapped, the chip strip locks (no second tap) — picking
 * twice would re-classify the same disambiguation. The parent message
 * stays visible so the supervisor remembers what they chose.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C.2 — confidence gate)
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

export type ClarifyChipsProps = {
  /** The clarifying question, e.g. "Which Aparna site did you mean?" */
  readonly question: string;
  /** 2..4 option strings to render as chips. */
  readonly options: ReadonlyArray<string>;
  /** Fires with the chosen option's text. Parent injects it as the next user message. */
  readonly onSelect: (option: string) => void;
};

export function ClarifyChips(props: ClarifyChipsProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);

  const handle = (option: string): void => {
    if (selected !== null) return;
    setSelected(option);
    props.onSelect(option);
  };

  return (
    <View
      style={s.root}
      accessibilityLabel={`Clarifying question: ${props.question}. ${props.options.length} options.`}
    >
      <Text style={s.question}>{props.question}</Text>
      <View style={s.chipRow}>
        {props.options.map((opt) => {
          const isLocked = selected !== null;
          const isPicked = selected === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => handle(opt)}
              disabled={isLocked}
              accessibilityRole="button"
              accessibilityLabel={opt}
              accessibilityState={{ disabled: isLocked, selected: isPicked }}
              style={[s.chip, isPicked && s.chipPicked, isLocked && !isPicked && s.chipDimmed]}
            >
              <Text style={[s.chipText, isPicked && s.chipTextPicked]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    gap: tokens.space[2],
    marginTop: tokens.space[1],
    marginBottom: tokens.space[2],
    marginHorizontal: tokens.space[1],
  },
  question: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    fontStyle: 'italic',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[2],
  },
  chip: {
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    borderRadius: 999,
    backgroundColor: tokens.color.surface.card,
    borderWidth: 1,
    borderColor: tokens.color.brand.accent2,
  },
  chipPicked: {
    backgroundColor: tokens.color.brand.accent2,
  },
  chipDimmed: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.brand.accent2,
    fontWeight: String(tokens.weight.medium) as '500',
  },
  chipTextPicked: {
    color: tokens.color.surface.card,
  },
});
