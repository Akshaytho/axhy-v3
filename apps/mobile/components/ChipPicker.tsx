/**
 * Override-reason chip picker for SOFT conflict DecisionCards.
 *
 * @derives(master-plan §G)
 */

import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

type Chip = { label: string; value: string };

type Props = {
  chips: Chip[];
  onChange: (selectedValue: string | null, freeText: string | null) => void;
};

export function ChipPicker({ chips, onChange }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');

  const select = (val: string) => {
    const next = selected === val ? null : val;
    setSelected(next);
    onChange(next, next === 'other' ? freeText : null);
  };

  const onFreeTextChange = (txt: string) => {
    setFreeText(txt);
    if (selected === 'other') onChange('other', txt);
  };

  return (
    <View style={s.root}>
      <Text style={s.label}>Why?</Text>
      <View style={s.chipsRow}>
        {chips.map((chip) => {
          const isSelected = selected === chip.value;
          return (
            <Pressable
              key={chip.value}
              onPress={() => select(chip.value)}
              style={[s.chip, isSelected && s.chipSelected]}
            >
              <Text style={[s.chipText, isSelected && s.chipTextSelected]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected === 'other' && (
        <TextInput
          style={s.freeTextInput}
          placeholder="Tell us more..."
          placeholderTextColor={tokens.color.ink.placeholder}
          value={freeText}
          onChangeText={onFreeTextChange}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { marginVertical: tokens.space[3] },
  label: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[1] + 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[1] + 2 },
  chip: {
    paddingVertical: tokens.space[1] + 2,
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.r4,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.card,
  },
  chipSelected: {
    borderColor: tokens.color.brand.accent,
    backgroundColor: tokens.color.brand.accentSoft,
  },
  chipText: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.primary,
  },
  chipTextSelected: {
    color: tokens.color.brand.accentInk,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  freeTextInput: {
    marginTop: tokens.space[2],
    paddingVertical: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.r2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.card,
    color: tokens.color.ink.primary,
    fontSize: tokens.type.body.size,
  },
});
