/**
 * Today tab stub — Slice 2+.
 * @derives(ADR-0021)
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

export default function TodayScreen() {
  return (
    <View style={s.root}>
      <Text style={s.label}>Coming soon — Slice 2+</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
  },
});
