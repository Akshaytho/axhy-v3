/**
 * SyncPill — Synced / Syncing status pill for the worker app header.
 *
 * Canon: small rounded pill with a 6px dot + label. Color tokens:
 *   synced  → ok-soft bg + #2e5037 ink
 *   syncing → warn-soft bg + warn ink
 *
 *
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerToday)
 */

import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

/** @derives(master-plan §G) — worker surface */
export type SyncState = 'synced' | 'syncing';

/** @derives(master-plan §G) — worker surface */
export function SyncPill({ state = 'synced' }: { state?: SyncState }) {
  const cfg = {
    synced: { bg: tokens.color.semantic.okSoft, ink: '#2e5037', label: 'Synced' },
    syncing: { bg: tokens.color.semantic.warnSoft, ink: '#7a5a08', label: 'Syncing…' },
  }[state];

  return (
    <View style={[s.pill, { backgroundColor: cfg.bg }]}>
      <View style={[s.dot, { backgroundColor: cfg.ink }]} />
      <Text style={[s.label, { color: cfg.ink }]}>{cfg.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
