/**
 * TabBadgeIcon — reusable tab bar icon with an optional count badge.
 *
 * Renders a Feather icon at size 20 with the standard focused/unfocused
 * colour logic, plus a small red circular badge in the top-right corner
 * when `count` is a positive number.
 *
 * Badge spec (R6 reference — Decisions tab "6" bubble):
 *   - Background: tokens.color.semantic.bad (#A8341D)
 *   - Text: white, fontSize 10, fontWeight 700
 *   - Min-size 18×18 for single-digit; auto-width for "9+" or multi-digit
 *   - Position: absolute top:-4 / right:-8 relative to the icon
 *   - Hidden entirely when count is null or <= 0
 *
 * This component is intentionally generic so future tabs (e.g. Activity
 * unread count) can reuse it without modification.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type TabBadgeIconProps = {
  /** Feather icon name. */
  iconName: React.ComponentProps<typeof Feather>['name'];
  /** Badge count. Pass null or 0 to hide the badge entirely. */
  count: number | null;
  /** Whether the parent tab is currently focused. */
  focused: boolean;
};

/**
 * Tab bar icon with an optional red count badge overlaid top-right.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export function TabBadgeIcon({ iconName, count, focused }: TabBadgeIconProps) {
  const showBadge = count !== null && count > 0;
  const badgeLabel = count !== null && count > 9 ? '9+' : String(count ?? 0);

  return (
    <View style={s.container}>
      <Feather
        name={iconName}
        size={20}
        color={focused ? tokens.color.brand.accent : tokens.color.ink.tertiary}
      />
      {showBadge && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badgeLabel}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.color.semantic.bad,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
