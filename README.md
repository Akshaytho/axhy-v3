# Axhy v3

Voice-first, AI-verified, per-customer-learning facility management software for Indian cleaning companies.

## Quick orientation

- **Master plan (the seed):** `/Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md` — 60K-word context document, the source of truth for product intent.
- **Knowledge graph (when running):** `axhy-graph.local:3000` — three graphs (structural, semantic, provenance) over this repo.
- **Boundaries:** see `BOUNDARY.md` at root and inside every package/app.
- **Decisions:** every locked decision lives in `docs/decisions/` as a numbered ADR.

## Repo layout

```
axhy-v3/
├── apps/                  things that run (backend, admin-web, mobile)
├── packages/              things apps import (shared-schema, state-machines, ...)
├── tools/                 internal tooling (graph-builder, seed-data, ...)
├── docs/                  human-readable knowledge (also graph nodes)
├── tests/                 cross-package tests (ai-eval, voice-benchmark, e2e)
├── scripts/               one-off utility scripts
└── .github/workflows/     CI pipelines
```

## Apps

| App | Stack | Hosting |
|---|---|---|
| `backend` | Fastify + Prisma + jose | Railway |
| `admin-web` | Next.js 15 App Router | Railway, axhy.app |
| `mobile` | Expo SDK 51 + EAS | Play Store + App Store, single binary, role-based UI |

## Packages

| Package | Owns |
|---|---|
| `@axhy/shared-schema` | Prisma + Zod (THE seed package, no internal deps) |
| `@axhy/state-machines` | 6 XState machines (Visit, Worker, Site, LeaveRequest, Device, AssignmentConfig) |
| `@axhy/business-rules` | Pure functions: pricing, eligibility, conflict detection |
| `@axhy/ai-tools` | Anthropic / OpenAI / Sarvam wrappers + rate limit + cost tracking |
| `@axhy/api-client` | Auto-generated typed clients (mobile + web) |
| `@axhy/ui-tokens` | Design tokens + generators (Tailwind + RN StyleSheet) |
| `@axhy/ui-web` | shadcn-customized components for admin-web |
| `@axhy/ui-native` | RN Reusables components for mobile |
| `@axhy/copy` | i18n catalogs (en/hi/te) + content style guide |
| `@axhy/errors` | Error code catalog + customer messages |
| `@axhy/knowledge-graph` | MCP server + graph builder (three graphs) |
| `@axhy/eslint-config-axhy` | Custom lint rules (no `any`, companyId enforcement, @derives) |

## Setup

```bash
nvm use
npm install -g pnpm@9
pnpm install
pnpm dev
```

## Hard rules

1. Apps never import apps.
2. `shared-schema` imports nothing internal.
3. Every database query in `apps/backend` must filter by `companyId`.
4. State transitions go through XState machines — never raw SQL UPDATE on state columns.
5. User content passed to AI must be wrapped in `<untrusted_user_content>` tags.
6. No `any`. No `// TODO`. No mocks in integration tests.
7. Every exported symbol has `@derives(adr-NNNN)` linking to its origin decision.

ESLint enforces all of the above.

## License

Proprietary. Copyright Axhy, 2026.
