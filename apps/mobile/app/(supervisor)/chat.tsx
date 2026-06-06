/**
 * Supervisor chat tab — voice-first capture surface with photo attach,
 * live transcript shimmer, amend mode, clarifying chips, and complaint
 * confirmation bubbles.
 *
 * Sprint 2 upgrades (Wave 3 wire-shape):
 *
 *   A. VoiceWaveformPill — live duration from useVoiceRecorder(); the
 *      transcription confidence chip is wired to the actual Whisper
 *      `confidence` field (HIGH / MEDIUM / LOW). The Sprint-1 deep-review
 *      finding (hardcoded `0:00`) is fixed.
 *
 *   B. Live transcription shimmer — while the supervisor's audio is being
 *      uploaded and Whisper is resolving, the LiveTranscriptShimmer
 *      renders pulsing dots. Once the response lands, the shimmer reveals
 *      the words at the actual cadence the supervisor spoke (Whisper's
 *      word-level timestamps drive the animation).
 *
 *   C. Photo attach — paperclip icon in the input row → web file picker
 *      (or `expo-image-picker` on native if installed) → S3 signed PUT
 *      → URL added to `attachments[]` on the next chat send. Max 4 per
 *      message per the Wave 3 backend cap.
 *
 *   D. Amend mode — when launched with `?amendDecisionId=<id>`, the
 *      sticky AmendModeBanner appears above the message list, every chat
 *      send carries `amend: { targetDecisionId }`, and on a successful
 *      tool result the banner dismisses + the supervisor is navigated to
 *      `(supervisor)/decisions?focus=<id>`.
 *
 *   E. ComplaintConfirmationBubble — when the AI's
 *      `propose_log_complaint` tool fires (origin='CHAT'), the chat
 *      surface renders an inline confirmation below the assistant
 *      message with a deep-link chip to the complaint thread view.
 *
 *   F. ClarifyChips — when the AI emits `propose_clarify(options: string[])`,
 *      the chat surface renders the options as tappable chips. Tapping
 *      injects the chosen text as the next user message.
 *
 * Backend wiring preserved:
 *   - `sendChatMessage` → POST /chat/messages with Idempotency-Key,
 *     attachments, and amend.
 *   - The chat envelope (Idempotency-Key) is the idempotency unit —
 *     attachments and amend ride along with no extra keying needed.
 *   - Daily budget cap handled with distinct goldenrod banner.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 * @derives(supervisor-drawer-and-decisions-redesign.md §C, §D.3)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { MeOutput } from '@axhy/shared-schema';

import { TopAppBar } from '../../components/today/TopAppBar';
import { SkeletonBubble } from '../../components/SkeletonBubble';
import { useLocaleStrings } from '../../lib/i18n/use-locale';
import { GreetingCard } from '../../components/chat/GreetingCard';
import { ContextSeparator } from '../../components/chat/ContextSeparator';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { VoiceWaveformPill } from '../../components/chat/VoiceWaveformPill';
import { TranscriptionMeta } from '../../components/chat/TranscriptionMeta';
import { DecisionLinkPill } from '../../components/chat/DecisionLinkPill';
import { LiveTranscriptShimmer } from '../../components/chat/LiveTranscriptShimmer';
import { PhotoAttachStrip, type AttachmentDraft } from '../../components/chat/PhotoAttachStrip';
import { AmendModeBanner } from '../../components/chat/AmendModeBanner';
import { ComplaintConfirmationBubble } from '../../components/chat/ComplaintConfirmationBubble';
import { ClarifyChips } from '../../components/chat/ClarifyChips';
import { sendChatMessage, type ChatAttachment, type DecisionCardData } from '../../lib/chat-api';
import { generateIdempotencyKey } from '../../lib/idempotency-key';
import { apiFetch, isAIBudgetExceededError } from '../../lib/api';
import { useSupervisorContextQuery } from '../../lib/queries/use-supervisor-context';
import { useVoiceRecorder } from '../../lib/audio/use-voice-recorder';
import { transcribeAudioStream, type TranscribeWord } from '../../lib/audio/transcribe';
import { useLocaleCode } from '../../lib/i18n/use-locale';
import { pickImage, uploadPhotoAttachment } from '../../lib/uploads/photo-upload';

/** Maximum photo attachments per message (Wave 3 backend cap). */
const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/** Example phrases shown in the empty state. */
const EXAMPLE_PHRASES = [
  '"Mark Suresh absent today"',
  '"Add Ravi to Hospital A Mon–Sat 9–5"',
  '"Pradeep sick for 3 days"',
] as const;

