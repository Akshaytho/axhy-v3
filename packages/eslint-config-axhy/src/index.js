// @axhy/eslint-config-axhy
// @derives(ADR-0019)
//
// Shared ESLint config + custom rules for Axhy v3.
// Custom rule implementations land during evidence sprint Day 7.

import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  {
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
    },
    rules: {
      // hard rules — V2-treadmill prevention
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx'], location: 'anywhere' }],
      'import/no-cycle': ['error', { maxDepth: 10 }],
      'import/order': ['warn', { 'newlines-between': 'always' }],
    },
  },
];
