// packages/eslint-config-axhy/test/lint-rules.fixture.ts
//
// THIS FILE INTENTIONALLY VIOLATES the 3 panel-locked ESLint rules.
// Run `pnpm exec eslint --no-warn-ignored packages/eslint-config-axhy/test/lint-rules.fixture.ts`
// — must report exactly 3 errors:
//   1. axhy/require-derives — exported `forbidden` has no @derives JSDoc
//   2. @typescript-eslint/no-explicit-any — `bad: any`
//   3. no-warning-comments — TODO comment present
//
// If any of these don't fire, the rule is silently broken. CI greens for the wrong reason.

// rule violation 3: no-warning-comments
// TODO this is intentional — must fire

// rule violations 1 + 2: missing @derives + explicit any
export function forbidden(bad: any): number {
  return bad as number;
}
