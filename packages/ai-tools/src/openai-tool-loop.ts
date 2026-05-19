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
import { CHAT_MAX_COMPLETION_TOKENS } from '@axhy/business-rules';

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
   * Tier 1.1 prompt block — Company rules from Policy table, DATA-wrapped
   * by prompt-composer.composeCompanyRulesBlock. Inserted right after the
   * main system prompt so Layer 1 is visually FIRST (and highest priority)
   * in the rule hierarchy per docs/locked/rule-hierarchy-three-layers.md.
   * Empty/undefined → slot skipped.
   * @derives(docs/locked/chat-sidebar-context-flow.md step 6)
   */
  companyRulesBlock?: string;
  /**
   * Tier 1.2 prompt block — HR rules from Policy table, DATA-wrapped by
   * prompt-composer.composeHrRulesBlock. Inserted between Company rules
   * and LivingDoc. Empty/undefined → slot skipped.
   * @derives(docs/locked/rule-hierarchy-three-layers.md)
   */
  hrRulesBlock?: string;
  /**
   * Amend-mode hint, DATA-wrapped by prompt-composer.composeAmendBlock.
   * Inserted between calendarBlock and priorMessages. Empty/undefined →
   * not in amend mode. Replaces the raw chat.ts amendHint concat per
   * docs/locked/chat-abuse-prevention.md Prompt Injection Defense.
   */
  amendBlock?: string;
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
  /**
   * Optional AbortSignal — when the caller (chat route) detects a client
   * disconnect (mobile closes app, request canceled), abort the in-flight
   * OpenAI call so we stop burning tokens for a response nobody will read.
   * Per friend review Wave A.2 #23.
   */
  abortSignal?: AbortSignal;
};

/**
 * Singleton OpenAI client per apiKey. Friend review #4: creating a fresh
 * OpenAI client per request thrashes the TLS handshake + connection pool.
 * Keep one client per apiKey and reuse it.
 */
