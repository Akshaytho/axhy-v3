# @axhy/eslint-config-axhy — BOUNDARY

## Owns
- Shared ESLint config for the monorepo
- Custom rules that enforce architectural discipline:
  - `axhy/no-any` — bans `: any`, `as any`, untyped catch
  - `axhy/no-todo-fixme` — blocks `// TODO`, `// FIXME` in committed code
  - `axhy/require-derives` — every exported symbol needs `@derives(adr-NNNN)`
  - `axhy/companyid-enforcement` — every backend DB query must filter by `companyId`
  - `axhy/no-direct-status-update` — block direct UPDATE on state columns
  - `axhy/no-untagged-user-content` — user input passed to AI must be wrapped in `<untrusted_user_content>`
  - `axhy/no-cross-app-import` — apps/* cannot import other apps/*
  - `axhy/respect-package-boundaries` — enforce package dependency DAG
  - `axhy/no-mock-in-integration` — integration tests cannot import mocking libs
  - `axhy/no-personal-field-without-dpdp` — personal fields need `@personal` annotation

## Does NOT own
- Prettier config (lives at root `.prettierrc`)
- TypeScript config (lives at root `tsconfig.base.json`)

## Internal dependencies
**ZERO.** Standalone tooling.

## Who imports this
- Every `package/*` and `apps/*` consumes this as ESLint config

## Lineage anchor
ADR-0019 — Custom ESLint rules to prevent V2 bug-treadmill mistakes.
