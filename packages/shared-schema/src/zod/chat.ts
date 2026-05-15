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
