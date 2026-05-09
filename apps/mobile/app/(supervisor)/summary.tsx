/**
 * Summary tab stub — Slice 2+.
 * @derives(ADR-0021)
 */

import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@axhy/ui-tokens';

export default function SummaryScreen() {
  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Text style={s.label}>Coming soon — Slice 2+</Text>
    </SafeAreaView>
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
