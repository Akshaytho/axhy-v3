---
broken_rule: 'no API versioning — routes are /chat/messages not /v1/chat/messages. Breaking changes will break old mobile clients with no migration path.'
persona: all
date: 2026-05-20
session: 'Wave A deep code review — production hardening gaps'
check_pattern: 'rewriteUrl'
check_paths: 'apps/backend/src/server.ts'
check_expect: 'exists'
---

# Learning: API versioning is required for mobile+backend systems

## What happened

All routes were unversioned: `/chat/messages`, `/chat/apply`, `/admin/policy`.
The `decisionCard` field already had two shapes (single object vs array).
When the API contract changes, old mobile clients and new ones break
simultaneously with no migration path.

Mobile apps on phones can't be force-updated instantly — there will always
be a window where old and new clients coexist.

## Root cause

Antigravity session registered routes without version prefixes.

## Resolution (2026-06-12, ADR-0028)

Implemented as a `/v1` ALIAS, not per-route renames: `server.ts` strips the
`/v1/` prefix pre-routing via Fastify's `rewriteUrl` option, so `/v1/X` and
`/X` hit identical handlers. Clients pin `/v1` at one point each
(`apps/mobile/lib/api.ts` API_BASE, `apps/admin-web/lib/env.ts`). Bare paths
stay accepted during the compat window; a future breaking change mounts
real `/v2` handlers while `/v1` keeps serving installed clients. Proven by
`apps/backend/test/v1-prefix.test.ts` (parity + no-prefix-bleed cases).

## Prevention rule

1. Shipped clients MUST call through a version prefix (`/v1`) — never bare.
2. When a breaking change is needed, create `/v2` routes alongside `/v1`.
3. Deprecate old versions with a sunset header; don't remove them immediately.
4. Never remove the `rewriteUrl` v1 alias from `server.ts` while any `/v1`
   client build is in the field.

## Detection

`check_pattern` verifies the `rewriteUrl` v1 alias exists in
`apps/backend/src/server.ts` (check_expect: exists). The previous pattern
(`app\.post\(.*/chat/` expecting literal `/v1/` registrations) was dead —
it matched zero files because the chosen implementation aliases at the
server boundary instead of renaming every route registration.
