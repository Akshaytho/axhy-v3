/**
 * Worker Home top-right bell icon + static dot.
 *
 * Slice 2a-2: tap fires a "Notifications coming soon" toast (no nav target
 * yet; the Notifications list screen ships in slice 3). The dot is static
 * (always shown) because real bell-badge count joins live in slice 3.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1 + §4 Q7)
 * @derives(master-plan §G)
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

const TAP_SIZE = 28;
const BELL_GLYPH_SIZE = 22;
const DOT_SIZE = 8;

type Props = {
  onPress: () => void;
};

/** @derives(master-plan §G) */
export function HomeBellIcon({ onPress }: Props): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={tokens.space[3]}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      style={s.wrap}
    >
      <Feather name="bell" size={BELL_GLYPH_SIZE} color={tokens.color.ink.primary} />
      <View style={s.dot} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: TAP_SIZE,
    height: TAP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: tokens.color.brand.accent,
  },
});
