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
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/chat/completions.mjs';

import {
  modelFor,
  tokenCostInrFor,
  assertWithinBudget,
  type AISurface,
  type TenantBudgetCtx,
} from './model-policy.js';

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
  /**
   * AI surface enum (per ADR-0023) — drives per-call cost ceiling and
   * cost-tracking attribution. Required so model-policy can resolve the
   * daily-budget gate against the right surface ceiling.
   * @derives(ADR-0023) @derives(spec-2 §9.2)
   */
  surface: AISurface;
  /**
   * Tenant context for daily-budget enforcement. When provided, the loop
   * calls `assertWithinBudget(surface, perCallCeiling, tenantCtx)` BEFORE
   * the first OpenAI call; if the projected spend would exceed the daily
   * cap, throws `AICostBudgetError` (chat route maps to HTTP 429). When
   * omitted, only the per-call ceiling is enforced.
   * @derives(spec-2 §9.2)
   */
  tenantCtx?: TenantBudgetCtx;
  /**
   * Tier 2 prompt block — supervisor's LivingDoc context (rules, aliases).
   * Inserted as a SECOND system message between the main system prompt
   * (Tier 1, fully stable) and priorMessages so OpenAI can cache the
   * stable Tier 1 prefix even as Tier 2 changes per supervisor.
   * Empty/undefined → no Tier 2 system message inserted.
   * @derives(spec-2 §6.1, §8.1)
   */
  livingDocBlock?: string;
  /**
   * Tier 3 prompt block — last 30 days CalendarEntry for this supervisor.
   * Inserted after Tier 2, before priorMessages. Same caching rationale.
   * Empty/undefined → no Tier 3 system message inserted.
   * @derives(spec-2 §8.1)
   */
  calendarBlock?: string;
  /**
   * For OpenAI prompt_cache_key shape:
   *   "${companyId}:${supervisorId}:v${livingDocVersion}"
   * Routes per-supervisor cache to consistent backend partitions and
   * busts cache when LivingDoc.version increments. Falls back to no key
   * when chat.ts didn't provide context.
   * @derives(spec-2 §8.2)
   */
  livingDocVersion?: number;
  companyId?: string;
  supervisorId?: string;
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
  /**
   * Computed INR cost for this call from `tokenCostInrFor(model, usage)`.
   * Caller persists to `ChatMessage.costInr` AND increments
   * `Company.aiSpendDailyInr` atomically inside the same write transaction.
   * @derives(spec-2 §9.2)
   */
  costInr: number;
  /** Resolved model used (post-DEFAULT_MODEL fallback). */
  modelUsed: string;
  /**
   * OpenAI `usage.prompt_tokens_details.cached_tokens` from the final
   * response — null when the model/SDK doesn't surface it. Persisted
   * to `ChatMessage.cacheTokens` for the `ai_cost_daily` view.
   * @derives(spec-2 §8.3)
   */
  cacheTokens: number | null;
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
  const { apiKey, systemPrompt, userMessage, tools, handler, surface } = args;
  const model = args.model ?? DEFAULT_MODEL;
  const maxIterations = args.maxIterations ?? 10;
  const timeoutMs = args.timeoutMs ?? 9000;
  const startedAt = Date.now();

  // Pre-flight gateway check: per-call ceiling + (when tenantCtx provided)
  // tenant daily-budget cap. Throws AICostBudgetError if projected daily
  // spend would breach Spec 2 §9 cap. Caller (chat route) catches and
  // returns HTTP 429 to the client.
  const choice = modelFor(surface);
  await assertWithinBudget(surface, choice.maxCostPerCallInr, args.tenantCtx);

  const openai = new OpenAI({ apiKey });
  const openaiTools = toOpenAITools(tools);

  // Spec 2 §8.1 — 3-tier message structure for OpenAI by-prefix auto-cache:
  //   Tier 1 (stable) — main systemPrompt + tools (passed via openaiTools arg)
  //   Tier 2 (per-supervisor) — livingDocBlock as a 2nd system message
  //   Tier 3a (per-supervisor recent) — calendarBlock as a 3rd system message
  //   Tier 3b (per-call) — priorMessages + userMessage
  // Empty Tier 2/3a strings are skipped so we don't waste a slot.
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }];
  if (args.livingDocBlock && args.livingDocBlock.length > 0) {
    messages.push({ role: 'system', content: args.livingDocBlock });
  }
  if (args.calendarBlock && args.calendarBlock.length > 0) {
    messages.push({ role: 'system', content: args.calendarBlock });
  }
  for (const m of args.priorMessages ?? []) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: userMessage });

  // Spec 2 §8.2 — prompt_cache_key routes per-supervisor cache to
  // consistent backend partitions and busts cache when LivingDoc.version
  // changes. Only set when caller provided full ctx (chat.ts always does;
  // future test paths may not).
  const promptCacheKey =
    args.companyId && args.supervisorId && args.livingDocVersion !== undefined
      ? `${args.companyId}:${args.supervisorId}:v${args.livingDocVersion}`
      : undefined;

  const toolCalls: OpenAIToolLoopResult['toolCalls'] = [];
  const decisionCards: OpenAIToolLoopResult['decisionCards'] = [];
  let finalUsage = { inputTokens: 0, outputTokens: 0 };
  let finalCacheTokens: number | null = null;
  let finalText = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('AI_TOOL_LOOP_TIMEOUT');
    }

    // Spec 2 §8.2 — `prompt_cache_key` is a real OpenAI request-body param
    // (added late 2024) but `openai@4.104.0` SDK types don't include it yet.
    // Build the body as the typed non-streaming params object then add the
    // optional cache-key field via a narrow cast — justified external-
    // boundary cast per `feedback_no_ui_code_without_panel_approval` iter 4.
    const body: ChatCompletionCreateParamsNonStreaming & { prompt_cache_key?: string } = {
      model,
      messages,
      tools: openaiTools,
      tool_choice: 'auto',
      // GPT-5 models reject `max_tokens` and require `max_completion_tokens`.
      max_completion_tokens: 1500,
    };
    if (promptCacheKey) body.prompt_cache_key = promptCacheKey;
    const response = await openai.chat.completions.create(body);

    if (response.usage) {
      finalUsage = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      };
      // Spec 2 §8.3 — capture cached_tokens for ai_cost_daily view.
      // Null-safe: older SDK responses or models without cache surface
      // may omit `prompt_tokens_details` entirely.
      const detailed = (response.usage as { prompt_tokens_details?: { cached_tokens?: number } })
        .prompt_tokens_details;
      if (detailed && typeof detailed.cached_tokens === 'number') {
        finalCacheTokens = detailed.cached_tokens;
      }
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

  const costInr = tokenCostInrFor(model, finalUsage);

  return {
    finalText,
    toolCalls,
    decisionCards,
    elapsedMs: Date.now() - startedAt,
    usage: finalUsage,
    costInr,
    modelUsed: model,
    cacheTokens: finalCacheTokens,
  };
}
