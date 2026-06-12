/**
 * AmendModeBanner — sticky strip pinned above the message list when the
 * chat surface is in amend mode (opened with `?amendDecisionId=<id>`).
 *
 * Surfaces:
 *   - one-line subject: "Editing decision: <kind> · <context>"
 *   - dismiss "x" — supervisor can leave amend mode without completing
 *     the edit. Confirms with a single tap (no destructive-action dialog
 *     because amend has no side effect to undo — the original decision
 *     row is untouched until the AI emits a propose_* tool to supersede).
 *
 * The banner colour uses the accent / brand palette so it reads as
 * "modal-context active" without competing with the assistant bubble.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §D.3 — amend pathway)
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

export type AmendModeBannerProps = {
  /** SupervisorDecision.id being amended. Shown truncated for debug context. */
  readonly targetDecisionId: string;
  /** Short one-line subject, e.g. "Mark Suresh absent · Today". */
  readonly subject: string;
  /** Optional kind label, e.g. "MARK_ABSENT". Renders as a chip on the left. */
  readonly kind?: string;
  readonly onDismiss: () => void;
};

export function AmendModeBanner(props: AmendModeBannerProps): React.JSX.Element {
  return (
    <View
      style={s.root}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Editing decision: ${props.subject}`}
    >
      <View style={s.iconWrap}>
        <Feather name="edit-2" size={14} color={tokens.color.brand.accent2} />
      </View>
      <View style={s.body}>
        <Text style={s.title} numberOfLines={1}>
          Editing decision
        </Text>
        <Text style={s.subject} numberOfLines={1}>
          {props.kind ? `${props.kind} · ` : ''}
          {props.subject}
        </Text>
      </View>
      <Pressable
        onPress={props.onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Stop editing decision"
        hitSlop={8}
        style={s.dismissBtn}
      >
        <Feather name="x" size={16} color={tokens.color.ink.secondary} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    backgroundColor: tokens.color.brand.accentSoft,
    borderBottomWidth: 1,
    borderColor: tokens.color.brand.accent2,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.color.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 11,
    fontWeight: String(tokens.weight.bold) as '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.color.brand.accent2,
  },
  subject: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
    fontWeight: String(tokens.weight.medium) as '500',
  },
  dismissBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
