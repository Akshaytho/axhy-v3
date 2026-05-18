/**
 * SectionHeader — caption eyebrow for a decisions section bucket.
 *
 * Renders "NEEDS YOU NOW {count}" / "ROUTINE {count}" / "FAILED · REVIEW {count}"
 * with a colored dot to the left and the count on the right. Per R6 reference
 * (decisions.jsx DecisionSection), sections with count=0 render nothing.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { DecisionSectionT } from '@axhy/shared-schema';

/** Human-readable labels per section */
const SECTION_LABEL: Record<DecisionSectionT, string> = {
  NEEDS_YOU_NOW: 'NEEDS YOU NOW',
  ROUTINE: 'ROUTINE',
  STALE: 'STALE · OVER 48H',
  FAILED_REVIEW: 'FAILED · REVIEW',
};

/** Dot colors per section */
const SECTION_COLOR: Record<DecisionSectionT, string> = {
  NEEDS_YOU_NOW: tokens.color.semantic.bad,
  ROUTINE: tokens.color.ink.tertiary,
  STALE: tokens.color.ink.placeholder,
  FAILED_REVIEW: tokens.color.ink.placeholder,
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type SectionHeaderProps = {
  section: DecisionSectionT;
  count: number;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function SectionHeader({ section, count }: SectionHeaderProps) {
  if (count === 0) return null;
  const label = SECTION_LABEL[section];
  const dotColor = SECTION_COLOR[section];
  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: dotColor }]} />
      <Text style={[s.label, { color: dotColor }]}>{label}</Text>
      <Text style={s.count}>{count}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 6,
    marginTop: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  label: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    letterSpacing: 0.05 * tokens.type.monoSm.size,
    textTransform: 'uppercase',
    flex: 1,
  },
  count: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.placeholder,
    flexShrink: 0,
    marginLeft: 'auto',
  },
});
