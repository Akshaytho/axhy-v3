/**
 * @axhy/ai-tools/model-policy
 *
 * Single source of truth for which AI model serves which surface.
 * Calling code passes a surface enum; model resolves through this table.
 *
 * Hard rule: no surface picks its own model. Cost regressions live or die here.
 *
 * @derives(ADR-0023)
 */

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
    vendor: 'anthropic',
    model: 'claude-sonnet-4-6',
    maxCostPerCallInr: 1.0,
    rationale:
      'Mix-language NLP (hi/te/en/code-switched). Sonnet handles ambiguity well at mid cost.',
  },
  ai_verification: {
    vendor: 'openai',
    model: 'gpt-5.4',
    maxCostPerCallInr: 1.0,
    rationale:
      'Multimodal reasoning (photos + voice + supervisor expectation). GPT-5.4 multimodal at competitive cost.',
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
 * Validate that an estimated cost falls within the surface's budget.
 * Throws if over the ceiling. Use at the gateway, before the API call.
 *
 * @derives(ADR-0023)
 */
export function assertWithinBudget(surface: AISurface, estimatedCostInr: number): void {
  const choice = modelFor(surface);
  if (estimatedCostInr > choice.maxCostPerCallInr) {
    throw new Error(
      `[ai-tools] Cost ceiling exceeded on ${surface}: estimated ₹${estimatedCostInr.toFixed(4)} > ceiling ₹${choice.maxCostPerCallInr}. ` +
        `Either chunk the input, downgrade the surface tier, or amend ADR-0023.`,
    );
  }
}

/**
 * All defined surfaces. Use for cost-dashboard rendering.
 *
 * @derives(ADR-0023)
 */
export const ALL_SURFACES: ReadonlyArray<AISurface> = Object.keys(POLICY) as AISurface[];
