/**
 * Summary — end-of-day digest secondary surface.
 *
 * Per R6, Summary is a SECONDARY surface reached from Today or a
 * notification at end-of-shift. `_layout.tsx` hides it from the tab bar
 * via `href: null` while keeping the route navigable.
 *
 * Layout per R6 prototype (`docs/prototypes/supervisor-mobile-r6/project/src/summary.jsx`):
 *   TopAppBar subtitle "{WEEKDAY} · END OF DAY" + title "Today's summary"
 *   2×2 tile grid: CHANGES TODAY / FLAGGED / LEAVE PENDING / TOMORROW · ROSTER
 *   Timeline section: chronological audit events with time
 *   Wages this week card: placeholder ("Wages computed at end of week")
 *   "I'm done for today" CTA that navigates back to Today
 *
 * Data path: useSummaryQuery → GET /supervisor/summary.
 *
 * No fake success: the "I'm done for today" button calls router.push to Today —
 * no toast, no modal, no state change.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12) — Summary tab
 */

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { SummaryTimelineEntryT } from '@axhy/shared-schema';

import { useSummaryQuery } from '../../lib/queries/use-summary';
import { TopAppBar } from '../../components/today/TopAppBar';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export default function SummaryScreen() {
  const router = useRouter();
  const summary = useSummaryQuery();

  const subtitle = summary.data
    ? `${summary.data.weekday.toUpperCase()} · END OF DAY`
    : 'END OF DAY';

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar title="Today's summary" subtitle={subtitle} />

      {summary.isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={tokens.color.brand.accent} size="large" />
          <Text style={s.loadingText}>Loading summary…</Text>
        </View>
      ) : summary.isError ? (
        <View style={s.errorCard}>
          <Text style={s.errorTitle}>Could not load summary</Text>
          <Text style={s.errorBody}>
            {summary.error instanceof Error
              ? summary.error.message
              : 'Network problem. Pull to retry.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* 2×2 metric tile grid */}
          <View style={s.tileGrid}>
            <MetricTile
              label="CHANGES TODAY"
              value={summary.data?.changesToday ?? 0}
              sub="atomic batches"
              tone="accent"
            />
            <MetricTile
              label="FLAGGED"
              value={summary.data?.flagged ?? 0}
              sub="needs review"
              tone="warn"
            />
            <MetricTile
              label="LEAVE PENDING"
              value={summary.data?.leavePending ?? 0}
              sub="approvals"
              tone="neutral"
            />
            <MetricTile
              label="TOMORROW · ROSTER"
              value={summary.data?.tomorrowRoster ?? 0}
              sub="workers scheduled"
              tone="ok"
            />
          </View>

          {/* Timeline section */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>TIMELINE</Text>
          </View>

          {summary.data?.timeline.length === 0 ? (
            <View style={s.emptyTimeline}>
              <Text style={s.emptyTimelineText}>No events recorded today.</Text>
            </View>
          ) : (
            <View style={s.timelineCard}>
              {(summary.data?.timeline ?? []).map((entry, i) => (
                <TimelineRow
                  key={entry.id}
                  entry={entry}
                  isLast={i === (summary.data?.timeline.length ?? 0) - 1}
                />
              ))}
            </View>
          )}

          {/* Wages this week — placeholder per spec (v0 deferred) */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>WAGES THIS WEEK</Text>
          </View>
          <View style={s.wagesCard}>
            <Feather name="clock" size={16} color={tokens.color.ink.tertiary} style={s.wagesIcon} />
            <Text style={s.wagesText}>Wages computed at end of week</Text>
          </View>

          {/* "I'm done for today" CTA — navigates to Today, no state change */}
          <Pressable
            style={({ pressed }) => [s.doneCta, pressed && s.doneCtaPressed]}
            onPress={() => router.push('/(supervisor)/today')}
            accessibilityRole="button"
            accessibilityLabel="Done for today"
          >
            <Feather name="moon" size={16} color={tokens.color.surface.card} />
            <Text style={s.doneCtaText}>I'm done for today</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

type Tone = 'accent' | 'warn' | 'ok' | 'neutral';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
function MetricTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: Tone;
}) {
  const toneColor: Record<Tone, string> = {
    accent: tokens.color.brand.accent,
    warn: tokens.color.semantic.warn,
    ok: tokens.color.semantic.ok,
    neutral: tokens.color.ink.primary,
  };

  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={[s.tileValue, { color: toneColor[tone] }]}>{value}</Text>
      <Text style={s.tileSub}>{sub}</Text>
    </View>
  );
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
function TimelineRow({ entry, isLast }: { entry: SummaryTimelineEntryT; isLast: boolean }) {
  const time = formatTime(entry.when);
  return (
    <View style={[s.timelineRow, !isLast && s.timelineRowBorder]}>
      <View style={s.timelineDot} />
      <Text style={s.timelineSummary} numberOfLines={2}>
        {entry.summary}
      </Text>
      <Text style={s.timelineTime}>{time}</Text>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface.paper },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[3],
  },
  loadingText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
  },

  errorCard: {
    margin: tokens.space[5],
    backgroundColor: tokens.color.semantic.badSoft,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
  },
  errorTitle: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.bad,
    marginBottom: tokens.space[1],
  },
  errorBody: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.semantic.bad,
    lineHeight: tokens.type.bodySm.size * tokens.type.bodySm.lineHeight,
  },

  scroll: {
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[4],
    paddingBottom: tokens.space[8],
    gap: tokens.space[3],
  },

  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[3],
    marginBottom: tokens.space[2],
  },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
    gap: tokens.space[1],
  },
  tileLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.caption.size * tokens.type.caption.tracking,
    textTransform: 'uppercase',
  },
  tileValue: {
    fontSize: tokens.type.display.size,
    fontWeight: String(tokens.weight.bold) as '700',
    lineHeight: tokens.type.display.size * tokens.type.display.lineHeight,
  },
  tileSub: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.placeholder,
  },

  sectionHeader: {
    marginTop: tokens.space[2],
    marginBottom: tokens.space[2],
  },
  sectionLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.caption.size * tokens.type.caption.tracking,
    textTransform: 'uppercase',
  },

  emptyTimeline: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
    alignItems: 'center',
  },
  emptyTimelineText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },

  timelineCard: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    overflow: 'hidden',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
  },
  timelineRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
  },
  timelineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.brand.accent,
    flexShrink: 0,
  },
  timelineSummary: {
    flex: 1,
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.secondary,
    lineHeight: tokens.type.bodySm.size * tokens.type.bodySm.lineHeight,
  },
  timelineTime: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    flexShrink: 0,
    minWidth: 36,
    textAlign: 'right',
  },

  wagesCard: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[3],
  },
  wagesIcon: { flexShrink: 0 },
  wagesText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    flex: 1,
  },

  doneCta: {
    marginTop: tokens.space[4],
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[2],
  },
  doneCtaPressed: { backgroundColor: tokens.color.brand.accent2 },
  doneCtaText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.surface.card,
  },
});
