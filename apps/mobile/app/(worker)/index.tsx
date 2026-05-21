/**
 * Worker Home — primary daily-loop screen.
 *
 * Slice 1 scaffold: empty paper canvas with brand wordmark + greeting.
 * Full implementation (assignment list, banners, bell) lands in slice 2
 * per MVP_V2_ALIGNED_PLAN.md §2 (V2 WorkerHomeScreen.tsx layout).
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 */

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@axhy/ui-tokens';

/** @derives(master-plan §G) — worker surface */
export default function WorkerHome() {
  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.inner}>
        <Text style={s.brand}>Axhy</Text>
        <Text style={s.heading}>Worker shell ready</Text>
        <Text style={s.sub}>Slice 2 will render today&apos;s assignments here.</Text>
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
  brand: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accent,
    letterSpacing: tokens.type.caption.tracking,
    textTransform: 'uppercase',
    marginBottom: tokens.space[3],
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
