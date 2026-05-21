/**
 * Worker History — week calendar + day-detail visits + earnings summary.
 *
 * Slice 1 scaffold: placeholder. Full implementation in slice 2 per
 * MVP_V2_ALIGNED_PLAN.md §2 (V2 HistoryScreen.tsx layout, with Pay
 * folded in here per the rolled-back 3-tab decision).
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 */

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@axhy/ui-tokens';

/** @derives(master-plan §G) — worker surface */
export default function WorkerHistory() {
  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.inner}>
        <Text style={s.heading}>History</Text>
        <Text style={s.sub}>Week calendar + earnings summary land in slice 2.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  inner: {
    flex: 1,
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[6],
  },
  heading: {
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[1],
  },
  sub: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },
});
