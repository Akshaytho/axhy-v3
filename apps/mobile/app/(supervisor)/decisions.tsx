/**
 * Decisions tab — supervisor's pending-decision queue.
 *
 * Fetches `GET /supervisor/decisions` on mount, groups rows by section
 * (NEEDS_YOU_NOW / ROUTINE / FAILED_REVIEW), and renders a SectionHeader +
 * DecisionCard for each.
 *
 * Wave 2 Sprint 2 (2026-05-18) extensions:
 *   - **Deep-link `?focus=<id>`** — when the screen mounts with a `focus`
 *     query param (e.g. drawer entries pushing here from Updates, Today,
 *     or chat amend mode), the matching card scrolls into view and a
 *     1.2-sec amber flash highlight plays on the card to confirm the
 *     navigation landed where the supervisor expected.
 *   - **Deep-link `?amendDecisionId=<id>`** — sibling param signalling that
 *     the supervisor arrived from chat's amend-mode banner. The matching
 *     row's amber "Amending decision: <kind>" banner renders on top of
 *     the card. Server marks `payload.amendable=true` to gate this.
 *   - Server-driven action footer rendering moved into `DecisionCard.tsx`
 *     via `row.actions[]`. Dismiss-only fallback preserved for any row
 *     whose backend builder has not yet been action-ised.
 *
 * Real-world context (Layer A from the scenarios doc):
 *   Where: mid-morning lull, HR escalation push, end-of-day sweep
 *   When:  ~9:30–11 AM daily; right after chat capture; end-of-day
 *   Why:   priority queue for what needs the supervisor RIGHT NOW
 *
 * Per R6 reference (`docs/prototypes/supervisor-mobile-r6/project/src/decisions.jsx`):
 *   - TopAppBar: subtitle "DECISIONS WORKSPACE" (terracotta) + "{N} pending" title
 *   - Three section buckets: NEEDS YOU NOW / ROUTINE / FAILED·REVIEW
 *   - Full card form for all sections
 *
 * @derives(Wave 2 plan §3 — DecisionCard variants + deep-link)
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';
import type { DecisionRowT, DecisionSectionT } from '@axhy/shared-schema';

import { TopAppBar } from '../../components/today/TopAppBar';
import { SectionHeader } from '../../components/decisions/SectionHeader';
import { DecisionCard } from '../../components/decisions/DecisionCard';
import { useDecisionsQuery, useDismissDecision } from '../../lib/queries/use-decisions';
import { useLocaleStrings } from '../../lib/i18n/use-locale';

// ---------------------------------------------------------------------------
// Section ordering — rendered in this priority order
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
const SECTION_ORDER: DecisionSectionT[] = ['NEEDS_YOU_NOW', 'ROUTINE', 'STALE', 'FAILED_REVIEW'];

// ---------------------------------------------------------------------------
// Deep-link param parser
// ---------------------------------------------------------------------------

/**
 * Coerces `useLocalSearchParams` output (string | string[] | undefined) into
 * the first matching string. expo-router occasionally returns an array when
 * the same key appears multiple times in the URL; for `focus` and
 * `amendDecisionId` we always take the first value.
 */
function readSingleParam(raw: string | string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw.length > 0 ? raw[0] : undefined;
  return raw;
}

// ---------------------------------------------------------------------------
// DecisionsScreen
// ---------------------------------------------------------------------------

