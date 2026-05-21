/**
 * Assignment card for the Worker Home list. One per visit. Tap → Assignment Detail.
 *
 * Renders site name, scheduled time, and state badge. The card flagged as "Next"
 * (next not-yet-completed visit by time) gets a terracotta border + "Next" pill.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(master-plan §G)
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

import { StateBadge } from './StateBadge';

type Props = {
  siteName: string;
  scheduledFor: string;
  state:
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
  isNext: boolean;
  onPress: () => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${mm} ${ampm}`;
}

/** @derives(master-plan §G) */
export function AssignmentCard({
  siteName,
  scheduledFor,
  state,
  isNext,
  onPress,
}: Props): React.JSX.Element {
  return (
    <Pressable
      style={[s.card, isNext && s.cardNext]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${siteName} at ${formatTime(scheduledFor)}`}
    >
      <View style={s.headerRow}>
        <Text style={s.siteName} numberOfLines={1}>
          {siteName}
        </Text>
        {isNext ? (
          <View style={s.nextPill}>
            <Text style={s.nextPillText}>NEXT</Text>
          </View>
        ) : null}
      </View>
      <View style={s.metaRow}>
        <Text style={s.time}>{formatTime(scheduledFor)}</Text>
        <StateBadge state={state} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    padding: tokens.space[3],
    marginBottom: tokens.space[2],
  },
  cardNext: {
    borderColor: tokens.color.brand.accent,
    borderWidth: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.space[1],
  },
  siteName: {
    flex: 1,
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  nextPill: {
    marginLeft: tokens.space[2],
    paddingHorizontal: tokens.space[2],
    paddingVertical: tokens.space[1],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.brand.accent,
  },
  nextPillText: {
    color: tokens.color.surface.paper,
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    letterSpacing: tokens.type.caption.tracking,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  time: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },
});