const openAIClients = new Map<string, OpenAI>();
function getOpenAIClient(apiKey: string): OpenAI {
  const existing = openAIClients.get(apiKey);
  if (existing) return existing;
  const client = new OpenAI({ apiKey });
  openAIClients.set(apiKey, client);
  return client;
}

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

  const openai = getOpenAIClient(apiKey);
  const openaiTools = toOpenAITools(tools);

  // docs/locked/chat-sidebar-context-flow.md step 6 — 6-tier message structure
  // for OpenAI by-prefix auto-cache (Wave A 2026-05-19):
  //   System          stable systemPrompt + tools (cached forever)
  //   Tier 1 (L1)     companyRulesBlock — DATA-wrapped Policy rows for company
  //   Tier 2 (L2)     hrRulesBlock      — DATA-wrapped Policy rows for HR
  //   Tier 3 (L3)     livingDocBlock    — supervisor's personal rules
  //   Tier 4          calendarBlock     — last 30 days CalendarEntry
  //   Amend           amendBlock        — DATA-wrapped amend-mode hint, when active
  //   Tier 5          priorMessages     — last N chat turns
  //   User            userMessage       — the current turn
  //
  // Empty strings are skipped so we don't waste a system-message slot.
  //
  // Cache stability: Tier 1 + Tier 2 are per-tenant so they share a prefix
  // across all supervisors of the same company. Tier 3 + Tier 4 are
  // per-supervisor and cached via prompt_cache_key + livingDocVersion.
  // Amend block is per-turn-only and lives after the cached prefix on
  // purpose (would otherwise bust per-amend turns).
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }];
  if (args.companyRulesBlock && args.companyRulesBlock.length > 0) {
    messages.push({ role: 'system', content: args.companyRulesBlock });
  }
  if (args.hrRulesBlock && args.hrRulesBlock.length > 0) {
    messages.push({ role: 'system', content: args.hrRulesBlock });
  }
  if (args.livingDocBlock && args.livingDocBlock.length > 0) {
    messages.push({ role: 'system', content: args.livingDocBlock });
  }
  if (args.calendarBlock && args.calendarBlock.length > 0) {
    messages.push({ role: 'system', content: args.calendarBlock });
  }
  if (args.amendBlock && args.amendBlock.length > 0) {
    messages.push({ role: 'system', content: args.amendBlock });
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
  // Friend review #1 (CRITICAL): accumulate token usage across ALL tool-loop
  // iterations, not just the last call. Previously `finalUsage = {...}` on
  // each iter clobbered the running total — supervisors silently exceeded
  // their daily token budget because only the last call's tokens were
  // recorded on ChatMessage.tokensIn/Out (supervisor-token-cap.ts reads
  // those columns).
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let totalCacheTokens: number | null = null;
  let finalText = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('AI_TOOL_LOOP_TIMEOUT');
    }
    // Friend review #23 — client disconnect should abort. Cheap check at
    // top of each iteration before we make another API call.
    if (args.abortSignal?.aborted) {
      throw new Error('AI_TOOL_LOOP_ABORTED');
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
      max_completion_tokens: CHAT_MAX_COMPLETION_TOKENS,
    };
    if (promptCacheKey) body.prompt_cache_key = promptCacheKey;
    // Friend review #5 (HIGH): per-call timeout via AbortSignal so a
    // single hung OpenAI request can't run past the loop budget. The
    // remaining budget is total timeoutMs minus elapsed; minimum 5s so
    // a near-deadline call still has a chance to complete instead of
    // immediately erroring.
    const remainingBudgetMs = Math.max(5_000, timeoutMs - (Date.now() - startedAt));
    const perCallAc = new AbortController();
    const onCallerAbort = (): void => perCallAc.abort();
    if (args.abortSignal) {
      if (args.abortSignal.aborted) onCallerAbort();
      else args.abortSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    const callTimer = setTimeout(() => perCallAc.abort(), remainingBudgetMs);
    let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
    try {
      response = await openai.chat.completions.create(body, { signal: perCallAc.signal });
    } finally {
      clearTimeout(callTimer);
      if (args.abortSignal) args.abortSignal.removeEventListener('abort', onCallerAbort);
    }

    if (response.usage) {
      // Friend review #1 (CRITICAL): ACCUMULATE across iterations, not
      // overwrite. A 3-iteration tool loop has 3 OpenAI calls, each
      // with its own prompt_tokens + completion_tokens. The previous
      // overwrite pattern under-counted by up to 77% on multi-tool turns.
      totalUsage.inputTokens += response.usage.prompt_tokens;
      totalUsage.outputTokens += response.usage.completion_tokens;
      // Spec 2 §8.3 — accumulate cached_tokens too for ai_cost_daily.
      const detailed = (response.usage as { prompt_tokens_details?: { cached_tokens?: number } })
        .prompt_tokens_details;
      if (detailed && typeof detailed.cached_tokens === 'number') {
        totalCacheTokens = (totalCacheTokens ?? 0) + detailed.cached_tokens;
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
      } catch (parseErr) {
        // Wave 4b Phase 2.5 — was silent drop. Now a structured warn so
        // ops can detect pathological model JSON output. Handler still
        // gets empty {} and decides (most return BAD_TOOL_INPUT).

        console.warn(
          {
            event: 'openai_tool_loop.bad_tool_args_json',
            companyId: args.tenantCtx?.companyId,
            supervisorId: args.supervisorId,
            toolName: tc.function.name,
            err: parseErr instanceof Error ? parseErr.message : String(parseErr),
            rawTruncated: tc.function.arguments?.slice(0, 512) ?? null,
          },
          'openai-tool-loop: model emitted invalid JSON for tool args; passing {} to handler',
        );
        parsedInput = {};
      }
      // Friend review #2 — isolate handler failures. A DB blip in
      // find_workers should NOT kill the whole AI loop. Catch the throw,
      // return a TOOL_FAILED error message back to the model, let it
      // decide (retry with different args, ask the user, etc).
      let result: Awaited<ReturnType<OpenAIToolHandler>>;
      try {
        result = await handler(tc.function.name, parsedInput);
      } catch (handlerErr) {
        const errMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
        console.warn(
          {
            event: 'openai_tool_loop.handler_error',
            companyId: args.tenantCtx?.companyId,
            supervisorId: args.supervisorId,
            toolName: tc.function.name,
            err: errMsg,
          },
          'openai-tool-loop: handler threw — returning TOOL_FAILED to model',
        );
        result = {
          output: { error: 'TOOL_FAILED', message: errMsg.slice(0, 200) },
        };
      }
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

  const costInr = tokenCostInrFor(model, totalUsage);

  return {
    finalText,
    toolCalls,
    decisionCards,
    elapsedMs: Date.now() - startedAt,
    usage: totalUsage,
    costInr,
    modelUsed: model,
    cacheTokens: totalCacheTokens,
  };
}