/**
 * Decisions workspace — the priority queue for supervisor actions.
 *
 * @derives(Wave 2 plan §3 — DecisionCard variants + deep-link)
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export default function DecisionsScreen() {
  const q = useDecisionsQuery();
  const dismiss = useDismissDecision();
  const strings = useLocaleStrings();

  const params = useLocalSearchParams<{
    focus?: string | string[];
    amendDecisionId?: string | string[];
  }>();
  const focusId = readSingleParam(params.focus);
  const amendDecisionId = readSingleParam(params.amendDecisionId);

  const onRefresh = useCallback(() => {
    void q.refetch();
  }, [q]);

  const handleDismiss = useCallback(
    (id: string) => {
      dismiss.mutate(id);
    },
    [dismiss],
  );

  // ── Group rows by section (deterministic order from SECTION_ORDER) ─────
  const bySection = useMemo<Record<DecisionSectionT, DecisionRowT[]>>(() => {
    const grouped: Record<DecisionSectionT, DecisionRowT[]> = {
      NEEDS_YOU_NOW: [],
      ROUTINE: [],
      STALE: [],
      FAILED_REVIEW: [],
    };
    for (const row of q.data?.rows ?? []) {
      grouped[row.section].push(row);
    }
    return grouped;
  }, [q.data?.rows]);

  // ── Find the section that holds the focused row, so we can scroll its
  // FlatList. FlatLists are independent per section; we keep one ref per
  // section so the scroll call lands on the right one. ───────────────────
  const flatListRefs = useRef<Partial<Record<DecisionSectionT, FlatList<DecisionRowT> | null>>>({});

  useEffect(() => {
    if (focusId === undefined) return;
    if (q.data === undefined) return;
    // Locate the section holding the focused row.
    for (const section of SECTION_ORDER) {
      const rows = bySection[section];
      const index = rows.findIndex((r) => r.id === focusId);
      if (index < 0) continue;
      const flatList = flatListRefs.current[section];
      if (flatList === undefined || flatList === null) return;
      // scrollToIndex never throws on web; on native we wrap in setTimeout
      // to wait for the FlatList layout pass to complete.
      const handle = setTimeout(() => {
        try {
          flatList.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
        } catch {
          // scrollToIndex on a not-yet-measured row throws; ignore — the
          // user can still see the flash highlight and pull-to-refresh.
        }
      }, 80);
      return () => clearTimeout(handle);
    }
    return;
  }, [focusId, q.data, bySection]);

  // Cluster 2 fix (QA-walkthrough 2026-05-18): empty-state guard must
  // distinguish "still loading" from "loaded and empty". The previous
  // `?? 0` collapsed `undefined` → 0 → "All caught up" header even
  // while the body said "Loading decisions…". Now: title says the
  // generic name while data is undefined; only switches to "All caught
  // up" / "N pending" once we KNOW the count.
  const total = q.data?.counts.total;
  const titleText =
    total === undefined ? 'Decisions' : total === 0 ? 'All caught up' : `${total} pending`;

  // dismissingId tracks the one row whose dismiss is in flight so DecisionCard
  // can render its loading indicator without re-checking the whole mutation.
  const dismissingId = dismiss.isPending ? (dismiss.variables as string | undefined) : undefined;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar title={titleText} subtitle={strings.decisions.title.toUpperCase()} />

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
        {/* Loading state */}
        {q.isLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={tokens.color.brand.accent} />
            <Text style={s.loadingText}>Loading decisions…</Text>
          </View>
        ) : q.isError ? (
          /* Error state */
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Could not load decisions</Text>
            <Text style={s.errorBody}>
              {q.error instanceof Error ? q.error.message : 'Network problem. Pull to retry.'}
            </Text>
          </View>
        ) : total === 0 ? (
          /* Empty / all-caught-up state */
          <View style={s.emptyCard}>
            <Text style={s.emptyCheck}>✓</Text>
            <Text style={s.emptyTitle}>All caught up</Text>
            <Text style={s.emptyBody}>
              No pending decisions right now. When AI extracts decisions from your chat, or HR
              routes one to you, they appear here in priority order.
            </Text>
          </View>
        ) : (
          /* Section list — each section's cards are in a FlatList so
             React Native only renders visible cards on long queues. */
          <>
            {SECTION_ORDER.map((section) => {
              const rows = bySection[section];
              if (rows.length === 0) return null;
              // STALE items stay actionable but lose visual urgency (no red
              // border). FAILED_REVIEW is a different lane entirely.
              const isFaded = section === 'FAILED_REVIEW' || section === 'STALE';
              return (
                <View key={section} style={s.section}>
                  <SectionHeader section={section} count={rows.length} />
                  <FlatList
                    ref={(ref) => {
                      flatListRefs.current[section] = ref;
                    }}
                    data={rows}
                    keyExtractor={(row) => row.id}
                    renderItem={({ item }) => (
                      <DecisionCard
                        row={item}
                        faded={isFaded}
                        onDismiss={handleDismiss}
                        isDismissing={dismissingId === item.id}
                        focused={focusId === item.id}
                        amendActive={amendDecisionId === item.id}
                      />
                    )}
                    scrollEnabled={false}
                    initialNumToRender={rows.length}
                    // Best-effort fallback for scrollToIndex on unmeasured rows.
                    onScrollToIndexFailed={(info) => {
                      const flatList = flatListRefs.current[section];
                      if (flatList === undefined || flatList === null) return;
                      const wait = new Promise((resolve) => setTimeout(resolve, 200));
                      void wait.then(() => {
                        try {
                          flatList.scrollToIndex({ index: info.index, animated: true });
                        } catch {
                          // give up silently — the flash highlight still plays
                        }
                      });
                    }}
                  />
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
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
});
