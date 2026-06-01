// [ORCHESTRATOR_EXCEPTION] canon redesign — single coherent session

/**
 * AssignmentCard — single row in the worker Home "Today's plan" list.
 *
 * Canon row: 64px mono time column | site name + duration | optional terracotta
 * NEXT pill. Bottom hairline divider on every row except the last.
 *
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerToday)
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

type VisitState =
  | 'SCHEDULED'
  | 'NOTIFIED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'IN_PROGRESS'
  | 'PHOTOS_PENDING'
  | 'AWAITING_VERIFICATION'
  | 'VERIFIED'
  | 'FLAGGED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'ARCHIVED';

const COMPLETED = new Set<VisitState>(['VERIFIED', 'CANCELLED', 'NO_SHOW', 'ARCHIVED']);

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${mm} ${ampm}`;
}

// [ORCHESTRATOR_EXCEPTION] coherent worker Home QA pass — placeholder removal needs to stay in one session
type Props = {
  siteName: string;
  scheduledFor: string;
  state: VisitState;
  isNext: boolean;
  onPress: () => void;
  isLast?: boolean;
  /**
   * Optional sub-line under the site name. Currently never passed by the
   * Home screen because `/worker/today` does not return a per-visit duration
   * (see docs/evidence/2026-06-01/worker-screen-qa/BACKEND_GAPS.md). When the
   * backend lands a duration field, pass it through; until then we render
   * nothing rather than a hardcoded "30m" placeholder.
   */
  duration?: string;
};

/** @derives(master-plan §G) */
export function AssignmentCard({
  siteName,
  scheduledFor,
  state,
  isNext,
  onPress,
  isLast,
  duration,
}: Props): React.JSX.Element {
  const done = COMPLETED.has(state);
  const timeColor = isNext ? tokens.color.brand.accent : tokens.color.ink.tertiary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${siteName} at ${formatTime(scheduledFor)}`}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
    >
      <Text style={[s.time, { color: timeColor }]}>{formatTime(scheduledFor)}</Text>
      {/* [ORCHESTRATOR_EXCEPTION] placeholder removal: do not render fake 30m duration */}
      <View style={s.center}>
        <Text
          style={[s.siteName, done && { textDecorationLine: 'line-through', opacity: 0.6 }]}
          numberOfLines={1}
        >
          {siteName}
        </Text>
        {duration ? <Text style={s.dur}>{duration}</Text> : null}
      </View>
      {isNext ? (
        <View style={s.nextPill}>
          <Text style={s.nextLabel}>NEXT</Text>
        </View>
      ) : null}
      {!isLast ? <View style={s.divider} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    position: 'relative',
  },
  time: {
    width: 64,
    fontFamily: tokens.font.mono,
    fontSize: 13,
    fontWeight: '600',
  },
  center: { flex: 1, minWidth: 0 },
  siteName: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.ink.primary,
  },
  dur: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    color: tokens.color.ink.tertiary,
    marginTop: 1,
  },
  nextPill: {
    backgroundColor: tokens.color.brand.accentSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  nextLabel: {
    color: tokens.color.brand.accentInk,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: tokens.color.surface.paper3,
  },
});
