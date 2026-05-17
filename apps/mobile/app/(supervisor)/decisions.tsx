/**
 * Decisions tab — supervisor's pending-decision queue.
 *
 * Fetches `GET /supervisor/decisions` on mount, groups rows by section
 * (NEEDS_YOU_NOW / ROUTINE / FAILED_REVIEW), and renders a SectionHeader +
 * DecisionCard for each. Dismiss calls `POST /supervisor/decisions/:id/dismiss`
 * and invalidates the query so the row disappears optimistically.
 *
 * Real-world context (Layer A from the scenarios doc):
 *   Where: mid-morning lull, HR escalation push, end-of-day sweep
 *   When:  ~9:30–11 AM daily; right after chat capture; end-of-day
 *   Why:   priority queue for what needs the supervisor RIGHT NOW
 *
 * Per R6 reference (`docs/prototypes/supervisor-mobile-r6/project/src/decisions.jsx`):
 *   - TopAppBar: subtitle "DECISIONS WORKSPACE" (terracotta) + "{N} pending" title
 *   - Three section buckets: NEEDS YOU NOW / ROUTINE / FAILED·REVIEW
 *   - Full card form for all sections (ultra-compact row is follow-up polish)
 *   - EMPLOYMENT tier: typed-phrase confirm before action
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useCallback } from 'react';
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
const SECTION_ORDER: DecisionSectionT[] = ['NEEDS_YOU_NOW', 'ROUTINE', 'FAILED_REVIEW'];

// ---------------------------------------------------------------------------
// DecisionsScreen
// ---------------------------------------------------------------------------

/**
 * Decisions workspace — the priority queue for supervisor actions.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export default function DecisionsScreen() {
  const q = useDecisionsQuery();
  const dismiss = useDismissDecision();
  const strings = useLocaleStrings();

  const onRefresh = useCallback(() => {
    void q.refetch();
  }, [q]);

  const handleDismiss = useCallback(
    (id: string) => {
      dismiss.mutate(id);
    },
    [dismiss],
  );

  // Group rows by section
  const bySection: Record<DecisionSectionT, DecisionRowT[]> = {
    NEEDS_YOU_NOW: [],
    ROUTINE: [],
    FAILED_REVIEW: [],
  };
  for (const row of q.data?.rows ?? []) {
    bySection[row.section].push(row);
  }

  const total = q.data?.counts.total ?? 0;
  const titleText = total === 0 ? 'All caught up' : `${total} pending`;

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
              const isFaded = section === 'FAILED_REVIEW';
              return (
                <View key={section} style={s.section}>
                  <SectionHeader section={section} count={rows.length} />
                  <FlatList
                    data={rows}
                    keyExtractor={(row) => row.id}
                    renderItem={({ item }) => (
                      <DecisionCard
                        row={item}
                        faded={isFaded}
                        onDismiss={handleDismiss}
                        isDismissing={dismissingId === item.id}
                      />
                    )}
                    scrollEnabled={false}
                    initialNumToRender={rows.length}
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
