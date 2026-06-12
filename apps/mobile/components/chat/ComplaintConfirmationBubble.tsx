/**
 * ComplaintConfirmationBubble — inline confirmation rendered below an
 * assistant message when the AI's `propose_log_complaint` tool fired
 * successfully.
 *
 * Backend contract (Wave 3 chat.ts):
 *   decisionCard = {
 *     toolName:    'propose_log_complaint',
 *     description: 'Logged complaint at <site> · <severity> · <kind> · sent to HR for review.',
 *     fields: {
 *       complaintId, siteId, severity, kind
 *     },
 *     severity: 'CONFIRM',
 *     origin:   'CHAT',
 *   }
 *
 * The card is "fire-and-display" — the Complaint row already exists; the
 * supervisor's only follow-up action is to open the thread (deep-link chip).
 *
 * Deep-link target: `/(supervisor)/complaints/<id>`. The Complaints drawer
 * thread view ships in a follow-up sprint; for now the route is a placeholder
 * scoped to the chat surface via `/(supervisor)/chat?complaintId=<id>` so
 * the supervisor sees the thread context without a 404.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C.4 — chat thread navigation)
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

export type ComplaintConfirmationBubbleProps = {
  /** Complaint.id minted by the backend tool handler. */
  readonly complaintId: string;
  /**
   * Pre-formatted summary line from the backend's `confirmationText`.
   * Example: "Logged complaint at Aparna A-block · LOW · missed area · sent to HR for review."
   */
  readonly summary: string;
  /** Tap handler — navigates to the complaint thread view. */
  readonly onOpenThread: (complaintId: string) => void;
};

export function ComplaintConfirmationBubble(
  props: ComplaintConfirmationBubbleProps,
): React.JSX.Element {
  return (
    <View style={s.root} accessibilityLabel={props.summary}>
      <View style={s.iconWrap}>
        <Feather name="check-circle" size={14} color={tokens.color.semantic.ok} />
      </View>
      <View style={s.body}>
        <Text style={s.summary}>{props.summary}</Text>
        <Pressable
          onPress={() => props.onOpenThread(props.complaintId)}
          accessibilityRole="button"
          accessibilityLabel="Open complaint thread"
          style={s.linkChip}
        >
          <Text style={s.linkText}>View thread</Text>
          <Feather name="arrow-right" size={12} color={tokens.color.brand.accent2} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2] + 2,
    backgroundColor: tokens.color.semantic.okSoft,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.semantic.ok,
    marginTop: tokens.space[1],
    marginBottom: tokens.space[2],
    marginHorizontal: tokens.space[1],
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.color.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: tokens.space[1] + 2,
  },
  summary: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
    lineHeight: tokens.type.body.size * 1.4,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.space[2],
    paddingVertical: tokens.space[1],
    borderRadius: 999,
    backgroundColor: tokens.color.surface.card,
    borderWidth: 1,
    borderColor: tokens.color.brand.accent2,
  },
  linkText: {
    fontSize: 12,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.brand.accent2,
  },
});
