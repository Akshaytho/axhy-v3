/**
 * Updates tab — HR compliance digests + 5-word own-voice acknowledgement.
 *
 * Fetches `GET /supervisor/updates` on mount. Splits the response into:
 *   NEEDS YOUR ACK — updates requiring ack that the caller hasn't yet acked.
 *   RECENT · ACKNOWLEDGED — updates the caller acked in the last 30 days.
 *
 * Ack flow: user expands a card, types 5+ words in their own voice, taps
 * "Acknowledge". POST /supervisor/updates/:id/acknowledge fires. On success,
 * the query is invalidated and the card moves to the RECENT section. On
 * failure, an honest error line renders inside the card — never fakes success.
 *
 * Real-world context:
 *   Where: glanced at after a push notification from HR, or end-of-shift sweep
 *   When:  policy changes, training pings, safety notices
 *   Why:   typed-words ack creates a compliance trail without admin overhead
 *
 * Per R6 reference (`docs/prototypes/supervisor-mobile-r6/project/src/updates.jsx`):
 *   - TopAppBar subtitle "HR · COMPANY-WIDE" (terracotta), title "{N} updates"
 *   - "{N} new" red pill badge near the title when needsAck > 0
 *   - NEEDS YOUR ACK section header + UpdateCard list
 *   - RECENT · ACKNOWLEDGED section header + UpdateCard list (acknowledged state)
 *   - All-caught-up empty state when needsAck = 0
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12)
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@axhy/ui-tokens';

import { TopAppBar } from '../../components/today/TopAppBar';
import { UpdateCard } from '../../components/updates/UpdateCard';
import { useHRUpdatesQuery, useAckHRUpdate } from '../../lib/queries/use-hr-updates';

// ---------------------------------------------------------------------------
// Section label component
// ---------------------------------------------------------------------------

/** Monospace section header — matches R6 "NEEDS YOUR ACK" / "RECENT · ACKNOWLEDGED" styling. */
function SectionLabel({ label }: { label: string }) {
  return <Text style={sl.label}>{label}</Text>;
}

