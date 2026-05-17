/**
 * TopAppBar — Today's screen header.
 *
 * Per R6 prototype. "Namaste, {firstName}." + sites/workers summary so
 * the supervisor knows the screen scope at a glance.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type TopAppBarProps = {
  firstName?: string | null;
  /** Null while data is in flight; number once loaded. */
  siteCount: number | null;
  workerCount: number | null;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function TopAppBar({ firstName, siteCount, workerCount }: TopAppBarProps) {
  const today = new Date().toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  let subtitle: string | null = null;
  if (siteCount !== null && workerCount !== null) {
    subtitle =
      siteCount === 0
        ? 'No sites assigned yet.'
        : `${siteCount} site${siteCount === 1 ? '' : 's'} · ${workerCount} worker${workerCount === 1 ? '' : 's'}`;
  }
  return (
    <View style={s.bar}>
      <Text style={s.eyebrow}>{today.toUpperCase()}</Text>
      <Text style={s.greeting}>Namaste{firstName ? `, ${firstName}` : ''}.</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { marginBottom: tokens.space[5] },
  eyebrow: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.2,
    marginBottom: tokens.space[1],
  },
  greeting: {
    fontSize: tokens.type.display.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginTop: tokens.space[1],
  },
});
