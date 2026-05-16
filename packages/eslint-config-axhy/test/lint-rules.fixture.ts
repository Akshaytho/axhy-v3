// packages/eslint-config-axhy/test/lint-rules.fixture.ts
//
// THIS FILE INTENTIONALLY VIOLATES the panel-locked ESLint rules.
// Run `pnpm exec eslint --no-warn-ignored packages/eslint-config-axhy/test/lint-rules.fixture.ts`
// — must report exactly 5 errors:
//   1. axhy/require-derives — exported `forbidden` has no @derives JSDoc
//   2. @typescript-eslint/no-explicit-any — `bad: any`
//   3. no-warning-comments — TODO comment present
//   4. axhy/no-raw-llm-call — direct OpenAI chat.completions.create call
//   5. axhy/no-raw-llm-call — direct Anthropic messages.create call
//
// If any of these don't fire, the rule is silently broken. CI greens for the wrong reason.

// rule violation 3: no-warning-comments
// TODO this is intentional — must fire

// rule violations 1 + 2: missing @derives + explicit any
export function forbidden(bad: any): number {
  return bad as number;
}

// rule violation 4: axhy/no-raw-llm-call — direct OpenAI SDK use bypasses
// the @axhy/ai-tools gateway, so cost-tracking + daily-budget never fire.
declare const openai: { chat: { completions: { create: (x: unknown) => unknown } } };
export async function rawOpenAi(): Promise<void> {
  await openai.chat.completions.create({ model: 'gpt-5.4-nano', messages: [] });
}

// rule violation 5: axhy/no-raw-llm-call — direct Anthropic SDK use.
declare const anthropic: { messages: { create: (x: unknown) => unknown } };
export async function rawAnthropic(): Promise<void> {
  await anthropic.messages.create({ model: 'claude-sonnet-4-6', messages: [] });
}
