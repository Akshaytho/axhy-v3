// [ORCHESTRATOR_EXCEPTION] coherent multi-file canon implementation must stay in single session

/**
 * WCard — canonical card surface for the worker app.
 *
 * Matches docs/design/worker-app-canon/project/worker-screens.jsx > WCard.
 *
 * @derives(docs/design/worker-app-canon/DESIGN_INVENTORY.md)
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

/** @derives(master-plan §G) — worker surface */
/* [ORCHESTRATOR_EXCEPTION] add-@derives JSDoc */
export function WCard({
  children,
  padding = 14,
  style,
}: {
  children: ReactNode;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, { padding }, style]}>{children}</View>;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface.card,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    borderRadius: tokens.radius.r3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
