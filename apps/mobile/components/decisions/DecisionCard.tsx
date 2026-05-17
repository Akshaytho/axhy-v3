/**
 * DecisionCard — full card form for a pending supervisor decision.
 *
 * Renders the R6-faithful card: tier chip + "PENDING {relative-time}" tag
 * in the header row, title (16/600), body (14/regular ink-2), then an
 * action footer with a "Dismiss" button.
 *
 * EMPLOYMENT tier: shows a TYPE-PHRASE instruction line + TextInput +
 * "Confirm" red button, disabled until the typed text matches confirmPhrase
 * exactly (case-sensitive). The standard "Dismiss" button remains.
 *
 * FAILED_REVIEW section: card renders with faded/dimmed appearance.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { memo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { DecisionRowT } from '@axhy/shared-schema';

import { TierChip } from './TierChip';

// ---------------------------------------------------------------------------
// Relative time formatter
// ---------------------------------------------------------------------------

/** Formats an ISO timestamp as "X min ago" / "X hr ago" / "X days ago". */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// Left-border color per tier — drives the left accent stripe on the card
// ---------------------------------------------------------------------------

const TIER_LEFT_BORDER: Record<DecisionRowT['tier'], string> = {
  NOTE: tokens.color.surface.cardEdge,
  OPERATIONAL: tokens.color.semantic.infoInk,
  PERSONNEL: tokens.color.brand.accent,
  EMPLOYMENT: tokens.color.semantic.bad,
  REVIEW: tokens.color.semantic.warn,
};

// ---------------------------------------------------------------------------
// DecisionCard
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type DecisionCardProps = {
  row: DecisionRowT;
  faded?: boolean;
  onDismiss: (id: string) => void;
  isDismissing?: boolean;
};

/**
 * Pending decision card for the Decisions workspace.
 * Wrapped in React.memo so the section list doesn't re-render every card
 * when only one card's dismiss-in-progress state changes.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export const DecisionCard = memo(function DecisionCard({
  row,
  faded = false,
  onDismiss,
  isDismissing = false,
}: DecisionCardProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const isEmployment = row.tier === 'EMPLOYMENT';
  const confirmMatches =
    isEmployment && row.confirmPhrase != null ? confirmInput === row.confirmPhrase : false;

  const leftBorderColor = TIER_LEFT_BORDER[row.tier] ?? tokens.color.surface.cardEdge;

  return (
    <View style={[s.card, { borderLeftColor: leftBorderColor, opacity: faded ? 0.55 : 1 }]}>
      {/* Header row: tier chip left, PENDING tag right */}
      <View style={s.header}>
        <TierChip tier={row.tier} />
        <Text style={s.pendingTag}>PENDING {relativeTime(row.proposedAt)}</Text>
      </View>

      {/* Title */}
      <Text style={s.title}>{row.title}</Text>

      {/* Body */}
      {row.body != null && row.body.length > 0 ? <Text style={s.body}>{row.body}</Text> : null}

      {/* Action footer */}
      <View style={[s.footer, faded && s.footerFaded]}>
        {isEmployment && row.confirmPhrase != null ? (
          <>
            {/* TYPE-phrase instruction */}
            <Text style={s.confirmInstruction}>
              {row.tier} — TYPE '{row.confirmPhrase}' TO CONFIRM
            </Text>

            {/* Phrase text input */}
            <TextInput
              style={s.confirmInput}
              value={confirmInput}
              onChangeText={setConfirmInput}
              placeholder="Type confirmation phrase…"
              placeholderTextColor={tokens.color.ink.placeholder}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={`Type ${row.confirmPhrase} to confirm`}
            />

            {/* Confirm + Dismiss row */}
            <View style={s.btnRow}>
              <Pressable
                style={[s.confirmBtn, !confirmMatches && s.btnDisabled]}
                onPress={() => onDismiss(row.id)}
                disabled={!confirmMatches || isDismissing}
                accessibilityRole="button"
                accessibilityLabel="Confirm"
              >
                {isDismissing ? (
                  <ActivityIndicator color={tokens.color.surface.card} size="small" />
                ) : (
                  <Text style={s.confirmBtnText}>Confirm</Text>
                )}
              </Pressable>
              <Pressable
                style={s.dismissBtn}
                onPress={() => onDismiss(row.id)}
                disabled={isDismissing}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Text style={s.dismissBtnText}>Dismiss</Text>
              </Pressable>
            </View>
          </>
        ) : (
          /* Standard dismiss-only footer */
          <Pressable
            style={[s.dismissBtnFull, isDismissing && s.btnDisabled]}
            onPress={() => onDismiss(row.id)}
            disabled={isDismissing}
            accessibilityRole="button"
            accessibilityLabel="Dismiss decision"
          >
            {isDismissing ? (
              <ActivityIndicator color={tokens.color.ink.tertiary} size="small" />
            ) : (
              <Text style={s.dismissBtnFullText}>Dismiss</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: tokens.radius.r3,
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  pendingTag: {
    fontSize: 10,
    fontWeight: String(tokens.weight.bold) as '700',
    fontFamily: tokens.font.mono,
    color: tokens.color.brand.accent,
    letterSpacing: 0.04 * 10,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    lineHeight: 16 * 1.3,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    fontWeight: String(tokens.weight.regular) as '400',
    color: tokens.color.ink.secondary,
    lineHeight: 14 * 1.4,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper2,
  },
  footerFaded: {
    backgroundColor: tokens.color.surface.paper3,
  },
  confirmInstruction: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.bad,
    letterSpacing: 0.04 * tokens.type.monoSm.size,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  confirmInput: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: tokens.color.ink.primary,
    marginBottom: 8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.semantic.bad,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.card,
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.r2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.tertiary,
  },
  dismissBtnFull: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: tokens.radius.r2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnFullText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.tertiary,
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
