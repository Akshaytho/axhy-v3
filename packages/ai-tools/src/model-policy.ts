/**
 * @axhy/ai-tools/model-policy
 *
 * Single source of truth for which AI model serves which surface.
 * Calling code passes a surface enum; model resolves through this table.
 *
 * Hard rule: no surface picks its own model. Cost regressions live or die here.
 *
 * @derives(ADR-0023)
 * @derives(spec-2 §9) — per-tenant daily AI cost ceiling integrated below
 */

import type { Prisma } from '@prisma/client';
import { PRICING, inrFromPaise } from '@axhy/business-rules';

import { AICostBudgetError } from './errors.js';
import { dispatchBudgetAlert, type DbClient } from './cost-tracking.js';

export type AISurface =
  | 'voice_change_parse' // supervisor voice → structured changes
  | 'ai_verification' // worker photo + voice → assessment
  | 'ai_onboarding' // 50-question new-tenant setup
  | 'alias_map' // worker name + nickname matching
  | 'transcript_cleanup' // Sarvam low-confidence transcript polish
  | 'stt_monolingual' // Sarvam STT
  | 'stt_codeswitched' // Whisper STT
  | 'embed_general' // our code + non-PII text
  | 'embed_customer_voice'; // customer voice transcripts (DPDP-pinned)

export type AIVendor = 'anthropic' | 'openai' | 'sarvam' | 'cohere';

export type ModelChoice = {
  vendor: AIVendor;
  model: string;
  /** Max acceptable cost per call in INR. Gateway throws AICostBudgetError if exceeded. */
  maxCostPerCallInr: number;
  /** Free-form rationale; rendered in cost dashboard for ops review. */
  rationale: string;
};

const POLICY: Record<AISurface, ModelChoice> = {
  voice_change_parse: {
    vendor: 'openai',
    model: 'gpt-5.4-nano',
    maxCostPerCallInr: 0.1,
    rationale:
      'Founder-locked 2026-05-10. Switched from Sonnet 4.6 (₹4/call, 6-12× over master-plan ₹2/visit budget) to gpt-5.4-nano (~₹0.07/call). Watching multilingual hi/te quality — escalate to Sonnet if accuracy regresses materially.',
  },
  ai_verification: {
    vendor: 'openai',
    model: 'gpt-5.4-nano',
    maxCostPerCallInr: 1.0,
    rationale:
      'Founder-locked 2026-06-03: switched from gpt-5.4 to gpt-5.4-nano. Vision uses detail:low (~85 tok/img) and caps at 2 before + 2 after photos, so 4-image multimodal cost lands ~₹0.4/call worst case, comfortably under the ₹1 ceiling. Watching pass/flag accuracy on first 100 visits — escalate to gpt-5.4 if false-pass rate above 5%.',
  },
  ai_onboarding: {
    vendor: 'anthropic',
    model: 'claude-opus-4-7',
    maxCostPerCallInr: 50.0,
    rationale:
      '50-question conversational setup, sets up tenant context for life. Quality > cost. Low volume (1 per new customer).',
  },
  alias_map: {
    vendor: 'openai',
    model: 'gpt-5.4-nano',
    maxCostPerCallInr: 0.05,
    rationale:
      'Worker nickname matching. High volume, low complexity. Nano is 60× cheaper than Opus.',
  },
  transcript_cleanup: {
    vendor: 'anthropic',
    model: 'claude-haiku-4-5',
    maxCostPerCallInr: 0.2,
    rationale: 'Polish Sarvam low-confidence transcripts. Fast, cheap, just cleanup.',
  },
  stt_monolingual: {
    vendor: 'sarvam',
    model: 'saarika-v2',
    maxCostPerCallInr: 5.0,
    rationale:
      'Monolingual hi/te/ta/mr in Indian region (DPDP). Better accent quality than Whisper.',
  },
  stt_codeswitched: {
    vendor: 'openai',
    model: 'whisper-large-v3',
    maxCostPerCallInr: 3.0,
    rationale: "Code-switched / mixed-language STT. Sarvam doesn't handle this well yet.",
  },
  embed_general: {
    vendor: 'openai',
    model: 'text-embedding-3-small',
    maxCostPerCallInr: 0.05,
    rationale: 'Our code + general text. Cheap, 1536-dim, high quality at our scale.',
  },
  embed_customer_voice: {
    vendor: 'cohere',
    model: 'embed-multilingual-v3.0',
    maxCostPerCallInr: 0.1,
    rationale:
      'Customer voice transcripts. India region for DPDP residency. Multilingual for hi/te/en.',
  },
};

/**
 * Resolve the model for a given AI surface.
 *
 * @derives(ADR-0023)
 */
export function modelFor(surface: AISurface): ModelChoice {
  const choice = POLICY[surface];
  if (!choice) {
    throw new Error(`No model policy defined for surface: ${surface}`);
  }
  return choice;
}

/**
 * Per-1K-token rates in INR for cost computation from OpenAI/Anthropic
 * usage objects. Numbers approximate vendor pricing as of 2026-05-10;
 * refresh when vendor pricing changes.
 *
 * Rates here are the SOURCE of truth for `costInr` written to ChatMessage.
 * Centralized so a vendor price change is one diff, not a grep.
 *
 * @derives(ADR-0023)
 * @derives(spec-2 §9) — drives `Company.aiSpendDailyInr` increments
 */
