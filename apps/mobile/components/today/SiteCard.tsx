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

import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { TodaySiteT, TodayWorkerT } from '@axhy/shared-schema';

import { WorkerRow } from './WorkerRow';
import { SiteActionSheet } from './SiteActionSheet';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type SiteCardProps = {
  site: TodaySiteT;
  workers: TodayWorkerT[];
  onWorkerPress?: (worker: TodayWorkerT) => void;
  /**
   * Worker-row long-press handler — passed straight through to WorkerRow so
   * the parent (Today) can open the worker action sheet without prop-drilling
   * extra state into the site card.
   *
   * @derives(master-plan §P.4 — ReplacementInvite)
   */
  onWorkerLongPress?: (worker: TodayWorkerT) => void;
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

/**
 * Site card on the Today tab — shows coverage pill + worker list.
 *
 * Wrapped in React.memo with a custom comparator: the `workers` prop is the
 * full list from useTodayQuery and is a new array reference every render, but
 * only the subset matching `site.id` matters. The comparator re-renders only
 * when `site` or `onWorkerPress` changes, or when the workers that belong to
 * this site actually change (compared by id+state+note).
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export const SiteCard = memo(
  function SiteCard({ site, workers, onWorkerPress, onWorkerLongPress }: SiteCardProps) {
    const [open, setOpen] = useState(false);
    const [actionSheetOpen, setActionSheetOpen] = useState(false);
    const tone = coverageTone(site);

    // Memoize the filter so it doesn't re-run on every parent re-render.
    const siteWorkers = useMemo(
      () => workers.filter((w) => w.siteId === site.id),
      // workers is a new array every render, but the filter is cheap and
      // the result is stable across renders when the underlying data is the same.
      [workers, site.id],
    );

    // Sibling Pressables (post-Cluster-F refactor) — no event bubbling
    // between toggle and menu, so stopPropagation is no longer needed.
    const handleOpenActionSheet = useCallback(() => {
      setActionSheetOpen(true);
    }, []);

    const handleCloseActionSheet = useCallback(() => setActionSheetOpen(false), []);

    return (
      <View style={s.card}>
        {/* Cluster F (QA-rewalk 2026-05-18) — un-nested Pressables. The
         previous shape was an outer Pressable (toggle-on-press) wrapping
         an inner Pressable (menu button). On React Native Web both
         render as <button>; nested <button> is invalid HTML AND breaks
         click delegation on the outer in Chromium — which is exactly
         what the QA-rewalk's "Today SiteCard tap is no-op" finding
         (Cluster B B2-04) likely was. One refactor closes both.
         New shape: row container is a plain View; left half + chevron
         become one Pressable (toggle); menu button is a sibling
         Pressable, not a child. */}
        <View style={s.header}>
          <Pressable
            onPress={() => setOpen((o) => !o)}
            style={({ pressed }) => [s.headerToggle, pressed && s.headerPressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${site.name}, ${tone.label}, tap to ${open ? 'collapse' : 'view workers'}`}
          >
            <View style={s.left}>
              <View style={s.nameRow}>
                <Text style={s.name} numberOfLines={1}>
                  {site.name}
                </Text>
                {site.flagged ? (
                  <View style={s.flagPill}>
                    <Feather name="alert-triangle" size={10} color={tokens.color.semantic.warn} />
                    <Text style={s.flagPillText}>FLAG</Text>
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
            <View style={[s.chevron, open ? s.chevronOpen : null]}>
              <Feather name="chevron-right" size={20} color={tokens.color.ink.tertiary} />
            </View>
          </Pressable>
          <Pressable
            onPress={handleOpenActionSheet}
            style={({ pressed }) => [s.menuButton, pressed && s.headerPressed]}
            accessibilityRole="button"
            accessibilityLabel="Site options"
            hitSlop={8}
          >
            <Feather name="more-vertical" size={18} color={tokens.color.ink.tertiary} />
          </Pressable>
        </View>

        {open ? (
          siteWorkers.length === 0 ? (
            <View style={s.emptyWorkers}>
              <Text style={s.emptyText}>No active workers on this site today.</Text>
            </View>
          ) : (
            <View>
              {siteWorkers.map((w) => (
                <WorkerRow
                  key={w.id}
                  worker={w}
                  onPress={onWorkerPress}
                  onLongPress={onWorkerLongPress}
                />
              ))}
            </View>
          )
        ) : null}

        <SiteActionSheet visible={actionSheetOpen} site={site} onClose={handleCloseActionSheet} />
      </View>
    );
  },
  // Custom memo comparator — avoids re-rendering this card when an unrelated
  // worker on a different site changes (workers is a new array every parent
  // render because useTodayQuery returns the full workers list).
  (prev, next) => {
    if (prev.site !== next.site) return false;
    if (prev.onWorkerPress !== next.onWorkerPress) return false;
    if (prev.onWorkerLongPress !== next.onWorkerLongPress) return false;
    // Compare only the workers belonging to this site.
    const prevOwn = prev.workers.filter((w) => w.siteId === prev.site.id);
    const nextOwn = next.workers.filter((w) => w.siteId === next.site.id);
    if (prevOwn.length !== nextOwn.length) return false;
    return prevOwn.every((pw, i) => {
      const nw = nextOwn[i];
      return nw != null && pw.id === nw.id && pw.state === nw.state && pw.note === nw.note;
    });
  },
);

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
  },
  // Inner toggle area — left content + chevron, takes the row's spare width.
  headerToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  menuButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    // Right-pointing at 0deg. Collapsed = right (invite expand).
    // Open = rotate 90deg so it points down (revealing content).
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
