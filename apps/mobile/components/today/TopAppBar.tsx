/**
 * TopAppBar — R6-faithful chrome bar.
 *
 * Per `docs/prototypes/supervisor-mobile-r6/project/src/shell.jsx:846-915`.
 * Shape: tiny terracotta caption above an 18px/600 title with -0.2px tracking,
 * 1px bottom border in `--card-edge`, paper background, narrow vertical padding.
 * Action icons (Menu / Search / Bell) deferred — they need wired surfaces
 * (Drawer, search-workers, notification feed) that don't exist yet.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type TopAppBarProps = {
  title: string;
  /** Optional small terracotta caption above the title. */
  subtitle?: string;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function TopAppBar({ title, subtitle }: TopAppBarProps) {
  return (
    <View style={s.bar}>
      <View style={s.center}>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
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
    paddingHorizontal: tokens.space[4],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper,
  },
  center: { flex: 1, minWidth: 0 },
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
