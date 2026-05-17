/**
 * DecisionLinkPill — sparkle icon + "{N} decisions added — review in Decisions" + right-arrow.
 *
 * R6 reference: `docs/prototypes/supervisor-mobile-r6/project/src/chat.jsx`
 * Accent-soft background, accent-ink text, accent border.
 * Rendered below an AI response bubble when the AI extracted decisions.
 * Tapping navigates to /(supervisor)/decisions via the `onPress` callback.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type DecisionLinkPillProps = {
  count: number;
  onPress: () => void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function DecisionLinkPill({ count, onPress }: DecisionLinkPillProps) {
  const label =
    count === 1
      ? '1 decision added — review in Decisions'
      : `${count} decisions added — review in Decisions`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.pill, pressed && s.pressed]}
    >
      <View style={s.iconWrap}>
        {/* Feather "star" is the closest available to sparkle/asterisk */}
        <Feather name="star" size={12} color={tokens.color.brand.accentInk} />
      </View>
      <Text style={s.label} numberOfLines={1}>
        {label}
      </Text>
      <Feather name="chevron-right" size={12} color={tokens.color.brand.accentInk} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    backgroundColor: tokens.color.brand.accentSoft,
    borderWidth: 1,
    borderColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r2,
    marginTop: tokens.space[2],
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.8,
  },
  iconWrap: {
    flexShrink: 0,
  },
  label: {
    flex: 1,
    fontSize: tokens.type.bodySm.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.brand.accentInk,
  },
});
