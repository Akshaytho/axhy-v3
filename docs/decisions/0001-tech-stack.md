# ADR-0001: Tech stack

- **Status:** Accepted
- **Date:** 2026-04-29
- **Master plan §:** §E (engineering practices), §G (architecture)
- **Panel debate:** 2026-04-29-tech-stack

## Context

Axhy v3 is a greenfield rebuild after V1/V2 hit a 100K-LoC bug treadmill. The stack must:
- Scale to 200K+ LoC without architectural decay
- Be maintainable by a solo founder
- Be type-safe end-to-end
- Be LLM-friendly (Claude/Cursor/Lovable should work fluently)
- Support voice-first AI features
- Comply with India DPDP requirements
- Allow Linear/Vercel-tier UI quality

## Decision

| Layer | Pick |
|---|---|
| Language / runtime | TypeScript 5.x strict, Node 20 LTS |
| Monorepo | Turborepo + pnpm |
| Database | Postgres 16 on Railway with RLS + pgvector |
| ORM | Prisma (backend), Drizzle (mobile-only on expo-sqlite) |
| Schema validation | Zod (single source for types + OpenAPI + RHF) |
| State machines | XState v5 |
| Backend | Fastify v4 + jose JWT + Postgres outbox |
| File storage | Cloudflare R2 |
| Realtime | Server-Sent Events |
| AI | Anthropic + OpenAI, wrapped in `@axhy/ai-tools` |
| STT | Sarvam (monolingual) + Whisper (code-switched), routed |
| Comms | MSG91 (SMS) + Gupshup (WhatsApp) + Resend (email) |
| Mobile | Expo SDK 51 + EAS, single binary role-based UI |
| Web | Next.js 15 App Router |
| UI library web | shadcn/ui (Radix + Tailwind v4) |
| UI library mobile | RN Reusables + Tamagui fallback |
| Design tokens | `@axhy/ui-tokens` JSON → Tailwind theme + RN StyleSheet |
| Hosting | Railway |
| CI | GitHub Actions |
| Observability | pino + Sentry + OpenTelemetry → Axiom (when scaled) |
| Analytics | PostHog (EU region for DPDP) |
| Billing | Razorpay (manual invoices first 50 customers) |

Panel: Maya Krishnan, Vivek Iyer, Vikram Shah, Eric Chen, Aanya Mehta, Rohit Kapoor, Saurabh Mehta, Karthik Reddy, Priya Nair, Karthik Ravi, Vinod Patel.

## Consequences

### Positive
- Single primary language (TypeScript) reduces solo-founder context-switching
- End-to-end type safety via Zod kills V2-style runtime mismatches
- Boring tech in 90% of stack; exotic only where justified (XState, R2, Sarvam)
- LLM tools generate this stack fluently
- Stack is hireable — engineer #1 onboards in days

### Negative
- Initial setup is more involved than a single-framework choice
- Maintaining custom ESLint rules adds tooling burden
- Mobile and backend ORMs differ (Prisma vs Drizzle) — mental overhead

### Neutral
- Bun deferred to v3.5 once production stability is proven
- Microservices forbidden until measured pain at >10K rps

## Lineage

- **Derives from:** master plan §E, §G, V2 retrospective lessons
- **Affects packages:** all
- **Affects apps:** all
