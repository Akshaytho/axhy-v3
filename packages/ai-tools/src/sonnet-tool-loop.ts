/**
 * Anthropic Sonnet 4.6 tool-use loop wrapper.
 *
 * Takes a user message + tools + a tool-execution callback.
 * Runs the loop: assistant → tool_use → callback → tool_result → assistant ...
 * Returns the final assistant message + any DecisionCard data extracted from
 * propose_* tool calls (these don't commit; they return data for client confirm).
 *
 * @derives(ADR-0023)
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ContentBlock,
  ToolUseBlock,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages.mjs';

export type ToolHandler = (
  name: string,
  input: Record<string, unknown>,
) => Promise<{
  /** Result fed back to the model. JSON-stringifiable. */
  output: unknown;
  /** If this is a propose_* tool, the DecisionCard data to surface to client. */
  decisionCardData?: Record<string, unknown>;
}>;

export type SonnetToolLoopArgs = {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  tools: Tool[];
  handler: ToolHandler;
  /** Hard cap to prevent runaway loops. */
  maxIterations?: number;
  /** Total time budget in ms. */
  timeoutMs?: number;
};

export type SonnetToolLoopResult = {
  finalText: string;
  toolCalls: Array<{
    toolName: string;
    toolCallId: string;
    input: Record<string, unknown>;
    output?: unknown;
  }>;
  decisionCards: Array<Record<string, unknown>>;
  /** ms total elapsed */
  elapsedMs: number;
  /** Anthropic usage from final response (last call) */
  usage: { inputTokens: number; outputTokens: number };
};

const MODEL = 'claude-sonnet-4-6';

export async function sonnetToolLoop(args: SonnetToolLoopArgs): Promise<SonnetToolLoopResult> {
  const { apiKey, systemPrompt, userMessage, tools, handler } = args;
  const maxIterations = args.maxIterations ?? 10;
  const timeoutMs = args.timeoutMs ?? 9000;
  const startedAt = Date.now();

  const anthropic = new Anthropic({ apiKey });

  const messages: MessageParam[] = [{ role: 'user', content: userMessage }];
  const toolCalls: SonnetToolLoopResult['toolCalls'] = [];
  const decisionCards: SonnetToolLoopResult['decisionCards'] = [];
  let finalUsage = { inputTokens: 0, outputTokens: 0 };
  let finalText = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('AI_TOOL_LOOP_TIMEOUT');
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      tools,
      messages,
    });

    finalUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    const toolUseBlocks = response.content.filter(
      (b: ContentBlock): b is ToolUseBlock => b.type === 'tool_use',
    );
    const textBlocks = response.content.filter(
      (b: ContentBlock): b is TextBlock => b.type === 'text',
    );

    // Append assistant message with all blocks for tool-result correlation
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      // No more tool calls — done
      finalText = textBlocks.map((b) => b.text).join('\n');
      break;
    }

    // Execute each tool, append tool_result blocks for next iteration
    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
    for (const block of toolUseBlocks) {
      const result = await handler(block.name, block.input as Record<string, unknown>);
      toolCalls.push({
        toolName: block.name,
        toolCallId: block.id,
        input: block.input as Record<string, unknown>,
        output: result.output,
      });
      if (result.decisionCardData) {
        decisionCards.push({
          toolName: block.name,
          toolCallId: block.id,
          ...result.decisionCardData,
        });
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result.output),
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return {
    finalText,
    toolCalls,
    decisionCards,
    elapsedMs: Date.now() - startedAt,
    usage: finalUsage,
  };
}
