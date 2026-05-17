/**
 * SiteCard — collapsed-by-default site row.
 *
 * Per R6 prototype `today.jsx:180-382`:
 *   - card padding 0, marginBottom 14, overflow hidden
 *   - header row: site name 16/600 + (optional flagged badge) + coverage pill
 *     + mono "{on}/{due}" + "TAP TO VIEW WORKERS →" hint (when collapsed)
 *   - coverage pill: 2px/8px padding, fully rounded (999), fontSize 10/700,
 *     mono font, semantic tone (ok/warn/bad)
 *   - chevron rotates -90° when collapsed → 0° when open
 *   - when open: workers list inside
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodaySiteT, TodayWorkerT } from '@axhy/shared-schema';

import { WorkerRow } from './WorkerRow';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type SiteCardProps = {
  site: TodaySiteT;
  workers: TodayWorkerT[];
  onWorkerPress?: (worker: TodayWorkerT) => void;
};

function coverageTone(site: TodaySiteT): { bg: string; fg: string; label: string } {
  const gap = Math.max(0, site.workersDue - site.workersOn);
  if (gap === 0) {
    return {
      bg: tokens.color.semantic.okSoft,
      fg: tokens.color.semantic.ok,
      label: site.workersDue === 0 ? 'NO ROSTER' : 'FULL',
    };
  }
  const ratio = site.workersDue > 0 ? site.workersOn / site.workersDue : 1;
  if (ratio >= 0.75) {
    return {
      bg: tokens.color.semantic.warnSoft,
      fg: tokens.color.semantic.warn,
      label: gap === 1 ? '1 SHORT' : `${gap} SHORT`,
    };
  }
  return {
    bg: tokens.color.semantic.badSoft,
    fg: tokens.color.semantic.bad,
    label: gap === 1 ? '1 SHORT' : `${gap} SHORT`,
  };
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function SiteCard({ site, workers, onWorkerPress }: SiteCardProps) {
  const [open, setOpen] = useState(false);
  const tone = coverageTone(site);
  const siteWorkers = workers.filter((w) => w.siteId === site.id);

  return (
    <View style={s.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [s.header, pressed && s.headerPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={s.left}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>
              {site.name}
            </Text>
            {site.flagged ? (
              <View style={s.flagPill}>
                <Text style={s.flagPillText}>⚠ FLAG</Text>
              </View>
            ) : null}
          </View>
          <View style={s.metaRow}>
            <View style={[s.coverPill, { backgroundColor: tone.bg }]}>
              <Text style={[s.coverPillText, { color: tone.fg }]}>{tone.label}</Text>
            </View>
            <Text style={s.ratio}>
              {site.workersOn}/{site.workersDue}
            </Text>
            {!open ? <Text style={s.hint}>TAP TO VIEW WORKERS →</Text> : null}
          </View>
        </View>
        <Text style={[s.chevron, open ? s.chevronOpen : null]}>›</Text>
      </Pressable>

      {open ? (
        siteWorkers.length === 0 ? (
          <View style={s.emptyWorkers}>
            <Text style={s.emptyText}>No active workers on this site today.</Text>
          </View>
        ) : (
          <View>
            {siteWorkers.map((w) => (
              <WorkerRow key={w.id} worker={w} onPress={onWorkerPress} />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    marginBottom: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  headerPressed: { backgroundColor: tokens.color.surface.paper2 },
  left: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  flagPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: tokens.color.semantic.warnSoft,
  },
  flagPillText: {
    fontSize: 10,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.warn,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  coverPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  coverPillText: {
    fontSize: 10,
    fontWeight: String(tokens.weight.bold) as '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: tokens.font.mono,
  },
  ratio: {
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    fontFamily: tokens.font.mono,
  },
  hint: {
    fontSize: 11,
    color: tokens.color.ink.placeholder,
    fontFamily: tokens.font.mono,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginLeft: 'auto',
  },
  chevron: {
    // `›` is right-pointing at 0deg. Collapsed = right (invite expand).
    // Open = rotate 90deg so it points down (revealing content).
    fontSize: 24,
    color: tokens.color.ink.tertiary,
    marginLeft: 4,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  emptyWorkers: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 13,
    color: tokens.color.ink.tertiary,
  },
});
