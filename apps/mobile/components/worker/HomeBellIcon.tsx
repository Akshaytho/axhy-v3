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
      <Feather name="bell" size={22} color={tokens.color.ink.primary} />
      <View style={s.dot} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.brand.accent,
  },
});
