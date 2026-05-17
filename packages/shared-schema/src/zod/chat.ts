/**
 * @derives(master-plan §G)
 */

import { z } from 'zod';

/**
 * Attachment shape accepted on chat messages. Photos arrive as S3 signed-URL
 * references; mobile is responsible for the upload before invoking
 * `POST /chat/messages`. Wave-3 additive field — pre-Wave-3 clients omit
 * `attachments` and the route treats it as the empty array.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C — chat photo attach)
 */
export const ChatMessageAttachmentInput = z.object({
  type: z.literal('image'),
  url: z.string().url(),
});
export type ChatMessageAttachmentInputT = z.infer<typeof ChatMessageAttachmentInput>;

export const CreateChatMessageInput = z
  .object({
    /** Supervisor's transcript or typed text */
    text: z.string().min(1).max(2000),
    /** STT confidence if voice; null for typed */
    voiceConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
    /**
     * Optional photo attachments (Wave 3). Each entry must be a previously
     * uploaded S3 URL. Max 4 per message; the AI tool-loop reads them as
     * context when classifying intent (e.g. photo of a missed lobby tips
     * the classifier toward `log_complaint` with kind=missed_area).
     */
    attachments: z.array(ChatMessageAttachmentInput).max(4).optional(),
  })
  .strict();
export type CreateChatMessageInputT = z.infer<typeof CreateChatMessageInput>;

export const ApplyDecisionCardInput = z
  .object({
    /** ChatMessage.id whose DecisionCard should be applied */
    chatMessageId: z.string().uuid(),
    /** Tool name from the proposed action (must match what AI emitted) */
    toolName: z.string(),
    /** Tool input args (must match what AI emitted, copied from DecisionCard) */
    toolInput: z.record(z.unknown()),
    /**
     * SupervisorDecision.id that the chat extractor wrote when the AI proposed
     * this card. REQUIRED — every apply must transition a specific PROPOSED
     * row to its terminal state, otherwise the row leaks open and can be
     * applied / dismissed a second time (F-002 finding F2 / rule P4).
     *
     * F-002.5: the prior optional decisionId existed as a temporary back-compat
     * shim. That shim has been removed because the back-compat path was never
     * deployed (this slice is on a feature branch). Old clients now get 400
     * BAD_INPUT and must ship the new shape.
     *
     * @derives(F-002 scope §3a + §3b)
     * @derives(F-002.5 — back-compat removal per friend's required addition 2)
     */
    decisionId: z.string().uuid(),
  })
  .strict();
export type ApplyDecisionCardInputT = z.infer<typeof ApplyDecisionCardInput>;
