/**
 * My sites screen — secondary surface reachable via the Drawer.
 *
 * Displays all sites bound to this supervisor, sourced from
 * `useTodayQuery().data.sites`. Each row shows the site name,
 * workers-on / workers-due ratio, and a flagged dot when any
 * visit at that site is flagged today.
 *
 * Not shown in the tab bar (href: null in _layout.tsx).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { TodaySiteT } from '@axhy/shared-schema';

import { useTodayQuery } from '../../lib/queries/use-today';
import { TopAppBar } from '../../components/today/TopAppBar';

// ---------------------------------------------------------------------------
// SiteRow
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type SiteRowProps = {
  site: TodaySiteT;
};

/**
 * Single site row: name + workers-on/due ratio + flagged indicator.
 *
 * Tap action: navigating back to Today and expanding the site card is a
 * follow-up slice (requires cross-screen state lift). The row is rendered
 * as a non-interactive card until that slice lands.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
function SiteRow({ site }: SiteRowProps) {
  const ratioLabel = `${site.workersOn}/${site.workersDue}`;
  const allPresent = site.workersOn >= site.workersDue && site.workersDue > 0;

  return (
    <View style={row.container}>
      {/* Left: name + ratio */}
      <View style={row.info}>
        <Text style={row.name} numberOfLines={1}>
          {site.name}
        </Text>
        <Text style={[row.ratio, allPresent && row.ratioGood]}>{ratioLabel} workers on site</Text>
      </View>

      {/* Right: flagged dot or chevron */}
      <View style={row.right}>
        {site.flagged ? (
          <View style={row.flagDot} accessibilityLabel="Flagged visit today" />
        ) : (
          <Feather name="chevron-right" size={16} color={tokens.color.ink.placeholder} />
        )}
      </View>
    </View>
  );
}

const row = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space[4],
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    minHeight: tokens.tap.minMobile,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  ratio: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  ratioGood: {
    color: tokens.color.semantic.ok,
  },
  right: {
    marginLeft: tokens.space[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.semantic.warn,
  },
});

// ---------------------------------------------------------------------------
// SitesScreen
// ---------------------------------------------------------------------------

/**
 * My sites screen.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export default function SitesScreen() {
  const today = useTodayQuery();
  const sites = today.data?.sites ?? [];
  const title = today.isLoading ? 'Sites' : `${sites.length} site${sites.length === 1 ? '' : 's'}`;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar subtitle="MY SITES" title={title} />

      {today.isLoading ? (
        // Cluster 3 follow-up (QA-rewalk 2026-05-18): pair the spinner
        // with a visible label so the supervisor knows the screen is
        // loading vs broken. Same pattern as Profile.
        <View style={s.center}>
          <ActivityIndicator color={tokens.color.brand.accent} />
          <Text style={s.loadingLabel}>Loading your sites…</Text>
        </View>
      ) : today.isError ? (
        <View style={s.center}>
          <TouchableOpacity onPress={() => today.refetch()}>
            <Text style={s.errorText}>Couldn't load sites. Tap to retry.</Text>
          </TouchableOpacity>
        </View>
      ) : sites.length === 0 ? (
        <View style={s.center}>
          <Feather name="map" size={36} color={tokens.color.ink.placeholder} />
          <Text style={s.emptyText}>No sites assigned yet.</Text>
        </View>
      ) : (
        <FlatList<TodaySiteT>
          data={sites}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SiteRow site={item} />}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          style={s.list}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  list: {
    flex: 1,
  },
  listContent: {
    backgroundColor: tokens.color.surface.card,
    marginHorizontal: tokens.space[4],
    marginTop: tokens.space[4],
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    overflow: 'hidden',
    paddingBottom: tokens.space[6],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[4],
    gap: tokens.space[3],
  },
  errorText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.brand.accent,
    textAlign: 'center',
    fontWeight: String(tokens.weight.medium) as '500',
  },
  emptyText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
    marginTop: tokens.space[2],
  },
  loadingLabel: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
  },
});
