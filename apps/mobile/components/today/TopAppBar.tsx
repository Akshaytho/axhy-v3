/**
 * TopAppBar — R6-faithful chrome bar with Menu + Search + Bell icons.
 *
 * Per `docs/prototypes/supervisor-mobile-r6/project/src/shell.jsx:846-915`.
 * Shape: tiny terracotta caption above an 18/600 title with -0.2px tracking,
 * 1px bottom border in `--card-edge`, paper background, narrow vertical
 * padding. Menu icon on left will open the Drawer once that surface
 * lands; Search + Bell icons surface their respective screens.
 *
 * Per `feedback_real_life_scenarios_before_implementation`, when an icon's
 * target surface doesn't exist yet, tapping is a no-op (NOT a fake toast).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type TopAppBarProps = {
  title: string;
  subtitle?: string;
  onMenu?: () => void;
  onSearch?: () => void;
  onBell?: () => void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function TopAppBar({ title, subtitle, onMenu, onSearch, onBell }: TopAppBarProps) {
  return (
    <View style={s.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Menu"
        onPress={onMenu}
        style={({ pressed }) => [s.iconBtn, pressed && s.iconBtnPressed]}
      >
        <Feather name="menu" size={20} color={tokens.color.ink.primary} />
      </Pressable>

      <View style={s.center}>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search"
        onPress={onSearch}
        style={({ pressed }) => [s.iconBtn, pressed && s.iconBtnPressed]}
      >
        <Feather name="search" size={18} color={tokens.color.ink.secondary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        onPress={onBell}
        style={({ pressed }) => [s.iconBtn, pressed && s.iconBtnPressed]}
      >
        <Feather name="bell" size={18} color={tokens.color.ink.secondary} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 6,
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  iconBtnPressed: { backgroundColor: tokens.color.surface.paper2 },
  center: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  subtitle: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.brand.accent,
    letterSpacing: tokens.type.caption.size * tokens.type.caption.tracking,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    letterSpacing: -0.2,
    lineHeight: 18 * 1.2,
  },
});
