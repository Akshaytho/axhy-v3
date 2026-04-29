# apps/backend — BOUNDARY

## Owns
- HTTP layer (Fastify routes)
- Authentication (phone+OTP via MSG91, jose JWT)
- Multi-tenant gateway: `companyId` injection from JWT, never trusted from request body
- Database queries (Prisma)
- Cron jobs + outbox dispatcher (cascade depth ≤ 3)
- File upload pre-signed URLs to Cloudflare R2
- AI invocations (always at user-input boundary)
- SSE event streams for realtime
- Rate limiting (per-tenant)

## Does NOT own
- State definitions (those live in `@axhy/state-machines`)
- Pricing math (lives in `@axhy/business-rules`)
- AI SDK calls (wrapped in `@axhy/ai-tools`)
- Domain types (live in `@axhy/shared-schema`)

## Internal dependencies
- `@axhy/shared-schema`
- `@axhy/state-machines`
- `@axhy/business-rules`
- `@axhy/ai-tools`
- `@axhy/errors`
- `@axhy/knowledge-graph` (read-only, for graph health endpoints)

## Hard rules
- Every DB query MUST filter by `companyId`. ESLint enforces.
- State transitions MUST go through `@axhy/state-machines`. Direct `UPDATE` on state columns is banned.
- User content passed to `@axhy/ai-tools` MUST be wrapped in `<untrusted_user_content>`.
- Every endpoint has an integration test asserting cross-tenant isolation.

## Lineage anchor
Master plan §G (backend architecture) + §F (schemas). ADR-0004 — Fastify + Prisma + Postgres.
