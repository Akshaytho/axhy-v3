/**
 * SiteActionSheet — bottom-sheet action menu for a site card's 3-dot button.
 *
 * Opens with 4 actions: Mark as priority, Add site rule, Send replacement,
 * Open in maps. None of these surfaces exist yet; each row simply closes the
 * sheet. No fake success toast — honesty over fake completion.
 *
 * Uses plain RN `Modal` (same pattern as MarkAbsentSheet) — no additional
 * library deps, works on Expo Web out of the box.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type SiteActionSheetProps = {
  visible: boolean;
  site: { id: string; name: string } | null;
  onClose: () => void;
};

type ActionRow = {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
};

const ACTIONS: ActionRow[] = [
  { label: 'Mark as priority', icon: 'star' },
  { label: 'Add site rule', icon: 'plus-circle' },
  { label: 'Send replacement', icon: 'user-plus' },
  { label: 'Open in maps', icon: 'map-pin' },
];

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function SiteActionSheet({ visible, site, onClose }: SiteActionSheetProps) {
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
                key={action.label}
                style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                onPress={onClose}
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
