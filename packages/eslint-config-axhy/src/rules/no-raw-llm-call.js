/**
 * axhy/no-raw-llm-call — Custom ESLint rule
 *
 * Direct LLM SDK calls (OpenAI / Anthropic) are forbidden outside the
 * @axhy/ai-tools wrappers. All AI traffic must route through
 * `openaiToolLoop`, `sonnetToolLoop`, or `assertWithinBudget` so:
 *   • per-tenant daily-budget enforcement (Spec 2 §9) fires on every call
 *   • cost tracking (ChatMessage.costInr + Company.aiSpendDailyInr) is
 *     never silently bypassed
 *   • per-surface model policy (ADR-0023) is the single source of model
 *     selection — no surface picks its own model name
 *
 * Detection:
 *   - `openai.chat.completions.create(...)`        (OpenAI chat models)
 *   - `openai.completions.create(...)`             (OpenAI legacy)
 *   - `anthropic.messages.create(...)`             (Anthropic chat)
 *
 * Allowlist (filepath-based, NO eslint-disable escape hatch, NO test-file
 * exception — tests mock the loop wrappers, never the SDK directly):
 *   - packages/ai-tools/src/openai-tool-loop.ts
 *   - packages/ai-tools/src/sonnet-tool-loop.ts
 *   - packages/ai-tools/src/model-policy.ts
 *
 * @derives(ADR-0023)   per-surface model policy is single source
 * @derives(spec-2 §9)  daily budget gate must run on every AI call
 * @derives(spec-2 §14.1) ESLint catches regressions
 */

const ALLOWLIST_FILE_PATTERNS = [
  /packages\/ai-tools\/src\/openai-tool-loop\.ts$/,
  /packages\/ai-tools\/src\/sonnet-tool-loop\.ts$/,
  /packages\/ai-tools\/src\/model-policy\.ts$/,
];

function isAllowlisted(filename) {
  return ALLOWLIST_FILE_PATTERNS.some((re) => re.test(filename));
}

/**
 * Extract the dotted property chain ending at `node`, oldest → newest.
 * For `openai.chat.completions.create`, returns ['openai','chat','completions','create'].
 * Returns null if any segment isn't a plain Identifier (e.g. computed access).
 */
function getMemberChain(node) {
  const chain = [];
  let cur = node;
  while (cur && cur.type === 'MemberExpression') {
    if (cur.computed) return null;
    if (cur.property.type !== 'Identifier') return null;
    chain.unshift(cur.property.name);
    cur = cur.object;
  }
  if (cur && cur.type === 'Identifier') {
    chain.unshift(cur.name);
    return chain;
  }
  return null;
}

function isRawLlmCall(callee) {
  if (!callee || callee.type !== 'MemberExpression') return false;
  if (callee.property?.type !== 'Identifier' || callee.property.name !== 'create') return false;
  const chain = getMemberChain(callee);
  if (!chain) return false;

  const tail = chain.slice(-3).join('.');
  // OpenAI shapes
  if (tail.endsWith('chat.completions.create')) return true;
  if (chain.slice(-2).join('.') === 'completions.create') return true;
  // Anthropic shape
  if (chain.slice(-2).join('.') === 'messages.create') return true;
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Direct LLM SDK calls (OpenAI / Anthropic) are forbidden outside @axhy/ai-tools wrappers',
    },
    messages: {
      raw: 'Direct LLM SDK calls forbidden. Use @axhy/ai-tools (openaiToolLoop / sonnetToolLoop) so cost-tracking, surface enforcement, and audit logging run automatically. ADR-0023, spec-2 §9.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename?.() ?? context.filename ?? '';
    if (isAllowlisted(filename)) return {};

    return {
      CallExpression(node) {
        if (isRawLlmCall(node.callee)) {
          context.report({ node, messageId: 'raw' });
        }
      },
    };
  },
};
