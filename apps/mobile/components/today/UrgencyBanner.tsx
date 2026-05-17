/**
 * UrgencyBanner — top "NEEDS YOU NOW" attention bar.
 *
 * Per R6 prototype `today.jsx:589-624`:
 *   - 12/14 padding, r-2 (10px) radius, bad-soft background, 4px left border in --bad
 *   - eyebrow: ⚠ NEEDS YOU NOW in --bad t-caption
 *   - body: fontSize 14, fontWeight 600, ink primary
 *   - lines joined with " · "
 *
 * Renders null when nothing needs attention so Today feels calm.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayPulseT, TodaySiteT } from '@axhy/shared-schema';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type UrgencyBannerProps = {
  pulse: TodayPulseT;
  sites: ReadonlyArray<TodaySiteT>;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function UrgencyBanner({ pulse, sites }: UrgencyBannerProps) {
  const totalShort = pulse.late + pulse.noShow;
  const sitesShort = sites.filter((s) => s.workersDue - s.workersOn > 0).length;
  if (totalShort === 0 && pulse.flagged === 0) return null;

  const lines: string[] = [];
  if (totalShort > 0) {
    lines.push(`${totalShort} short across ${sitesShort} ${sitesShort === 1 ? 'site' : 'sites'}`);
  }
  if (pulse.flagged > 0) {
    lines.push(`${pulse.flagged} flagged ${pulse.flagged === 1 ? 'visit' : 'visits'}`);
  }

  return (
    <View style={s.banner}>
      <Text style={s.eyebrow}>⚠ NEEDS YOU NOW</Text>
      <Text style={s.body}>{lines.join(' · ')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: tokens.color.semantic.badSoft,
    borderRadius: tokens.radius.r2,
    borderLeftWidth: 4,
    borderLeftColor: tokens.color.semantic.bad,
  },
  eyebrow: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.semantic.bad,
    letterSpacing: tokens.type.caption.size * tokens.type.caption.tracking,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  body: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
});
