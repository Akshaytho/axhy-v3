/**
 * MicFAB — floating terracotta microphone action button.
 *
 * Shown on every tab except Profile (caller hides via `usePathname`).
 * When `listening` is true, a pulsing ring is rendered around the button
 * using an `Animated.View` opacity keyframe (R6 micpulse animation).
 *
 * Positioned absolute so it must be rendered inside a `View` or `Modal`
 * root that has `flex: 1` + `pointerEvents="box-none"`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type MicFABProps = {
  onPress: () => void;
  listening?: boolean;
};

/**
 * Floating terracotta circle mic button.
 * Absolute-positioned; bottom 88 (clears 72-tall tab bar + 16 margin), right 16.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export function MicFAB({ onPress, listening = false }: MicFABProps) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulseAnim]);

  return (
    <View style={s.anchor} pointerEvents="box-none">
      {listening && (
        <Animated.View
          style={[
            s.pulseRing,
            {
              opacity: pulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.15, 0.5],
              }),
              transform: [
                {
                  scale: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.35],
                  }),
                },
              ],
            },
          ]}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open voice capture"
        onPress={onPress}
        style={({ pressed }) => [s.fab, pressed && s.fabPressed]}
      >
        <Feather name="mic" size={24} color={tokens.color.surface.card} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  anchor: {
    position: 'absolute',
    bottom: 88,
    right: 16,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Android elevation
    elevation: 6,
    // iOS shadow — terracotta-tinted
    shadowColor: tokens.color.brand.accent2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabPressed: {
    opacity: 0.88,
  },
  pulseRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: tokens.color.brand.accent,
    backgroundColor: 'transparent',
  },
});

export default MicFAB;
