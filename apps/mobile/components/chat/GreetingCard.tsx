/**
 * GreetingCard — personalised header card on the Chat tab.
 *
 * R6 reference: `docs/prototypes/supervisor-mobile-r6/project/src/chat.jsx`
 * Layout: terracotta caption (day + time) above Namaste greeting, subtitle
 * showing site/worker counts, and a 40×40 initial-avatar bubble on the right.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type GreetingCardProps = {
  firstName: string;
  siteCount: number;
  activeWorkerCount: number;
  /** Day label, e.g. "TUESDAY". Defaults to today if omitted. */
  dayLabel?: string;
  /** Time label, e.g. "9:41 AM". Defaults to current time if omitted. */
  timeLabel?: string;
};

function todayDayLabel(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long' }).toUpperCase();
}

function currentTimeLabel(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function GreetingCard({
  firstName,
  siteCount,
  activeWorkerCount,
  dayLabel,
  timeLabel,
}: GreetingCardProps) {
  const day = dayLabel ?? todayDayLabel();
  const time = timeLabel ?? currentTimeLabel();
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <View style={s.card}>
      <View style={s.textCol}>
        <Text style={s.caption}>
          {day} · {time}
        </Text>
        <Text style={s.greeting}>Namaste, {firstName}.</Text>
        <Text style={s.subtitle}>
          {siteCount} {siteCount === 1 ? 'site' : 'sites'} · {activeWorkerCount} workers active
        </Text>
      </View>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{initial}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[3],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper,
    gap: tokens.space[3],
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  caption: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.brand.accent,
    letterSpacing: tokens.type.caption.size * tokens.type.caption.tracking,
    textTransform: 'uppercase',
    lineHeight: tokens.type.caption.size * tokens.type.caption.lineHeight,
  },
  greeting: {
    fontSize: 24,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    lineHeight: 24 * 1.2,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: tokens.type.bodySm.size,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.tertiary,
    lineHeight: tokens.type.bodySm.size * tokens.type.bodySm.lineHeight,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.surface.paper3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
});
