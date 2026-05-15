/**
 * @derives(master-plan §G)
 */

import { z } from 'zod';

export const CreateChatMessageInput = z
  .object({
    /** Supervisor's transcript or typed text */
    text: z.string().min(1).max(2000),
    /** STT confidence if voice; null for typed */
    voiceConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
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
     * this card. Required so /chat/apply can transition the PROPOSED row to
     * APPLIED in the same flow as the domain write. Optional during the F-002
     * transition for back-compat with mobile clients that haven't shipped the
     * new decisionCard.decisionId field yet — when omitted, /chat/apply
     * proceeds without lifecycle update + logs a warning.
     * @derives(F-002 scope §3a + §3b)
     */
    decisionId: z.string().uuid().optional(),
  })
  .strict();
export type ApplyDecisionCardInputT = z.infer<typeof ApplyDecisionCardInput>;
