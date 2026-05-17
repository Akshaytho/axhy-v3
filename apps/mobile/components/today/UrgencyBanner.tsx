/**
 * UrgencyBanner — top "NEEDS YOU NOW" banner.
 *
 * Per R6 prototype. Renders only when (a) any worker is no_show / late, or
 * (b) any visit is flagged. Otherwise null — Today should feel calm when
 * nothing needs the supervisor.
 *
 * Tapping the banner is a future affordance (jump to flagged review or
 * to the affected site card). For sprint scope, the banner is read-only
 * informational; no log+advance stub.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayPulseT } from '@axhy/shared-schema';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type UrgencyBannerProps = { pulse: TodayPulseT };

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function UrgencyBanner({ pulse }: UrgencyBannerProps) {
  const parts: string[] = [];
  if (pulse.noShow > 0) parts.push(`${pulse.noShow} no-show${pulse.noShow > 1 ? 's' : ''}`);
  if (pulse.late > 0) parts.push(`${pulse.late} late`);
  if (pulse.flagged > 0)
    parts.push(`${pulse.flagged} flagged visit${pulse.flagged > 1 ? 's' : ''}`);
  if (parts.length === 0) return null;

  return (
    <View style={s.banner}>
      <Text style={s.eyebrow}>NEEDS YOU NOW</Text>
      <Text style={s.body}>{parts.join(' · ')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    backgroundColor: tokens.color.semantic.badSoft,
    borderColor: tokens.color.semantic.bad,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    marginBottom: tokens.space[4],
  },
  eyebrow: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.bad,
    letterSpacing: 1.2,
    marginBottom: tokens.space[1],
  },
  body: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
});
