/**
 * OpenAI gpt-5.4-nano tool-use (function-calling) loop wrapper.
 *
 * Mirrors the SonnetToolLoop signature so chat.ts can swap providers
 * with one import change. Internally translates Anthropic-shaped tool
 * defs `{ name, description, input_schema }` to OpenAI-shaped
 * `{ type: 'function', function: { name, description, parameters } }`.
 *
 * Founder-locked 2026-05-10: switched chat surface from Anthropic Sonnet
 * to OpenAI gpt-5.4-nano. Reasons: ~60× cheaper than Sonnet (master plan
 * §B target ₹2/visit was being missed at 6-12× by Sonnet), and existing
 * model-policy already had gpt-5.4-nano for `alias_map` surface.
 *
 * @derives(ADR-0023)
 * @derives(master-plan §B — AI cost budget ₹2/visit)
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions.mjs';

/** Anthropic-shaped tool def used everywhere in @axhy/ai-tools. */
export type AnthropicShapedTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type OpenAIToolHandler = (
  name: string,
  input: Record<string, unknown>,
) => Promise<{
  /** Result fed back to the model. JSON-stringifiable. */
  output: unknown;
  /** If this is a propose_* tool, the DecisionCard data to surface to client. */
  decisionCardData?: Record<string, unknown>;
}>;

export type OpenAIPriorMessage = { role: 'user' | 'assistant'; content: string };

export type OpenAIToolLoopArgs = {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  /** Tools in Anthropic format — auto-converted to OpenAI format internally. */
  tools: ReadonlyArray<AnthropicShapedTool>;
  handler: OpenAIToolHandler;
  /**
   * Prior turns from the same supervisor's chat thread, oldest → newest.
   * Inserted between system prompt and current userMessage so the model
   * has continuity ("Mukesh kal Mall" → "kis time?" → "9 baje" all stitched).
   * Caller is responsible for trimming to a reasonable window (e.g. last 10 turns).
   */
  priorMessages?: ReadonlyArray<OpenAIPriorMessage>;
  /** Optional override; defaults to gpt-5.4-nano per founder lock 2026-05-10. */
  model?: string;
  /** Hard cap to prevent runaway loops. */
  maxIterations?: number;
  /** Total time budget in ms. */
  timeoutMs?: number;
};

export type OpenAIToolLoopResult = {
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
  /** OpenAI usage from final response (last call) */
  usage: { inputTokens: number; outputTokens: number };
};

const DEFAULT_MODEL = 'gpt-5.4-nano';

/**
 * Convert Anthropic-shaped tools `{ name, description, input_schema }`
 * to OpenAI-shaped `{ type: 'function', function: { name, description,
 * parameters } }`. The JSON Schema body is identical between the two
 * vendors, so it's a wrap, not a translate.
 */
function toOpenAITools(tools: ReadonlyArray<AnthropicShapedTool>): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

export async function openaiToolLoop(args: OpenAIToolLoopArgs): Promise<OpenAIToolLoopResult> {
  const { apiKey, systemPrompt, userMessage, tools, handler } = args;
  const model = args.model ?? DEFAULT_MODEL;
  const maxIterations = args.maxIterations ?? 10;
  const timeoutMs = args.timeoutMs ?? 9000;
  const startedAt = Date.now();

  const openai = new OpenAI({ apiKey });
  const openaiTools = toOpenAITools(tools);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...(args.priorMessages ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const toolCalls: OpenAIToolLoopResult['toolCalls'] = [];
  const decisionCards: OpenAIToolLoopResult['decisionCards'] = [];
  let finalUsage = { inputTokens: 0, outputTokens: 0 };
  let finalText = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('AI_TOOL_LOOP_TIMEOUT');
    }

    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: openaiTools,
      tool_choice: 'auto',
      // GPT-5 models reject `max_tokens` and require `max_completion_tokens`.
      max_completion_tokens: 1500,
    });

    if (response.usage) {
      finalUsage = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      };
    }

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('OPENAI_NO_CHOICE');
    }

    const assistantMessage = choice.message;
    const requestedToolCalls: ChatCompletionMessageToolCall[] = assistantMessage.tool_calls ?? [];

    // Append assistant turn (with tool_calls if any) so OpenAI sees the
    // canonical alternation it requires for tool_result correlation.
    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      ...(requestedToolCalls.length > 0 ? { tool_calls: requestedToolCalls } : {}),
    });

    if (choice.finish_reason !== 'tool_calls' || requestedToolCalls.length === 0) {
      // No more tool calls — done. Capture any text content.
      finalText = assistantMessage.content ?? '';
      break;
    }

    // Execute each tool, append a tool message per call (OpenAI shape).
    for (const tc of requestedToolCalls) {
      if (tc.type !== 'function') continue;
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        // Model emitted invalid JSON; pass an empty object so handler can decide.
        parsedInput = {};
      }
      const result = await handler(tc.function.name, parsedInput);
      toolCalls.push({
        toolName: tc.function.name,
        toolCallId: tc.id,
        input: parsedInput,
        output: result.output,
      });
      if (result.decisionCardData) {
        decisionCards.push({
          toolName: tc.function.name,
          toolCallId: tc.id,
          ...result.decisionCardData,
        });
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result.output),
      });
    }
  }

  return {
    finalText,
    toolCalls,
    decisionCards,
    elapsedMs: Date.now() - startedAt,
    usage: finalUsage,
  };
}
