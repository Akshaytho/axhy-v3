/**
 * TierChip — pill displaying the decision tier.
 *
 * Tone colors pulled from `tokens.color` to match the `tokens.decisionTier`
 * semantic map (bg/text/border per tier). REVIEW tier reuses warn colors.
 * Rendered in a compact pill: 2/8 padding, 999 border-radius, MONO font,
 * 10/700 uppercase text.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { DecisionTierT } from '@axhy/shared-schema';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type TierStyle = { bg: string; text: string; border: string };

/** Resolved color values per tier — mirrors tokens.decisionTier semantic map */
const TIER_COLORS: Record<DecisionTierT, TierStyle> = {
  NOTE: {
    bg: tokens.color.surface.paper3,
    text: tokens.color.ink.tertiary,
    border: 'transparent',
  },
  OPERATIONAL: {
    bg: tokens.color.semantic.infoSoft,
    text: tokens.color.semantic.infoInk,
    border: 'transparent',
  },
  PERSONNEL: {
    bg: tokens.color.brand.accentSoft,
    text: tokens.color.brand.accentInk,
    border: tokens.color.brand.accent,
  },
  EMPLOYMENT: {
    bg: tokens.color.semantic.badSoft,
    text: tokens.color.semantic.bad,
    border: tokens.color.semantic.bad,
  },
  REVIEW: {
    bg: tokens.color.semantic.warnSoft,
    text: tokens.color.semantic.warn,
    border: 'transparent',
  },
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type TierChipProps = { tier: DecisionTierT };

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function TierChip({ tier }: TierChipProps) {
  const style = TIER_COLORS[tier] ?? TIER_COLORS.NOTE;
  return (
    <View
      style={[
        s.pill,
        {
          backgroundColor: style.bg,
          borderColor: style.border === 'transparent' ? 'transparent' : style.border,
        },
      ]}
    >
      <Text style={[s.label, { color: style.text }]}>{tier}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: String(tokens.weight.bold) as '700',
    fontFamily: tokens.font.mono,
    letterSpacing: 0.04 * 10,
    textTransform: 'uppercase',
  },
});
