/**
 * WorkerActionSheet — bottom-sheet action menu opened by long-pressing a
 * worker row on the Today tab.
 *
 * Currently exposes one action: "Find replacement" → navigates to the
 * ReplacementPicker (F28) prefilled with the original worker's id, name,
 * and current site. Mirrors `SiteActionSheet`'s shape (plain RN Modal,
 * works on Expo Web without extra deps).
 *
 * Honest-no-op stance: only the actions that have a destination are
 * listed. We don't surface fake rows that close-without-doing-anything.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(feedback_replacement_invite_single_recipient.md)
 */

import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';
import type { TodayWorkerT } from '@axhy/shared-schema';

import { useLocaleStrings } from '../../lib/i18n/use-locale';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type WorkerActionSheetProps = {
  visible: boolean;
  worker: TodayWorkerT | null;
  /**
   * Display name for the worker's current site, looked up by Today screen
   * from `TodayResponse.sites` so the sheet doesn't have to re-derive it.
   * Null when the worker isn't currently assigned anywhere we know about
   * (defensive guard; the sheet still shows "Find replacement").
   */
  siteName: string | null;
  onClose: () => void;
};

/**
 * Returns an ISO datetime string for "today at 09:00 local". The picker's
 * context strip surfaces this so the supervisor can confirm before sending.
 * (Worker-row context has no Visit row yet — supervisor is initiating cover
 * for an upcoming or in-progress shift.)
 */
function defaultScheduledStartIso(): string {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function WorkerActionSheet({ visible, worker, siteName, onClose }: WorkerActionSheetProps) {
  const strings = useLocaleStrings();

  function handleFindReplacement() {
    if (!worker) return;
    // Close the sheet first so the modal doesn't stack on top of the picker.
    onClose();
    router.push({
      pathname: '/(supervisor)/replacement-picker',
      params: {
        siteId: worker.siteId,
        siteName: siteName ?? '',
        scheduledStart: defaultScheduledStartIso(),
        originalWorkerUserId: worker.id,
        originalWorkerName: worker.name,
      },
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
          <Text style={s.title} numberOfLines={1}>
            {worker ? worker.name : ''}
          </Text>

          <View style={s.rows}>
            <Pressable
              style={({ pressed }) => [s.row, pressed && s.rowPressed]}
              onPress={handleFindReplacement}
              accessibilityRole="button"
              accessibilityLabel={strings.replacement.findReplacement}
            >
              <Feather
                name="user-plus"
                size={18}
                color={tokens.color.ink.secondary}
                style={s.rowIcon}
              />
              <Text style={s.rowLabel}>{strings.replacement.findReplacement}</Text>
            </Pressable>
          </View>

          <Pressable style={s.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={s.cancelText}>{strings.replacement.longPressCancel}</Text>
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
  rows: { marginBottom: tokens.space[4] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space[3],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.paper3,
  },
  rowPressed: { backgroundColor: tokens.color.surface.paper2 },
  rowIcon: { marginRight: tokens.space[3] },
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
