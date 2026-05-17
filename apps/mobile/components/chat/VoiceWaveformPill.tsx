/**
 * VoiceWaveformPill — dark rounded pill showing mic icon + animated waveform bars + duration.
 *
 * R6 reference: `docs/prototypes/supervisor-mobile-r6/project/src/chat.jsx`
 * When `listening` is true the bars animate (Animated.loop on opacity).
 * When false the bars are rendered static.
 *
 * Used as the "most recent voice capture" visual indicator inside a user bubble.
 * Actual native voice recording is a follow-up slice; this renders the shape.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

/** Bar heights (px) that give the waveform its organic shape. */
const BAR_HEIGHTS = [5, 8, 12, 16, 10, 14, 8, 18, 12, 9, 14, 16, 10, 7, 12, 9, 5] as const;

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type VoiceWaveformPillProps = {
  /** Duration string, e.g. "0:08". Defaults to "0:00". */
  duration?: string;
  /** When true, bars animate with pulsing opacity to signal live recording. */
  listening?: boolean;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function VoiceWaveformPill({
  duration = '0:00',
  listening = false,
}: VoiceWaveformPillProps) {
  const animValues = useRef(BAR_HEIGHTS.map(() => new Animated.Value(0.6))).current;

  useEffect(() => {
    if (!listening) {
      animValues.forEach((v) => {
        v.stopAnimation();
        v.setValue(0.6);
      });
      return;
    }

    const loops = animValues.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 40),
          Animated.timing(v, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [listening, animValues]);

  return (
    <View style={s.pill}>
      <Feather
        name="mic"
        size={16}
        color={listening ? tokens.color.brand.accent : 'rgba(253,250,243,0.85)'}
      />
      <View style={s.barsRow}>
        {BAR_HEIGHTS.map((height, i) => (
          <Animated.View
            key={i}
            style={[
              s.bar,
              {
                height,
                opacity: animValues[i],
              },
            ]}
          />
        ))}
      </View>
      <Text style={s.duration}>{duration}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    minWidth: 160,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
    flex: 1,
  },
  bar: {
    width: 2,
    backgroundColor: 'rgba(253,250,243,0.8)',
    borderRadius: 1,
  },
  duration: {
    fontSize: tokens.type.monoSm.size,
    fontWeight: String(tokens.weight.medium) as '500',
    color: 'rgba(253,250,243,0.85)',
    opacity: 0.85,
  },
});
