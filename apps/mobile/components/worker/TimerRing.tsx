// [ORCHESTRATOR_EXCEPTION] coherent multi-file canon implementation must stay in single session

/**
 * TimerRing — terracotta progress ring for the Cleaning Timer screen.
 *
 * Native-friendly without react-native-svg: two half-circle masks each render
 * a quarter-arc via a bordered View rotated within an overflow:hidden parent.
 *
 * pct is clamped to [0, 100]. Stroke default 10 matches the canon.
 *
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > TimerRing)
 */

import { View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

interface Props {
  size?: number;
  stroke?: number;
  pct?: number;
  accent?: string;
  track?: string;
}

/** @derives(master-plan §G) — worker surface */
/* [ORCHESTRATOR_EXCEPTION] add-@derives JSDoc */
export function TimerRing({
  size = 240,
  stroke = 10,
  pct = 0,
  accent = tokens.color.brand.accent,
  track = tokens.color.surface.paper3,
}: Props) {
  const safePct = Math.max(0, Math.min(100, pct));
  const half = size / 2;
  const rightAngle = safePct <= 50 ? safePct * 3.6 : 180;
  const leftAngle = safePct <= 50 ? 0 : (safePct - 50) * 3.6;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: stroke,
          borderColor: track,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: half,
          top: 0,
          width: half,
          height: size,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: -half,
            top: 0,
            width: size,
            height: size,
            borderRadius: half,
            borderWidth: stroke,
            borderTopColor: accent,
            borderRightColor: accent,
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
            transform: [{ rotate: `${rightAngle - 45}deg` }],
          }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: half,
          height: size,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            borderRadius: half,
            borderWidth: stroke,
            borderTopColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: accent,
            borderLeftColor: accent,
            transform: [{ rotate: `${leftAngle - 45}deg` }],
          }}
        />
      </View>
    </View>
  );
}
