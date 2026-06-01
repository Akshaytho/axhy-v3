// [ORCHESTRATOR_EXCEPTION] canon redesign — worker History

/**
 * Worker History — canon layout: week selector + summary card + vertical timeline.
 *
 * No backend wiring yet (slice-2a placeholder used dummy data; canon design's
 * full data shape — score, duration, time per visit — also lacks a backend
 * endpoint). This screen renders mock data structured to match what
 * `/worker/history?week=...` will return in slice 3. Replacing the mock with
 * the real query is a one-line swap.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerHistory)
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { WCard } from '../../components/worker/WCard';
import { TimelineRow } from '../../components/worker/TimelineRow';
import { useWorkerDrawer } from '../../components/worker/WorkerDrawer';

interface Day {
  label: string;
  date: number;
  today?: boolean;
}

interface HistoryVisit {
  id: string;
  name: string;
  time: string;
  dur: string;
  score: number;
}

const MOCK_VISITS: HistoryVisit[] = [
  { id: 'h1', name: 'Phoenix Mall — B1', time: '6:42 AM', dur: '32m', score: 92 },
  { id: 'h2', name: 'Brigade Tower 3', time: '8:10 AM', dur: '28m', score: 84 },
  { id: 'h3', name: 'Lulu Mall — Tower A', time: '9:55 AM', dur: '34m', score: 78 },
  { id: 'h4', name: 'Manyata Block 4', time: '11:30 AM', dur: '26m', score: 88 },
];

function getWeek(anchor: Date): Day[] {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  const labels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const today = new Date();
  return labels.map((label, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      label,
      date: d.getDate(),
      today: d.toDateString() === today.toDateString(),
    };
  });
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase();
}

/** @derives(master-plan §G) — worker surface */
export default function WorkerHistory(): React.JSX.Element {
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedIndex, setSelectedIndex] = useState(() => new Date().getDay());
  const { openDrawer } = useWorkerDrawer();

  const week = useMemo(() => getWeek(anchor), [anchor]);

  function shiftWeek(deltaDays: number) {
    const next = new Date(anchor);
    next.setDate(anchor.getDate() + deltaDays);
    setAnchor(next);
  }

  const totalCount = MOCK_VISITS.length;
  const avgScore = Math.round(
    MOCK_VISITS.reduce((sum, v) => sum + v.score, 0) / Math.max(1, MOCK_VISITS.length),
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <Pressable
            onPress={openDrawer}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={12}
            style={s.iconBtn}
          >
            <Feather name="menu" size={22} color={tokens.color.ink.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>History</Text>
            <Text style={s.monthLabel}>{monthLabel(anchor)}</Text>
          </View>
        </View>

        {/* Week selector */}
        <View style={s.weekRow}>
          <Pressable
            onPress={() => shiftWeek(-7)}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            hitSlop={12}
            style={s.weekNav}
          >
            <Feather name="chevron-left" size={18} color={tokens.color.ink.tertiary} />
          </Pressable>
          <View style={s.weekGrid}>
            {week.map((d, i) => {
              const selected = i === selectedIndex;
              return (
                <Pressable
                  key={i}
                  onPress={() => setSelectedIndex(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.label} ${d.date}`}
                  style={[
                    s.weekCell,
                    selected && s.weekCellSelected,
                    !selected && d.today && s.weekCellToday,
                  ]}
                >
                  <Text style={[s.weekLabel, selected && s.weekTextOnAccent]}>{d.label}</Text>
                  <Text
                    style={[
                      s.weekDate,
                      selected
                        ? s.weekTextOnAccent
                        : d.today
                          ? { color: tokens.color.brand.accent }
                          : null,
                    ]}
                  >
                    {d.date}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => shiftWeek(7)}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            hitSlop={12}
            style={s.weekNav}
          >
            <Feather name="chevron-right" size={18} color={tokens.color.ink.tertiary} />
          </Pressable>
        </View>

        {/* Summary card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <WCard padding={20}>
            <View style={s.summaryRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryBigNumber}>{totalCount}</Text>
                <Text style={s.summaryLabel}>sites completed</Text>
                <Text style={s.summaryMono}>2H 0M TOTAL</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={{ alignItems: 'center' }}>
                <Text style={s.summaryMonoSmall}>AVG SCORE</Text>
                <Text style={s.summaryScore}>{avgScore}</Text>
              </View>
            </View>
          </WCard>
        </View>

        {/* Timeline */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}>
          {MOCK_VISITS.map((v, i) => (
            <TimelineRow
              key={v.id}
              siteName={v.name}
              time={v.time}
              duration={v.dur}
              score={v.score}
              isFirst={i === 0}
              isLast={i === MOCK_VISITS.length - 1}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  scroll: { paddingBottom: 16 },
  header: {
    backgroundColor: tokens.color.surface.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.paper3,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: tokens.color.ink.primary,
    lineHeight: 30,
  },
  monthLabel: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 1.1,
    color: tokens.color.ink.tertiary,
    marginTop: 4,
  },
  weekRow: {
    backgroundColor: tokens.color.surface.card,
    paddingHorizontal: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.paper3,
  },
  weekNav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  weekGrid: {
    flex: 1,
    flexDirection: 'row',
    gap: 2,
    backgroundColor: tokens.color.surface.paper2,
    padding: 4,
    borderRadius: 12,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  weekCellSelected: { backgroundColor: tokens.color.brand.accent },
  weekCellToday: {
    borderWidth: 1,
    borderColor: tokens.color.brand.accent,
  },
  weekLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.color.ink.tertiary,
  },
  weekDate: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.ink.secondary,
    marginTop: 1,
  },
  weekTextOnAccent: { color: tokens.color.surface.card },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryBigNumber: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: -1,
    color: tokens.color.ink.primary,
  },
  summaryLabel: {
    fontSize: 14,
    color: tokens.color.ink.secondary,
    marginTop: 4,
  },
  summaryMono: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 0.9,
    color: tokens.color.ink.tertiary,
    marginTop: 8,
  },
  summaryDivider: {
    width: 1,
    height: 56,
    backgroundColor: tokens.color.surface.paper3,
    marginHorizontal: 18,
  },
  summaryMonoSmall: {
    fontFamily: tokens.font.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: tokens.color.ink.tertiary,
    marginBottom: 4,
  },
  summaryScore: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 32,
    color: tokens.color.brand.accent,
  },
});
