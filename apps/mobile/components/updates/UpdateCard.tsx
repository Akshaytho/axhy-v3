/**
 * UpdateCard — R6-faithful HR update card for the Updates tab.
 *
 * Unacknowledged state:
 *   - Terracotta left border (3px) to signal "needs your attention".
 *   - Title + body excerpt (collapsed by default; tap header to expand).
 *   - Expanded footer: "In your own words" label + TextInput + word counter
 *     ("{N}/5 WORDS") + "Acknowledge" button (terracotta, disabled until ≥5 words).
 *   - On POST failure: shows an honest error line below the button (never fakes success).
 *
 * Acknowledged state:
 *   - No left border.
 *   - Quoted ack text in a green-tinted footer.
 *   - Relative timestamp next to the quote.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12)
 */

import { memo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { HRUpdateRowT } from '@axhy/shared-schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Counts whitespace-delimited words in a string. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** Formats an ISO timestamp as a short relative-or-absolute string. */
function formatAckedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${Math.max(diffMin, 1)} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// UpdateCard
// ---------------------------------------------------------------------------

/**
 * Props for the UpdateCard component.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export type UpdateCardProps = {
  /** The HR update row from the API response. */
  row: HRUpdateRowT;
  /** Whether the card body + ack input are expanded. */
  expanded: boolean;
  /** Called when the user taps the card header to toggle expand. */
  onToggle: () => void;
  /** Called when the user submits their 5-word acknowledgement text. */
  onAck: (id: string, text: string) => void;
  /** True while the ack POST is in-flight. */
  isAcking?: boolean;
  /** Error message to display when the ack POST fails. Null on success or no attempt. */
  ackError?: string | null;
};

/**
 * HR update card — renders the unacknowledged and acknowledged states.
 * Wrapped in React.memo so the feed doesn't re-render every card when only
 * one card's acking state or draft text changes.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12)
 */
