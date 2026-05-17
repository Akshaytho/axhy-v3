/**
 * SiteCard — collapsible site row on Today.
 *
 * Per R6 prototype (today.jsx:180-382). Default collapsed: site name +
 * coverage pill (FULL / N SHORT). Tap to expand: worker grid for that
 * site. Flagged indicator when any of today's visits at the site is
 * flagged.
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

function coverageBadge(site: TodaySiteT): { label: string; color: string } {
  const gap = Math.max(0, site.workersDue - site.workersOn);
  if (gap === 0)
    return { label: site.workersDue === 0 ? 'NO ROSTER' : 'FULL', color: tokens.color.semantic.ok };
  const ratio = site.workersDue > 0 ? site.workersOn / site.workersDue : 1;
  return {
    label: gap === 1 ? '1 SHORT' : `${gap} SHORT`,
    color: ratio >= 0.75 ? tokens.color.semantic.warn : tokens.color.semantic.bad,
  };
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function SiteCard({ site, workers, onWorkerPress }: SiteCardProps) {
  const [open, setOpen] = useState(false);
  const badge = coverageBadge(site);
  const siteWorkers = workers.filter((w) => w.siteId === site.id);

  return (
    <View style={s.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [s.header, pressed && s.headerPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={s.headerLeft}>
          <Text style={s.name} numberOfLines={1}>
            {site.name}
          </Text>
          <Text style={s.count}>
            {site.workersOn} of {site.workersDue} on shift
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: badge.color + '22', borderColor: badge.color }]}>
          <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
        {site.flagged ? (
          <View style={s.flagDot} accessibilityLabel="Flagged visit at this site" />
        ) : null}
      </Pressable>
      {open ? (
        siteWorkers.length === 0 ? (
          <View style={s.emptyWorkers}>
            <Text style={s.emptyText}>No worker rows for this site today.</Text>
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
    marginBottom: tokens.space[3],
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
  },
  headerPressed: { backgroundColor: tokens.color.surface.paper2 },
  headerLeft: { flex: 1, minWidth: 0 },
  name: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  count: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: tokens.space[3],
    paddingVertical: 4,
    borderRadius: tokens.radius.r1,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    letterSpacing: 0.6,
  },
  flagDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.color.semantic.bad,
  },
  emptyWorkers: {
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
  },
  emptyText: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
  },
});
