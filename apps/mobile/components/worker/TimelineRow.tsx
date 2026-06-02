/**
 * TimelineRow — single row on the Worker History vertical timeline.
 *
 * Left rail: dot with rails up/down. Right: WCard with site name + score chip
 * + time + duration in mono.
 *
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerHistory)
 */

import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

import { WCard } from './WCard';

interface Props {
  siteName: string;
  time: string; // "6:42 AM"
  duration: string; // "32m"
  score: number;
  isFirst?: boolean;
  isLast?: boolean;
}

/** @derives(master-plan §G) — worker surface */
export function TimelineRow({ siteName, time, duration, score, isFirst, isLast }: Props) {
  const good = score >= 80;
  return (
    <View style={s.row}>
      <View style={s.rail}>
        {!isFirst ? <View style={s.line} /> : null}
        <View style={s.dot} />
        {!isLast ? <View style={s.line} /> : null}
      </View>
      <WCard padding={14} style={s.card}>
        <View style={s.headerRow}>
          <Text style={s.siteName} numberOfLines={1}>
            {siteName}
          </Text>
          <View
            style={[
              s.scoreChip,
              {
                backgroundColor: good
                  ? tokens.color.brand.accentSoft
                  : tokens.color.semantic.warnSoft,
              },
            ]}
          >
            <Text style={[s.scoreText, { color: good ? tokens.color.brand.accentInk : '#7a5a08' }]}>
              {score}
            </Text>
          </View>
        </View>
        <Text style={s.time}>{time}</Text>
        <Text style={s.dur}>{duration}</Text>
      </WCard>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', minHeight: 76 },
  rail: { width: 28, alignItems: 'center' },
  line: { width: 2, flex: 1, backgroundColor: tokens.color.brand.accent, opacity: 0.5 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: tokens.color.brand.accent,
    marginVertical: 4,
  },
  card: { flex: 1, marginLeft: 8, marginBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  siteName: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    flexShrink: 1,
  },
  scoreChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  scoreText: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  time: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    color: tokens.color.ink.secondary,
    marginTop: 4,
  },
  dur: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    marginTop: 1,
  },
});
