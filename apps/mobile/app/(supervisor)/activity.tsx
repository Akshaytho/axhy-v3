/**
 * Activity tab — supervisor's recent actions feed.
 *
 * Reads `/supervisor/activity` (which itself reads AuditEvent rows
 * authored by the caller). Renders R6's "{N} EVENTS · ACTIVITY · PROOF"
 * eyebrow + filter chips + chronological row list. Row tap is a stub
 * for now (Share to WhatsApp + Reverse will land with the routing slice).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useCallback } from 'react';
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
import { useActivityQuery } from '../../lib/queries/use-activity';

const FILTER_CHIPS = ['Today', 'Yesterday', 'This week', 'All sites'] as const;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ActivityScreen() {
  const q = useActivityQuery();
  const onRefresh = useCallback(() => {
    void q.refetch();
  }, [q]);

  const rows = q.data?.rows ?? [];
  const totalLabel = rows.length === 1 ? '1 EVENT' : `${rows.length} EVENTS`;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar title="Activity" subtitle={totalLabel + ' · PROOF'} />

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
        <View style={s.chipRow}>
          {FILTER_CHIPS.map((c) => (
            <View key={c} style={s.chip}>
              <Text style={s.chipText}>{c}</Text>
            </View>
          ))}
        </View>

        {q.isLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={tokens.color.brand.accent} />
            <Text style={s.loadingText}>Loading activity…</Text>
          </View>
        ) : q.isError ? (
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Could not load activity</Text>
            <Text style={s.errorBody}>
              {q.error instanceof Error ? q.error.message : 'Network problem. Pull to retry.'}
            </Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>Nothing logged yet</Text>
            <Text style={s.emptyBody}>
              When you act — mark a worker absent, approve a leave, log a complaint — it shows up
              here. You can share any row to WhatsApp or reverse it within 30 minutes (coming with
              the routing slice).
            </Text>
          </View>
        ) : (
          <View>
            {rows.map((row) => (
              <View key={row.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.summary}>{row.summary}</Text>
                  <Text style={s.meta}>
                    {row.kind.replaceAll('_', ' ').toLowerCase()} · {formatRelative(row.when)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface.paper },
  scroll: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 100,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: tokens.color.surface.paper3,
    borderRadius: tokens.radius.r1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
    letterSpacing: 0.4,
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
    fontSize: 11,
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
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: 20,
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
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    lineHeight: 14 * 1.4,
  },
  meta: {
    fontSize: 11,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
});