/** Confidence chip values rendered by `TranscriptionMeta`. */
type ConfidenceTag = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Voice metadata captured per user message — duration + confidence chip.
 * Sprint 1 deep-review wired duration to `0:00`; this struct holds the
 * real duration so the pill renders the recorded length faithfully.
 */
type VoiceMetadata = {
  /** Formatted "M:SS" string. */
  readonly duration: string;
  /** Whisper-derived confidence bucket, mapped to chip color in TranscriptionMeta. */
  readonly confidence: ConfidenceTag;
};

type LocalMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  chatMessageId?: string;
  decisionCard?: DecisionCardData;
  /** Batch DecisionCards from compound utterance. */
  decisionCards?: NonNullable<DecisionCardData>[] | null;
  status?: 'pending' | 'sent' | 'failed';
  /**
   * Voice metadata when this user message originated from a held-mic
   * recording. Drives the VoiceWaveformPill + TranscriptionMeta below
   * the bubble.
   */
  voice?: VoiceMetadata;
  /**
   * Attachment thumbnails to render in-line with the user message (so the
   * supervisor can see what they sent even after PhotoAttachStrip clears).
   * Backed by the same `previewUri` we used in the strip.
   */
  attachmentPreviews?: ReadonlyArray<{ id: string; uri: string }>;
};

/** Derive the total decision count for a message. */
function decisionCount(msg: LocalMessage): number {
  if (msg.decisionCards && msg.decisionCards.length > 0) return msg.decisionCards.length;
  if (msg.decisionCard) return 1;
  return 0;
}

/** Format milliseconds as "M:SS" for the waveform pill duration display. */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Map the Whisper backend confidence ('high'/'medium'/'low') to chip casing. */
function toConfidenceTag(c: 'high' | 'medium' | 'low'): ConfidenceTag {
  if (c === 'high') return 'HIGH';
  if (c === 'medium') return 'MEDIUM';
  return 'LOW';
}

/**
 * Extract a `propose_log_complaint` `decisionCard` shape, returning the
 * complaintId + summary if present. Returns null when the card is not a
 * complaint card.
 */
function readComplaintCard(
  card: DecisionCardData,
): { complaintId: string; summary: string } | null {
  if (!card) return null;
  if (card.toolName !== 'propose_log_complaint') return null;
  if (card.origin !== 'CHAT') return null;
  const fields = card.fields;
  const complaintId =
    fields && typeof fields['complaintId'] === 'string' ? (fields['complaintId'] as string) : null;
  if (!complaintId) return null;
  const summary = card.description ?? '';
  return { complaintId, summary };
}

/**
 * Extract a `propose_clarify` shape. Returns { question, options } when
 * the card is a clarify card, null otherwise.
 */
