// [ORCHESTRATOR_EXCEPTION] coherent multi-file canon implementation must stay in single session

/**
 * StatCard — small centered card with a big number + uppercase mono caption.
 *
 * Used on Home (Done / Planned / Avg score), Final Review (Photos / Duration / GPS),
 * Profile stats row, Success score breakdown.
 *
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx)
 */

import { StyleSheet, Text } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

import { WCard } from './WCard';

/** @derives(master-plan §G) — worker surface */
// [ORCHESTRATOR_EXCEPTION] add-@derives JSDoc
export function StatCard({
  value,
  label,
  valueColor,
  padding = 12,
}: {
  value: string;
  label: string;
  valueColor?: string;
  padding?: number;
}) {
  return (
    <WCard padding={padding} style={s.card}>
      <Text style={[s.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
      <Text style={s.label}>{label}</Text>
    </WCard>
  );
}

const s = StyleSheet.create({
  card: { alignItems: 'center' },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.color.ink.primary,
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
});
