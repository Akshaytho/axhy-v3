/**
 * Shimmer skeleton bubble — replaces ActivityIndicator on first chat-tab open.
 * Renders an animated bar that pulses opacity to suggest the AI is composing.
 *
 * @derives(master-plan §G)
 */

import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

export function SkeletonBubble() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={s.row}>
      <Animated.View style={[s.bubble, { opacity }]} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { alignSelf: 'flex-start', padding: tokens.space[1] },
  bubble: {
    width: 88,
    height: 36,
    borderRadius: tokens.radius.r4,
    backgroundColor: tokens.color.surface.paper3,
  },
});
