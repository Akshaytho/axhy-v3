/**
 * SiteActionSheet — bottom-sheet action menu for a site card's 3-dot button.
 *
 * Opens with 4 actions: Mark as priority, Add site rule, Send replacement,
 * Open in maps.
 *
 * As of Sprint 2 mobile (Wave 1 — ReplacementPicker), the "Send replacement"
 * row navigates to the ReplacementPicker route (`/(supervisor)/replacement-picker`)
 * with `siteId` + `siteName` + `scheduledStart` (today's date at 09:00 IST is
 * used as a sane default when the picker is invoked from a site card with no
 * specific Visit context; the picker overrides this when invoked from a
 * worker row).
 *
 * The other three rows still have no destination — they close the sheet
 * cleanly per the existing honesty-over-fake-completion stance.
 *
 * Uses plain RN `Modal` (same pattern as MarkAbsentSheet) — no additional
 * library deps, works on Expo Web out of the box.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(master-plan §P.4 — ReplacementInvite)
 */

import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type SiteActionSheetProps = {
  visible: boolean;
  site: { id: string; name: string } | null;
  onClose: () => void;
};

type ActionId = 'priority' | 'rule' | 'replacement' | 'maps';

type ActionRow = {
  id: ActionId;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
};

const ACTIONS: ActionRow[] = [
  { id: 'priority', label: 'Mark as priority', icon: 'star' },
  { id: 'rule', label: 'Add site rule', icon: 'plus-circle' },
  { id: 'replacement', label: 'Send replacement', icon: 'user-plus' },
  { id: 'maps', label: 'Open in maps', icon: 'map-pin' },
];

/**
 * Returns an ISO datetime string for "today at 09:00 local". Used as a sane
 * default `scheduledStart` when the picker is invoked from a site card with no
 * specific Visit / Shift context. The picker's context strip surfaces this so
 * the supervisor can confirm before sending.
 */
function defaultScheduledStartIso(): string {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function SiteActionSheet({ visible, site, onClose }: SiteActionSheetProps) {
  function handleRowPress(id: ActionId) {
    if (id === 'replacement' && site) {
      // Close the sheet first so the modal doesn't stack on top of the picker.
      onClose();
      router.push({
        pathname: '/(supervisor)/replacement-picker',
        params: {
          siteId: site.id,
          siteName: site.name,
          scheduledStart: defaultScheduledStartIso(),
        },
      });
      return;
    }
    // Other rows still have no destination — close sheet without a fake toast.
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
          <Text style={s.title} numberOfLines={1}>
            {site ? `Site actions · ${site.name}` : 'Site actions'}
          </Text>

          <View style={s.rows}>
            {ACTIONS.map((action) => (
              <Pressable
                key={action.id}
                style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                onPress={() => handleRowPress(action.id)}
                accessibilityRole="button"
              >
                <Feather
                  name={action.icon}
                  size={18}
                  color={tokens.color.ink.secondary}
                  style={s.rowIcon}
                />
                <Text style={s.rowLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={s.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.color.surface.card,
    borderTopLeftRadius: tokens.radius.r4,
    borderTopRightRadius: tokens.radius.r4,
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[7],
  },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.surface.paper3,
    alignSelf: 'center',
    marginBottom: tokens.space[3],
  },
  title: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[4],
  },
  rows: {
    marginBottom: tokens.space[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space[3],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.paper3,
  },
  rowPressed: {
    backgroundColor: tokens.color.surface.paper2,
  },
  rowIcon: {
    marginRight: tokens.space[3],
  },
  rowLabel: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.primary,
  },
  cancel: {
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
});
