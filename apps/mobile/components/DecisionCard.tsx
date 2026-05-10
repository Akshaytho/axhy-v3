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

import { ChipPicker } from './ChipPicker';

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
  const [chipReason, setChipReason] = useState<string | null>(null);
  const [chipFreeText, setChipFreeText] = useState<string | null>(null);

  const severity = card.severity ?? 'CONFIRM';
  const cardWithChips = card as NonNullable<DecisionCardData> & {
    presets?: { chips?: { label: string; value: string }[] };
    conflicts?: unknown[];
  };
  const chips = cardWithChips.presets?.chips;
  const requiresChip = severity === 'WARN' && Array.isArray(chips) && chips.length > 0;
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
    if (requiresChip && !chipReason) return;
    setApplying(true);
    setError(null);
    try {
      const enrichedInput = {
        ...(card.fields ?? {}),
        ...(chipReason
          ? {
              overrideReason: chipReason,
              ...(chipFreeText ? { overrideText: chipFreeText } : {}),
            }
          : {}),
      };
      await applyDecisionCard({
        chatMessageId,
        toolName: card.toolName,
        toolInput: enrichedInput,
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
            .filter(([key, value]) => {
              // Hide UUID raw values (those are referenced by name elsewhere).
              if (UUID_RE.test(String(value ?? ''))) return false;
              // Hide rows where the AI didn't capture a real value: null,
              // undefined, empty string, or the placeholder 'unknown' our
              // tool schemas emit when the supervisor didn't specify.
              if (value === null || value === undefined) return false;
              const str = String(value).trim();
              if (str === '' || str.toLowerCase() === 'unknown') return false;
              // validUntil keeps its 'Open-ended' rendering even when null —
              // handled in the display branch below — so let it pass.
              if (key === 'validUntil') return true;
              return true;
            })
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

      {requiresChip && chips && (
        <ChipPicker
          chips={chips}
          onChange={(val, free) => {
            setChipReason(val);
            setChipFreeText(free);
          }}
        />
      )}

      {error && <Text style={s.error}>{error}</Text>}

      <View style={s.buttons}>
        <Pressable style={s.cancelBtn} onPress={() => onCancelled?.()} disabled={applying}>
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
        {severity !== 'BLOCKED' && (
          <Pressable
            style={[s.applyBtn, (applying || (requiresChip && !chipReason)) && s.applyBtnDisabled]}
            onPress={onApply}
            disabled={applying || (requiresChip && !chipReason)}
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
    borderWidth: 1.5,
    borderColor: tokens.color.ink.tertiary,
  },
  cancelText: {
    color: tokens.color.ink.primary,
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
