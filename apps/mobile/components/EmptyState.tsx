/**
 * Chat tab empty-state welcome — replaces blank canvas with greeting + suggestions.
 *
 * @derives(master-plan §G)
 */

import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

type Props = { supervisorName?: string };

const SUGGESTIONS = [
  '"Mark Suresh absent today"',
  '"Add Ravi to Hospital A Mon-Sat 9-5"',
  '"Pradeep sick for 3 days"',
  '"Swap Lakshmi and Mukesh at Apollo tomorrow"',
];

export function EmptyState({ supervisorName }: Props) {
  return (
    <View style={s.root}>
      <Text style={s.wave}>👋</Text>
      <Text style={s.greeting}>Hello{supervisorName ? `, ${supervisorName}` : ''}</Text>
      <Text style={s.tip}>Try saying:</Text>
      {SUGGESTIONS.map((sugg, i) => (
        <Text key={i} style={s.suggestion}>
          • {sugg}
        </Text>
      ))}
      <Text style={s.tipFooter}>Or just type below.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[6],
  },
  wave: { fontSize: 36, marginBottom: tokens.space[3] },
  greeting: {
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[4],
  },
  tip: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[2],
  },
  suggestion: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    lineHeight: tokens.type.body.size * 1.6,
  },
  tipFooter: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.tertiary,
    marginTop: tokens.space[4],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