export const UpdateCard = memo(function UpdateCard({
  row,
  expanded,
  onToggle,
  onAck,
  isAcking = false,
  ackError = null,
}: UpdateCardProps) {
  const [draft, setDraft] = useState('');
  const words = countWords(draft);
  const ready = words >= 5;

  return (
    <View style={[s.card, !row.acknowledged && s.cardUnacked]}>
      {/* ── Header — always visible, tap to toggle ── */}
      <Pressable
        style={({ pressed }) => [s.header, pressed && s.headerPressed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse HR update' : 'Expand HR update'}
      >
        <View style={s.headerTop}>
          <Text style={s.metaLine}>HR</Text>
          {!row.acknowledged ? (
            <View style={s.unreadBadge}>
              <Text style={s.unreadBadgeText}>UNREAD</Text>
            </View>
          ) : (
            <View style={s.ackedBadge}>
              <Text style={s.ackedBadgeText}>ACK</Text>
            </View>
          )}
        </View>
        <Text style={s.title}>{row.title}</Text>
        {/* Body excerpt always visible (first 120 chars) */}
        {!expanded && (
          <Text style={s.bodyExcerpt} numberOfLines={2}>
            {row.body}
          </Text>
        )}
      </Pressable>

      {/* ── Expanded body ── */}
      {expanded && (
        <View style={s.bodyContainer}>
          <Text style={s.body}>{row.body}</Text>
        </View>
      )}

      {/* ── Ack input footer (unacknowledged + expanded) ── */}
      {!row.acknowledged && expanded && (
        <View style={s.ackFooter}>
          <Text style={s.ackLabel}>IN YOUR OWN WORDS — WHAT WILL YOU DO?</Text>
          <TextInput
            style={s.ackInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write at least 5 words in your own voice…"
            placeholderTextColor={tokens.color.ink.placeholder}
            multiline
            numberOfLines={3}
            autoCorrect
            accessibilityLabel="Acknowledgement text"
          />
          <View style={s.ackMeta}>
            <Text style={[s.wordCounter, ready && s.wordCounterReady]}>
              {words}/5 WORDS{ready ? ' ✓' : ''}
            </Text>
            <Pressable
              style={[s.ackBtn, (!ready || isAcking) && s.ackBtnDisabled]}
              onPress={() => ready && !isAcking && onAck(row.id, draft)}
              disabled={!ready || isAcking}
              accessibilityRole="button"
              accessibilityLabel="Acknowledge HR update"
            >
              {isAcking ? (
                <ActivityIndicator color={tokens.color.surface.card} size="small" />
              ) : (
                <Text style={s.ackBtnText}>Acknowledge</Text>
              )}
            </Pressable>
          </View>
          {ackError != null && ackError.length > 0 ? (
            <Text style={s.ackError}>{ackError}</Text>
          ) : null}
        </View>
      )}

      {/* ── Quoted ack text footer (acknowledged) ── */}
      {row.acknowledged && row.ackText != null && (
        <View style={s.ackedFooter}>
          <Text style={s.ackedFooterLabel}>YOUR ACK</Text>
          <Text style={s.ackedQuote}>"{row.ackText}"</Text>
          {row.ackedAt != null ? (
            <Text style={s.ackedTimestamp}>{formatAckedAt(row.ackedAt)}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderLeftWidth: 1,
    borderRadius: tokens.radius.r3,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardUnacked: {
    borderLeftWidth: 3,
    borderLeftColor: tokens.color.brand.accent,
  },
  header: {
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  headerPressed: {
    backgroundColor: tokens.color.surface.paper2,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metaLine: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.monoSm.size * 0.04,
    textTransform: 'uppercase',
  },
  unreadBadge: {
    backgroundColor: tokens.color.semantic.badSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  unreadBadgeText: {
    fontSize: 9,
    fontWeight: String(tokens.weight.bold) as '700',
    fontFamily: tokens.font.mono,
    color: tokens.color.semantic.bad,
    letterSpacing: 0.04 * 9,
    textTransform: 'uppercase',
  },
  ackedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ackedBadgeText: {
    fontSize: 10,
    fontWeight: String(tokens.weight.bold) as '700',
    fontFamily: tokens.font.mono,
    color: tokens.color.semantic.ok,
    letterSpacing: 0.04 * 10,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    lineHeight: 16 * 1.3,
    marginBottom: 4,
  },
  bodyExcerpt: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    lineHeight: 13 * 1.4,
  },
  bodyContainer: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  body: {
    fontSize: 14,
    color: tokens.color.ink.secondary,
    lineHeight: 14 * 1.45,
  },
  ackFooter: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper2,
  },
  ackLabel: {
    fontSize: tokens.type.caption.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.caption.size * 0.04,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  ackInput: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: tokens.color.ink.primary,
    lineHeight: 14 * 1.4,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  ackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordCounter: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.placeholder,
    letterSpacing: tokens.type.monoSm.size * 0.04,
    textTransform: 'uppercase',
  },
  wordCounterReady: {
    color: tokens.color.semantic.ok,
  },
  ackBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  ackBtnDisabled: {
    backgroundColor: tokens.color.surface.paper3,
  },
  ackBtnText: {
    fontSize: 13,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.surface.card,
  },
  ackError: {
    marginTop: 8,
    fontSize: 13,
    color: tokens.color.semantic.bad,
    lineHeight: 13 * 1.4,
  },
  ackedFooter: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.semantic.okSoft,
  },
  ackedFooterLabel: {
    fontSize: tokens.type.caption.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.ok,
    letterSpacing: tokens.type.caption.size * 0.04,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  ackedQuote: {
    fontSize: 14,
    fontStyle: 'italic',
    color: tokens.color.ink.secondary,
    lineHeight: 14 * 1.45,
    marginBottom: 4,
  },
  ackedTimestamp: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.monoSm.size * 0.04,
  },
});