const sl = StyleSheet.create({
  label: {
    fontSize: tokens.type.caption.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.caption.size * 0.06,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
});

// ---------------------------------------------------------------------------
// UpdatesScreen
// ---------------------------------------------------------------------------

/**
 * Updates tab screen — wires the HR updates feed to the UI.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12)
 */
export default function UpdatesScreen() {
  const q = useHRUpdatesQuery();
  const ackMutation = useAckHRUpdate();

  // Track which card is expanded (null = none).
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    // Default: open the first unacked card.
    return q.data?.needsAck[0]?.id ?? null;
  });

  // Per-card ack error messages (id → error text).
  const [ackErrors, setAckErrors] = useState<Record<string, string>>({});

  const onRefresh = useCallback(() => {
    void q.refetch();
  }, [q]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleAck = useCallback(
    (id: string, text: string) => {
      // Clear any prior error for this card before the new attempt.
      setAckErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      ackMutation.mutate(
        { id, text },
        {
          onSuccess: () => {
            // Collapse the card after a successful ack so the feed
            // shows the moved card in recentAcked without it staying open.
            setExpandedId(null);
          },
          onError: (err) => {
            const msg = err instanceof Error ? err.message : 'Acknowledgement failed. Try again.';
            setAckErrors((prev) => ({ ...prev, [id]: msg }));
          },
        },
      );
    },
    [ackMutation],
  );

  // Cluster 2 fix (QA-walkthrough 2026-05-18): distinguish "loading"
  // (data === undefined) from "loaded and empty" so the header doesn't
  // say "You're all caught up" while the body shows "Loading updates…".
  const needsAckCount = q.data?.counts.needsAck;
  const titleText =
    needsAckCount === undefined
      ? 'Updates'
      : needsAckCount === 0
        ? "You're all caught up"
        : `${needsAckCount} update${needsAckCount === 1 ? '' : 's'}`;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {/* ── TopAppBar with count badge ── */}
      <View style={s.appBar}>
        <TopAppBar title={titleText} subtitle="HR · COMPANY-WIDE" />
        {needsAckCount !== undefined && needsAckCount > 0 && (
          <View style={s.newBadge}>
            <Text style={s.newBadgeText}>{needsAckCount} new</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching && !q.isLoading}
            onRefresh={onRefresh}
            tintColor={tokens.color.brand.accent}
          />
        }
      >
        {/* ── Loading ── */}
        {q.isLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={tokens.color.brand.accent} />
            <Text style={s.loadingText}>Loading updates…</Text>
          </View>
        ) : q.isError ? (
          /* ── Error ── */
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Could not load updates</Text>
            <Text style={s.errorBody}>
              {q.error instanceof Error ? q.error.message : 'Network problem. Pull to retry.'}
            </Text>
          </View>
        ) : (
          <>
            {/* ── NEEDS YOUR ACK section ── */}
            {(q.data?.needsAck.length ?? 0) > 0 && (
              <View style={s.section}>
                <SectionLabel label="NEEDS YOUR ACK" />
                {q.data!.needsAck.map((row) => (
                  <UpdateCard
                    key={row.id}
                    row={row}
                    expanded={expandedId === row.id}
                    onToggle={() => handleToggle(row.id)}
                    onAck={handleAck}
                    isAcking={
                      ackMutation.isPending &&
                      (ackMutation.variables as { id: string } | undefined)?.id === row.id
                    }
                    ackError={ackErrors[row.id] ?? null}
                  />
                ))}
              </View>
            )}

            {/* ── RECENT · ACKNOWLEDGED section ── */}
            {(q.data?.recentAcked.length ?? 0) > 0 && (
              <View style={s.section}>
                <SectionLabel label="RECENT · ACKNOWLEDGED" />
                {q.data!.recentAcked.map((row) => (
                  <UpdateCard
                    key={row.id}
                    row={row}
                    expanded={expandedId === row.id}
                    onToggle={() => handleToggle(row.id)}
                    onAck={handleAck}
                  />
                ))}
              </View>
            )}

            {/* ── Empty / all caught up ── */}
            {/* Cluster 2 fix: only show empty state after data loaded. */}
            {q.data !== undefined && needsAckCount === 0 && q.data.recentAcked.length === 0 && (
              <View style={s.emptyCard}>
                <Text style={s.emptyCheck}>✓</Text>
                <Text style={s.emptyTitle}>All caught up</Text>
                <Text style={s.emptyBody}>
                  HR will push policy changes and training notices here. You read them, then write 5
                  or more words in your own voice as your compliance acknowledgement.
                </Text>
              </View>
            )}

            {/* All-acked (needsAck=0 but recentAcked present) hint */}
            {q.data !== undefined && needsAckCount === 0 && q.data.recentAcked.length > 0 && (
              <View style={s.allCaughtUpHint}>
                <Text style={s.allCaughtUpText}>No new updates to acknowledge.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  appBar: {
    position: 'relative',
  },
  newBadge: {
    position: 'absolute',
    // Positioned to float next to the title in the TopAppBar row.
    // The TopAppBar center content starts after the 36px menu icon + 6px padding.
    // A rough right-of-title position is achieved via right: 64 (search + bell icons).
    right: 64,
    top: '50%',
    marginTop: -9,
    backgroundColor: tokens.color.semantic.bad,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: String(tokens.weight.bold) as '700',
    fontFamily: tokens.font.mono,
    color: tokens.color.surface.card,
    letterSpacing: 0.04 * 11,
  },
  scroll: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 14,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: tokens.color.ink.tertiary,
  },
  errorCard: {
    backgroundColor: tokens.color.semantic.badSoft,
    borderLeftWidth: 4,
    borderLeftColor: tokens.color.semantic.bad,
    borderRadius: tokens.radius.r2,
    padding: 14,
  },
  errorTitle: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.semantic.bad,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  errorBody: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyCheck: {
    fontSize: 32,
    marginBottom: 8,
    color: tokens.color.semantic.ok,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    lineHeight: 13 * 1.45,
    textAlign: 'center',
  },
  allCaughtUpHint: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  allCaughtUpText: {
    fontSize: 13,
    color: tokens.color.ink.tertiary,
    fontStyle: 'italic',
  },
});