function readClarifyCard(
  card: DecisionCardData,
): { question: string; options: ReadonlyArray<string> } | null {
  if (!card) return null;
  if (card.toolName !== 'propose_clarify') return null;
  if (!card.clarify) return null;
  const fields = card.fields;
  const question = card.title ?? '';
  const opts = fields && Array.isArray(fields['options']) ? fields['options'] : [];
  const options = opts.filter((o): o is string => typeof o === 'string');
  if (options.length < 2) return null;
  return { question, options };
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export default function ChatScreen(): JSX.Element {
  const strings = useLocaleStrings();
  const localeCode = useLocaleCode();

  // ─── Amend mode ────────────────────────────────────────────────────────────
  // Read `amendDecisionId` from the route query. When present, the chat
  // surface enters amend mode: AmendModeBanner is sticky above the list,
  // every chat send threads `amend: { targetDecisionId }`, and a successful
  // tool result navigates back to /decisions?focus=<id>.
  const params = useLocalSearchParams<{
    amendDecisionId?: string;
    complaintId?: string;
  }>();
  const initialAmendId = typeof params.amendDecisionId === 'string' ? params.amendDecisionId : null;
  const [amendTargetId, setAmendTargetId] = useState<string | null>(initialAmendId);
  // Keep state in sync if the user navigates back-and-forth.
  useEffect(() => {
    setAmendTargetId(initialAmendId);
  }, [initialAmendId]);

  // ─── Chat state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetCapped, setBudgetCapped] = useState(false);

  /** Voice recording + transcription state. */
  const [transcribing, setTranscribing] = useState(false);
  /** Final transcript text once Whisper resolves; drives shimmer reveal. */
  const [revealText, setRevealText] = useState<string>('');
  /** Whisper word-level timestamps; drives shimmer cadence. */
  const [revealWords, setRevealWords] = useState<ReadonlyArray<TranscribeWord>>([]);
  /** Most-recent capture's confidence; threaded into the next user message. */
  const [pendingVoiceMeta, setPendingVoiceMeta] = useState<VoiceMetadata | null>(null);

  /** Staged photo attachments — uploaded before send. */
  const [attachments, setAttachments] = useState<ReadonlyArray<AttachmentDraft>>([]);

  const textInputRef = useRef<TextInput>(null);

  const {
    isRecording,
    durationMs,
    start: startRecording,
    stop: stopRecording,
  } = useVoiceRecorder();

  // Pull supervisor data from /me — cached by react-query.
  const { data: me } = useQuery<MeOutput>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeOutput>('/me'),
    staleTime: 5 * 60_000,
  });
  const supervisorFirstName = me?.user.name?.trim().split(/\s+/)[0] ?? 'there';

  // Restore prior conversation on open — without this the supervisor's AI thread
  // looks wiped every time they reopen Chat (locked: history persists). Seeds
  // `messages` ONCE from the most-recent active thread. Guards: hydratedRef
  // (one-shot) + messages.length (never clobber a message the user sent before
  // the fetch resolved).
  type HistoryMsg = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    chatMessageId?: string;
    decisionCard?: DecisionCardData | null;
  };
  const { data: history } = useQuery<{ messages: HistoryMsg[] }>({
    queryKey: ['chat-history'],
    queryFn: () => apiFetch<{ messages: HistoryMsg[] }>('/chat/history'),
    staleTime: Infinity,
  });
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || messages.length > 0) return;
    const restored = history?.messages;
    if (restored && restored.length > 0) {
      hydratedRef.current = true;
      setMessages(
        restored.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          chatMessageId: m.chatMessageId,
          decisionCard: m.decisionCard ?? undefined,
        })),
      );
    }
  }, [history, messages.length]);

  // Supervisor portfolio counts.
  // Cluster 2 fix (QA-walkthrough 2026-05-18): keep sitesActive +
  // workersActive as null until the context query resolves. Pre-fix
  // the header would say "0 sites · 0 workers active" before the
  // query landed, which is a lie when the tenant has real data.
  const { data: context } = useSupervisorContextQuery();
  const sitesActive = context?.sitesActive ?? null;
  const workersActive = context?.workersActive ?? null;

  // ─── Photo attach ──────────────────────────────────────────────────────────

  /**
   * Upload one local pick through the sign + PUT pipeline, mutating the
   * matching draft in `attachments` from 'pending' to 'uploaded' or
   * 'failed'. The draft is created before this runs so the thumbnail
   * appears immediately.
   */
  const runUpload = useCallback(
    async (draftId: string, blob: Blob, mime: string, sizeBytes: number): Promise<void> => {
      try {
        const uploaded = await uploadPhotoAttachment({ blob, mime, sizeBytes });
        setAttachments((prev) =>
          prev.map((d) =>
            d.id === draftId ? { ...d, status: 'uploaded', uploadedUrl: uploaded.url } : d,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Photo upload failed';
        setAttachments((prev) =>
          prev.map((d) =>
            d.id === draftId ? { ...d, status: 'failed', errorMessage: message } : d,
          ),
        );
      }
    },
    [],
  );

  const handlePickPhoto = useCallback(async () => {
    if (attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      setError(strings.chat.photoMaxReached);
      return;
    }
    setError(null);
    let pick;
    try {
      pick = await pickImage();
    } catch (err) {
      const message = err instanceof Error ? err.message : strings.chat.photoPickerUnavailable;
      setError(message);
      return;
    }
    if (!pick) return; // user cancelled

    const id = generateIdempotencyKey();
    const draft: AttachmentDraft = {
      id,
      previewUri: pick.previewUri,
      status: 'pending',
    };
    setAttachments((prev) => [...prev, draft]);

    void runUpload(id, pick.blob, pick.mime, pick.sizeBytes);
  }, [
    attachments.length,
    runUpload,
    strings.chat.photoMaxReached,
    strings.chat.photoPickerUnavailable,
  ]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((d) => d.id === id);
      // Revoke the object URL on web to free memory.
      if (target && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(target.previewUri);
        } catch {
          // ignore
        }
      }
      return prev.filter((d) => d.id !== id);
    });
  }, []);

  const handleRetryAttachment = useCallback(
    async (id: string) => {
      const target = attachments.find((d) => d.id === id);
      if (!target) return;
      // We don't have the original blob anymore (we threw it away after the
      // upload attempt). Re-pick is the cleanest UX — surface a remove +
      // pick again, signalled by removing the failed draft now.
      handleRemoveAttachment(id);
      void handlePickPhoto();
    },
    [attachments, handlePickPhoto, handleRemoveAttachment],
  );

  // ─── Chat send ─────────────────────────────────────────────────────────────

  const onSend = useCallback(
    async (text: string, voice: VoiceMetadata | null) => {
      const trimmed = text.trim();
      if (!trimmed || budgetCapped) return;

      // Only uploaded attachments are sent. Failed/pending are excluded.
      const uploadedAttachments: ChatAttachment[] = attachments
        .filter(
          (d): d is AttachmentDraft & { uploadedUrl: string } =>
            d.status === 'uploaded' && typeof d.uploadedUrl === 'string',
        )
        .map((d) => ({ type: 'image' as const, url: d.uploadedUrl }));

      const attachmentPreviews = attachments
        .filter((d) => d.status === 'uploaded')
        .map((d) => ({ id: d.id, uri: d.previewUri }));

      const userId = generateIdempotencyKey();
      const idempotencyKey = generateIdempotencyKey();

      setMessages((prev) => [
        ...prev,
        {
          id: userId,
          role: 'user',
          text: trimmed,
          status: 'pending',
          voice: voice ?? undefined,
          attachmentPreviews,
        },
      ]);
      setThinking(true);
      setError(null);

      // Clear staged attachments + pending voice meta immediately — they're
      // now bound to the message in flight.
      setAttachments([]);
      setPendingVoiceMeta(null);

      try {
        const res = await sendChatMessage({
          text: trimmed,
          idempotencyKey,
          voiceConfidence: voice ? voice.confidence : undefined,
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          amend: amendTargetId ? { targetDecisionId: amendTargetId } : undefined,
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, status: 'sent' as const } : m)),
        );

        setMessages((prev) => [
          ...prev,
          {
            id: generateIdempotencyKey(),
            role: 'assistant',
            text: res.assistantText || '(no response)',
            chatMessageId: res.chatMessageId,
            decisionCard: res.decisionCard,
            decisionCards: res.decisionCards,
          },
        ]);

        // Amend completion: gate on the server's `didAmend` flag — the
        // backend only sets it to true when it (a) validated the amend
        // target belongs to this supervisor in this tenant and (b)
        // persisted the amend intent on the user-row's audit payload.
        //
        // Cluster A fix (Sprint 2 deep-review 2026-05-18). Before this,
        // the celebration fired on any tool result, so the banner would
        // green-flash for X when the AI marked a completely different
        // worker absent. Now mobile trusts the server's own contract.
        if (amendTargetId && res.didAmend === true) {
          const focusId = amendTargetId;
          setAmendTargetId(null);
          router.push({
            pathname: '/(supervisor)/decisions',
            params: { focus: focusId },
          });
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, status: 'failed' as const } : m)),
        );
        if (isAIBudgetExceededError(err)) {
          setBudgetCapped(true);
          setError(
            'Daily AI usage limit reached. Try again tomorrow or contact your administrator.',
          );
        } else {
          setError(err instanceof Error ? err.message : 'Send failed');
        }
      } finally {
        setThinking(false);
      }
    },
    [amendTargetId, attachments, budgetCapped],
  );

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || thinking || budgetCapped) return;
    setDraft('');
    const voice = pendingVoiceMeta;
    void onSend(trimmed, voice);
  }, [draft, thinking, budgetCapped, onSend, pendingVoiceMeta]);

  // ─── Voice capture ─────────────────────────────────────────────────────────

  const handleMicPressIn = useCallback(
    (_e: GestureResponderEvent) => {
      if (thinking || budgetCapped) return;
      setError(null);
      void startRecording();
    },
    [thinking, budgetCapped, startRecording],
  );

  const handleMicPressOut = useCallback(
    async (_e: GestureResponderEvent) => {
      if (!isRecording) return;
      const result = await stopRecording();

      if (!result) {
        setError('Microphone permission denied. Please enable it in Settings.');
        return;
      }

      // Hold onto the captured duration before the transcribe round-trip;
      // it survives even if transcribe fails (the bubble still shows the
      // recorded length).
      const recordedDuration = formatDuration(result.durationMs);

      setTranscribing(true);
      setRevealText('');
      setRevealWords([]);
      setError(null);
      try {
        const hint = (localeCode === 'hi' || localeCode === 'te' ? localeCode : 'en') as
          | 'en'
          | 'hi'
          | 'te';
        const streamed = await transcribeAudioStream(result.uri, hint);

        if (streamed.text.trim()) {
          setRevealText(streamed.text);
          setRevealWords(streamed.words);
          setDraft(streamed.text.trim());
          setPendingVoiceMeta({
            duration: recordedDuration,
            confidence: toConfidenceTag(streamed.confidence),
          });
          textInputRef.current?.focus();
        } else {
          setError('No speech detected. Please try again.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transcription failed');
      } finally {
        setTranscribing(false);
        // Leave the reveal text visible for ~600ms after transcribing flips
        // false so the supervisor sees the final words land cleanly.
        // We schedule a clear via a microtask so the shimmer animation can
        // finish, then unmount on the next render.
        setTimeout(() => {
          setRevealText('');
          setRevealWords([]);
        }, 800);
      }
    },
    [isRecording, stopRecording, localeCode],
  );

  // ─── Navigation handlers ───────────────────────────────────────────────────

  const handleDecisionPillPress = useCallback(() => {
    router.push('/(supervisor)/decisions');
  }, []);

  const handleOpenComplaintThread = useCallback((complaintId: string) => {
    // Until the Complaints drawer thread view ships, route to the chat
    // surface scoped via `complaintId` so the supervisor sees the context
    // without a 404. Per `supervisor-drawer-and-decisions-redesign.md §C.4`.
    router.push({
      pathname: '/(supervisor)/chat',
      params: { complaintId },
    });
  }, []);

  const handleClarifySelect = useCallback(
    (option: string) => {
      // Tapping a chip = sending the chosen option as a typed message.
      void onSend(option, null);
    },
    [onSend],
  );

  const handleDismissAmend = useCallback(() => {
    setAmendTargetId(null);
  }, []);

  // ─── Render helpers ────────────────────────────────────────────────────────

  // Determine the index of the last assistant message to identify the most-recent pair.
  const { lastAssistantIdx, lastUserIdx } = useMemo(() => {
    let lastAssistant = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.role === 'assistant') {
        lastAssistant = i;
        break;
      }
    }
    let lastUser = -1;
    if (lastAssistant > 0) {
      for (let i = lastAssistant - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.role === 'user') {
          lastUser = i;
          break;
        }
      }
    } else {
      // No assistant yet — last user is the literal last user index.
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.role === 'user') {
          lastUser = i;
          break;
        }
      }
    }
    return { lastAssistantIdx: lastAssistant, lastUserIdx: lastUser };
  }, [messages]);

  const renderItem = useCallback(
    ({ item, index }: { item: LocalMessage; index: number }) => {
      const isRecentPair = index === lastAssistantIdx || index === lastUserIdx;
      const dimmed = !isRecentPair && lastAssistantIdx !== -1;

      const isUser = item.role === 'user';
      const count = decisionCount(item);

      // Complaint confirmation: emitted by the AI's propose_log_complaint
      // tool when origin='CHAT'. Rendered below the assistant bubble in
      // place of the standard DecisionLinkPill (the complaint is already
      // applied — no "review in decisions" step).
      const complaintCard = !isUser ? readComplaintCard(item.decisionCard ?? null) : null;
      // Clarify chips: emitted when AI confidence < 0.7.
      const clarifyCard = !isUser ? readClarifyCard(item.decisionCard ?? null) : null;

      // The DecisionLinkPill should NOT render for complaint or clarify
      // cards (those have their own inline UX).
      const showLinkPill = !isUser && count > 0 && !complaintCard && !clarifyCard;

      return (
        <View>
          <ChatBubble role={item.role} text={item.text} dimmed={dimmed} status={item.status} />

          {/* Voice metadata pill — shown on user bubbles that originated
              from a held-mic capture. Duration is the real recorded length
              (Sprint-1 hardcoded `0:00` fix). */}
          {isUser && item.voice ? (
            <View style={[s.voiceMeta, dimmed && s.dimmed]}>
              <VoiceWaveformPill duration={item.voice.duration} listening={false} />
              <TranscriptionMeta confidence={item.voice.confidence} />
            </View>
          ) : null}

          {/* Inline assistant-side affordances */}
          {complaintCard ? (
            <ComplaintConfirmationBubble
              complaintId={complaintCard.complaintId}
              summary={complaintCard.summary}
              onOpenThread={handleOpenComplaintThread}
            />
          ) : null}

          {clarifyCard ? (
            <ClarifyChips
              question={clarifyCard.question}
              options={clarifyCard.options}
              onSelect={handleClarifySelect}
            />
          ) : null}

          {showLinkPill ? (
            <View style={[s.pillWrapper, dimmed && s.dimmed]}>
              <DecisionLinkPill count={count} onPress={handleDecisionPillPress} />
            </View>
          ) : null}
        </View>
      );
    },
    [
      lastAssistantIdx,
      lastUserIdx,
      handleDecisionPillPress,
      handleOpenComplaintThread,
      handleClarifySelect,
    ],
  );

  const isEmpty = messages.length === 0 && !thinking;
  const canAttachMore = attachments.length < MAX_ATTACHMENTS_PER_MESSAGE;
  const hasPendingUploads = attachments.some((a) => a.status === 'pending');
  const sendDisabled = thinking || budgetCapped || hasPendingUploads || !draft.trim();

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar title={strings.chat.title} subtitle="VOICE · MESSY INPUT" />

      {/* Amend mode banner — sticky above the message list. */}
      {amendTargetId ? (
        <AmendModeBanner
          targetDecisionId={amendTargetId}
          subject={`Decision ${amendTargetId.slice(0, 8)}…`}
          onDismiss={handleDismissAmend}
        />
      ) : null}

      <GreetingCard
        firstName={supervisorFirstName}
        siteCount={sitesActive}
        activeWorkerCount={workersActive}
      />

      {isEmpty ? (
        <View style={s.emptyArea}>
          <Text style={s.emptyTip}>Try saying:</Text>
          {EXAMPLE_PHRASES.map((phrase, i) => (
            <Text key={i} style={s.emptyPhrase}>
              {phrase}
            </Text>
          ))}
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ListHeaderComponent={<ContextSeparator />}
          ListFooterComponent={
            thinking ? (
              <View style={s.thinking}>
                <SkeletonBubble />
              </View>
            ) : null
          }
        />
      )}

      {/* Live transcript shimmer — appears between mic release and final
          transcript drop. Shows pulsing dots while uploading, then reveals
          the words at the recorded cadence. */}
      {transcribing || revealText ? (
        <LiveTranscriptShimmer
          uploading={transcribing && !revealText}
          text={revealText}
          words={revealWords}
        />
      ) : null}

      {/* Recording indicator — waveform pill with LIVE duration. */}
      {isRecording ? (
        <View style={s.recordingBanner}>
          <VoiceWaveformPill duration={formatDuration(durationMs)} listening={true} />
        </View>
      ) : null}

      {/* Photo attach strip — above the input footer. */}
      <PhotoAttachStrip
        attachments={attachments}
        onRemove={handleRemoveAttachment}
        onRetry={handleRetryAttachment}
      />

      {error ? (
        <View style={budgetCapped ? s.budgetBanner : s.errorBanner}>
          <Text style={budgetCapped ? s.budgetText : s.errorText}>{error}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={s.footer}>
          {/* Photo attach button — leftmost, low-emphasis. */}
          <Pressable
            onPress={handlePickPhoto}
            disabled={!canAttachMore || thinking || budgetCapped}
            accessibilityRole="button"
            accessibilityLabel={strings.chat.attachPhotoLabel}
            accessibilityState={{ disabled: !canAttachMore }}
            style={({ pressed }) => [
              s.attachBtn,
              (!canAttachMore || thinking || budgetCapped) && s.attachBtnDisabled,
              pressed && s.attachBtnPressed,
            ]}
          >
            <Feather name="paperclip" size={20} color={tokens.color.ink.secondary} />
          </Pressable>

          <TextInput
            ref={textInputRef}
            style={s.input}
            placeholder={strings.chat.inputPlaceholder}
            placeholderTextColor={tokens.color.ink.placeholder}
            value={draft}
            onChangeText={setDraft}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!thinking && !budgetCapped}
          />

          {/* Send button — appears when there's text to send AND no
              uploads pending. Mic and send are mutually exclusive UI
              affordances: text input + uploaded photo → send; empty
              input → mic. */}
          {draft.trim() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              onPress={handleSend}
              disabled={sendDisabled}
              style={({ pressed }) => [
                s.sendBtn,
                pressed && s.sendBtnPressed,
                sendDisabled && s.sendBtnDisabled,
              ]}
            >
              <Feather name="send" size={20} color={tokens.color.surface.card} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isRecording ? 'Recording — release to transcribe' : 'Hold to record voice'
              }
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              disabled={thinking || budgetCapped || transcribing}
              style={({ pressed }) => [s.micBtn, (pressed || isRecording) && s.micBtnActive]}
            >
              <Feather
                name="mic"
                size={22}
                color={isRecording ? tokens.color.brand.accent : tokens.color.surface.card}
              />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  list: {
    paddingHorizontal: tokens.space[3],
    paddingBottom: tokens.space[4],
  },
  emptyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[6],
    gap: tokens.space[2],
  },
  emptyTip: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[1],
  },
  emptyPhrase: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    lineHeight: tokens.type.body.size * 1.6,
  },
  thinking: {
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
  },
  voiceMeta: {
    alignItems: 'flex-end',
    marginTop: -tokens.space[2],
    marginBottom: tokens.space[2],
  },
  pillWrapper: {
    paddingHorizontal: 0,
    marginBottom: tokens.space[2],
  },
  dimmed: {
    opacity: 0.55,
  },
  errorBanner: {
    padding: tokens.space[2] + 2,
    backgroundColor: tokens.color.semantic.badSoft,
    borderTopWidth: 1,
    borderColor: tokens.color.semantic.bad,
  },
  errorText: {
    color: tokens.color.semantic.bad,
    fontSize: 13,
  },
  budgetBanner: {
    padding: tokens.space[2] + 2,
    backgroundColor: tokens.color.semantic.warnSoft,
    borderTopWidth: 1,
    borderColor: tokens.color.semantic.warn,
  },
  budgetText: {
    color: tokens.color.semantic.warn,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    paddingTop: tokens.space[2],
    paddingBottom: tokens.space[3],
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper,
  },
  input: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    borderRadius: tokens.radius.r4,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[2] + 2,
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
    minHeight: 44,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper2,
  },
  attachBtnDisabled: {
    opacity: 0.4,
  },
  attachBtnPressed: {
    opacity: 0.7,
  },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: tokens.color.brand.accent2,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  micBtnActive: {
    opacity: 0.85,
    backgroundColor: tokens.color.surface.card,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tokens.color.brand.accent2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: tokens.color.brand.accent2,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  recordingBanner: {
    backgroundColor: tokens.color.ink.primary,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[1],
    alignItems: 'flex-end',
  },
});
