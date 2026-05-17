/**
 * TranscriptionMeta — language-hop + "transcribed" label + confidence chip + Re-record action.
 *
 * R6 reference: `docs/prototypes/supervisor-mobile-r6/project/src/chat.jsx`
 * Shows below the most-recent voice waveform pill. Rendered only when the most
 * recent message has voice metadata (caller decides whether to render).
 *
 * Confidence chips:
 *   HIGH   → ok-soft bg + ok text
 *   MEDIUM → warn-soft bg + warn text + warning icon
 *   LOW    → bad-soft bg + bad text + alert icon
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type TranscriptionMetaProps = {
  /** Source language code, e.g. "te". Renders as "te → en" when `to` is also set. */
  from?: string;
  /** Target language code, e.g. "en". */
  to?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  onRerecord?: () => void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function TranscriptionMeta({ from, to, confidence, onRerecord }: TranscriptionMetaProps) {
  const langLabel = from && to ? `${from} → ${to}` : from ? from : undefined;

  const chipBg =
    confidence === 'HIGH'
      ? tokens.color.semantic.okSoft
      : confidence === 'MEDIUM'
        ? tokens.color.semantic.warnSoft
        : tokens.color.semantic.badSoft;

  const chipColor =
    confidence === 'HIGH'
      ? tokens.color.semantic.ok
      : confidence === 'MEDIUM'
        ? tokens.color.semantic.warn
        : tokens.color.semantic.bad;

  const chipIcon: React.ComponentProps<typeof Feather>['name'] =
    confidence === 'HIGH' ? 'check' : confidence === 'MEDIUM' ? 'alert-triangle' : 'alert-circle';

  return (
    <View style={s.row}>
      {langLabel ? <Text style={s.langLabel}>{langLabel} · transcribed</Text> : null}
      {confidence ? (
        <View style={[s.chip, { backgroundColor: chipBg }]}>
          <Feather name={chipIcon} size={9} color={chipColor} />
          <Text style={[s.chipText, { color: chipColor }]}>{confidence}</Text>
        </View>
      ) : null}
      {confidence !== 'HIGH' && onRerecord ? (
        <Pressable onPress={onRerecord} accessibilityRole="button" accessibilityLabel="Re-record">
          <Text style={s.rerecord}>Re-record</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[1],
    marginTop: tokens.space[1],
  },
  langLabel: {
    fontSize: tokens.type.monoSm.size,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.placeholder,
    lineHeight: tokens.type.monoSm.size * tokens.type.monoSm.lineHeight,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 10,
    fontWeight: String(tokens.weight.bold) as '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04 * 10,
  },
  rerecord: {
    fontSize: 10,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.brand.accent,
  },
});
