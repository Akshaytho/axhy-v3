/**
 * Visit-state badge — colored pill mapping `visitMachine.VisitStateValue`
 * to label + color. Mobile NEVER simulates state; it always reads from
 * the backend's `visit.state` column.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(master-plan §G)
 */

import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

type VisitStateValue =
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
  | 'REJECTED'
  | 'NO_SHOW'
  | 'ARCHIVED';

type Tone = 'neutral' | 'accent' | 'warn' | 'bad' | 'ok';

const STATE_MAP: Record<VisitStateValue, { label: string; tone: Tone }> = {
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  NOTIFIED: { label: 'Notified', tone: 'neutral' },
  EN_ROUTE: { label: 'En route', tone: 'accent' },
  ON_SITE: { label: 'On site', tone: 'accent' },
  IN_PROGRESS: { label: 'In progress', tone: 'accent' },
  PHOTOS_PENDING: { label: 'Review', tone: 'accent' },
  AWAITING_VERIFICATION: { label: 'Verifying', tone: 'warn' },
  VERIFIED: { label: 'Verified', tone: 'ok' },
  FLAGGED: { label: 'Flagged', tone: 'warn' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
  NO_SHOW: { label: 'Missed', tone: 'bad' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

const TONE_COLORS: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: tokens.color.surface.paper3, fg: tokens.color.ink.secondary },
  accent: { bg: tokens.color.brand.accentSoft, fg: tokens.color.brand.accentInk },
  warn: { bg: tokens.color.semantic.warnSoft, fg: tokens.color.semantic.warn },
  bad: {
    bg: tokens.color.semantic.badSoft ?? tokens.color.brand.accentSoft,
    fg: tokens.color.semantic.bad,
  },
  ok: { bg: tokens.color.semantic.okSoft, fg: tokens.color.semantic.ok },
};

/** @derives(master-plan §G) */
export function StateBadge({ state }: { state: string }): React.JSX.Element {
  // Defensive: the backend returns visit.state as an unvalidated string, so an
  // unmapped / future / phantom state (e.g. a legacy 'REJECTED' row) must render
  // as a neutral pill instead of crashing on `undefined.tone`. RCA-F 2026-06-04.
  const meta = STATE_MAP[state as VisitStateValue] ?? { label: state, tone: 'neutral' as Tone };
  const colors = TONE_COLORS[meta.tone];
  return (
    <View style={[s.badge, { backgroundColor: colors.bg }]}>
      <Text style={[s.label, { color: colors.fg }]}>{meta.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: tokens.space[2],
    paddingVertical: tokens.space[1],
    borderRadius: tokens.radius.r2,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    letterSpacing: tokens.type.caption.tracking,
    textTransform: 'uppercase',
  },
});
