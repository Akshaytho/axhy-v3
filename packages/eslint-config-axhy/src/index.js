/**
 * @axhy/eslint-config-axhy
 *
 * Shared ESLint config + custom rules for Axhy v3.
 * Custom rules live under `./rules/`. Built-in rules wired in line.
 *
 * @derives(ADR-0019)
 */

import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import unusedImports from 'eslint-plugin-unused-imports';

import requireDerives from './rules/require-derives.js';
import noRawLlmCall from './rules/no-raw-llm-call.js';

export const axhyPlugin = {
  rules: {
    'require-derives': requireDerives,
    'no-raw-llm-call': noRawLlmCall,
  },
};

const baseRules = {
  // V2-treadmill prevention — covered by built-ins
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': 'off',
  'unused-imports/no-unused-imports': 'error',
  'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx'], location: 'anywhere' }],
  // Architectural discipline — Axhy custom rules
  'axhy/require-derives': 'error',
  // Spec 2 §9 + ADR-0023 — every LLM call must route through @axhy/ai-tools
  // so daily-budget, cost-tracking, and surface policy run automatically.
  'axhy/no-raw-llm-call': 'error',
  // Module hygiene
  'import/no-cycle': ['error', { maxDepth: 10 }],
  'import/order': ['warn', { 'newlines-between': 'always' }],
};

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      'unused-imports': unusedImports,
      axhy: axhyPlugin,
    },
    rules: baseRules,
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*'],
    rules: {
      'axhy/require-derives': 'off',
      'no-warning-comments': 'off',
    },
  },
  {
    // Generated and dist code is exempt
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/generated/**',
      '**/*.d.ts',
      '**/node_modules/**',
      // The lint-rules fixture intentionally violates rules to prove they fire.
      // Run `pnpm exec eslint --no-warn-ignored <fixture>` manually for validation.
      'packages/eslint-config-axhy/test/lint-rules.fixture.ts',
    ],
  },
];