const TOKEN_COSTS_INR_PER_1K: Record<string, { input: number; output: number }> = {
  // OpenAI gpt-5.4-nano — per founder lock 2026-05-10 (chat surface).
  // ~₹0.04 / 1K input + ~₹0.16 / 1K output (rough USD→INR ≈ 84.0).
  'gpt-5.4-nano': { input: 0.04, output: 0.16 },
  // OpenAI gpt-5.4 — multimodal AI verification surface.
  'gpt-5.4': { input: 0.4, output: 1.6 },
  // Anthropic claude-haiku-4-5 — transcript cleanup.
  'claude-haiku-4-5': { input: 0.08, output: 0.32 },
  // Anthropic claude-opus-4-7 — onboarding flow.
  'claude-opus-4-7': { input: 1.6, output: 8.0 },
};

/**
 * Compute the INR cost of a single AI call from token usage.
 * Falls back to 0 (zero-cost) when the model isn't in the rate table —
 * prefer over a throw so cost tracking never blocks an AI call; ops
 * triages missing rates from logs / dashboard.
 *
 * @derives(ADR-0023)
 */
export function tokenCostInrFor(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const rate = TOKEN_COSTS_INR_PER_1K[model];
  if (!rate) return 0;
  const inputCost = (usage.inputTokens / 1000) * rate.input;
  const outputCost = (usage.outputTokens / 1000) * rate.output;
  return inputCost + outputCost;
}

/** Tenant-scoped context for daily-budget enforcement (Spec 2 §9). */
export type TenantBudgetCtx = {
  companyId: string;
  prisma: DbClient;
};

/**
 * Validate that an estimated cost falls within the surface's per-call ceiling
 * AND (when ctx provided) within the tenant's daily budget.
 *
 * Per-call ceiling: throws plain Error (legacy behavior; never reached at
 * runtime today because no surface passes an estimate over its ceiling).
 *
 * Tenant daily budget: when ctx provided, fetches `Company.aiSpendDailyInr`
 * and projects `current + estimatedCostInr`:
 *   - projected ≥ cap → fires `dispatchBudgetAlert(CAP)` and throws
 *     `AICostBudgetError` (chat route maps to HTTP 429).
 *   - just-crossed warn (current < warn AND projected ≥ warn) → fires
 *     `dispatchBudgetAlert(WARN)` (idempotent: at most one warn per
 *     tenant per UTC day; further calls are P2002 no-ops).
 *
 * @derives(ADR-0023)
 * @derives(spec-2 §9.2)
 */
export async function assertWithinBudget(
  surface: AISurface,
  estimatedCostInr: number,
  ctx?: TenantBudgetCtx,
): Promise<void> {
  const choice = modelFor(surface);
  if (estimatedCostInr > choice.maxCostPerCallInr) {
    throw new Error(
      `[ai-tools] Cost ceiling exceeded on ${surface}: estimated ₹${estimatedCostInr.toFixed(4)} > ceiling ₹${choice.maxCostPerCallInr}. ` +
        `Either chunk the input, downgrade the surface tier, or amend ADR-0023.`,
    );
  }
  if (!ctx) return;

  // #16: the cumulative tenant daily-budget projection lives in its own exported
  // helper so the tool loop can re-check it per iteration with the turn's
  // ACCUMULATED real cost (not just one pre-call ceiling, checked once).
  await assertTenantDailyBudget(ctx, estimatedCostInr);
}

/**
 * Tenant daily-budget projection. Fetches `Company.aiSpendDailyInr` and projects
 * `current + projectedAdditionalInr` against the WARN/CAP thresholds:
 *   - projected ≥ cap → `dispatchBudgetAlert(CAP)` + throw `AICostBudgetError`.
 *   - just-crossed warn → `dispatchBudgetAlert(WARN)` (idempotent, ≤1/tenant/day).
 *
 * Pure READ + (idempotent) alert — it NEVER writes aiSpendDailyInr (incrementSpend
 * owns that), so it is safe to call repeatedly within a single turn. #16 uses this
 * to bound a multi-step tool loop: each iteration projects pre-turn spend + the
 * cost accumulated so far this turn + the next call's ceiling.
 *
 * @derives(ADR-0023) @derives(spec-2 §9.2) @derives(PRODUCTION_BUG_LEDGER.md #16)
 */
export async function assertTenantDailyBudget(
  ctx: TenantBudgetCtx,
  projectedAdditionalInr: number,
): Promise<void> {
  const company = await ctx.prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { aiSpendDailyInr: true },
  });
  if (!company) {
    throw new Error(`assertTenantDailyBudget: company ${ctx.companyId} not found`);
  }
  // Prisma returns Decimal; coerce to plain number for arithmetic. Values are
  // bounded (max plausible ₹99M), so toNumber() is exact for this comparison.
  const current = (company.aiSpendDailyInr as unknown as Prisma.Decimal).toNumber();
  const projected = current + projectedAdditionalInr;
  const warnInr = inrFromPaise(PRICING.aiBudgetDailyWarnPaise);
  const capInr = inrFromPaise(PRICING.aiBudgetDailyCapPaise);

  if (projected >= capInr) {
    await dispatchBudgetAlert(ctx.companyId, 'CAP', ctx.prisma);
    throw new AICostBudgetError({
      companyId: ctx.companyId,
      currentSpendInr: current,
      capInr,
      attemptedCostInr: projectedAdditionalInr,
    });
  }

  if (current < warnInr && projected >= warnInr) {
    await dispatchBudgetAlert(ctx.companyId, 'WARN', ctx.prisma);
  }
}

/**
 * All defined surfaces. Use for cost-dashboard rendering.
 *
 * @derives(ADR-0023)
 */
export const ALL_SURFACES: ReadonlyArray<AISurface> = Object.keys(POLICY) as AISurface[];
