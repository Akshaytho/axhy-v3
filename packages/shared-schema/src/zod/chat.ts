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
  })
  .strict();
export type ApplyDecisionCardInputT = z.infer<typeof ApplyDecisionCardInput>;
