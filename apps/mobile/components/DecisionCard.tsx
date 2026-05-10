/**
 * Renders a proposed-action DecisionCard from the AI's tool-use response.
 * On Apply: calls applyDecisionCard. On Cancel: parent dismisses.
 *
 * Uses the terracotta+paper token system (panel-locked 2026-05-07).
 * Severity colors map to tokens.color.semantic.* (warn/bad) and
 * tokens.color.brand.accent (CONFIRM/OK).
 *
 * @derives(master-plan §G)
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

import type { DecisionCardData } from '../lib/chat-api';
import { applyDecisionCard } from '../lib/chat-api';
import { humanizeDayMask } from '../lib/format';

/** UUID regex — values matching this pattern are internal refs, not user-readable */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Human-readable labels for known camelCase field keys */
const FIELD_LABELS: Record<string, string> = {
  shiftStart: 'Shift starts',
  shiftEnd: 'Shift ends',
  dayMask: 'Days',
  validFrom: 'Start date',
  validUntil: 'End date',
  oneOffDate: 'Date',
};

type Props = {
  chatMessageId: string;
  card: NonNullable<DecisionCardData>;
  onApplied?: () => void;
  onCancelled?: () => void;
};

export function DecisionCard({ chatMessageId, card, onApplied, onCancelled }: Props) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const severity = card.severity ?? 'CONFIRM';
  const borderColor =
    severity === 'WARN'
      ? tokens.color.semantic.warn
      : severity === 'BLOCKED'
        ? tokens.color.semantic.bad
        : tokens.color.brand.accent;

  if (applied) {
    return (
      <View style={[s.card, { borderColor: tokens.color.semantic.ok }]}>
        <Text style={[s.appliedText, { color: tokens.color.semantic.ok }]}>✓ Applied</Text>
      </View>
    );
  }

  const onApply = async () => {
    if (!card.toolName) return;
    setApplying(true);
    setError(null);
    try {
      await applyDecisionCard({
        chatMessageId,
        toolName: card.toolName,
        toolInput: card.fields ?? {},
      });
      setApplied(true);
      onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
      setApplying(false);
    }
  };

  return (
    <View style={[s.card, { borderColor }]}>
      {card.title && <Text style={s.title}>{card.title}</Text>}
      {card.description && <Text style={s.description}>{card.description}</Text>}

      {card.fields && Object.keys(card.fields).length > 0 && (
        <View style={s.fieldsTable}>
          {Object.entries(card.fields)
            .filter(([, value]) => !UUID_RE.test(String(value ?? '')))
            .map(([key, value]) => {
              const label = FIELD_LABELS[key] ?? key;
              const display =
                value === null && key === 'validUntil'
                  ? 'Open-ended'
                  : key === 'dayMask' && typeof value === 'string'
                    ? humanizeDayMask(value)
                    : String(value ?? '');
              return (
                <View key={key} style={s.fieldRow}>
                  <Text style={s.fieldKey}>{label}</Text>
                  <Text style={s.fieldValue}>{display}</Text>
                </View>
              );
            })}
        </View>
      )}

      {error && <Text style={s.error}>{error}</Text>}

      <View style={s.buttons}>
        <Pressable style={s.cancelBtn} onPress={() => onCancelled?.()} disabled={applying}>
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
        {severity !== 'BLOCKED' && (
          <Pressable
            style={[s.applyBtn, applying && s.applyBtnDisabled]}
            onPress={onApply}
            disabled={applying}
          >
            {applying ? (
              <ActivityIndicator color={tokens.color.surface.paper} />
            ) : (
              <Text style={s.applyText}>Apply</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
    marginVertical: tokens.space[2],
    backgroundColor: tokens.color.surface.card,
  },
  title: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[1],
  },
  description: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[3],
  },
  fieldsTable: { marginBottom: tokens.space[3] },
  fieldRow: { flexDirection: 'row', paddingVertical: tokens.space[1] },
  fieldKey: {
    flex: 1,
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  fieldValue: {
    flex: 2,
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.primary,
  },
  buttons: { flexDirection: 'row', gap: tokens.space[2], justifyContent: 'flex-end' },
  cancelBtn: {
    paddingVertical: tokens.space[2] + 2,
    paddingHorizontal: tokens.space[4] + 2,
    borderRadius: tokens.radius.r2,
    borderWidth: 1,
    borderColor: tokens.color.surface.paper3,
  },
  cancelText: {
    color: tokens.color.ink.secondary,
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  applyBtn: {
    paddingVertical: tokens.space[2] + 2,
    paddingHorizontal: tokens.space[5],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.brand.accent,
  },
  applyBtnDisabled: { opacity: 0.6 },
  applyText: {
    color: tokens.color.surface.paper,
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
  },
  error: {
    color: tokens.color.semantic.bad,
    fontSize: tokens.type.bodySm.size,
    marginBottom: tokens.space[2],
  },
  appliedText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
    textAlign: 'center',
  },
});
