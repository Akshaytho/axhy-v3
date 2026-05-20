---
broken_rule: 'no API versioning — routes are /chat/messages not /v1/chat/messages. Breaking changes will break old mobile clients with no migration path.'
persona: all
date: 2026-05-20
session: 'Wave A deep code review — production hardening gaps'
check_pattern: 'app\.post\(.*/chat/'
check_paths: 'apps/backend/src/routes'
check_expect: 'exists'
---

# Learning: API versioning is required for mobile+backend systems

## What happened

All routes are unversioned: `/chat/messages`, `/chat/apply`, `/admin/policy`.
The `decisionCard` field already has two shapes (single object vs array).
When the API contract changes, old mobile clients and new ones break
simultaneously with no migration path.

Mobile apps on phones can't be force-updated instantly — there will always
be a window where old and new clients coexist.

## Root cause

Antigravity session registered routes without version prefixes.

## Prevention rule

1. All new routes MUST use `/v1/` prefix: `/v1/chat/messages`, `/v1/admin/policy`
2. When a breaking change is needed, create `/v2/` routes alongside `/v1/`
3. Deprecate old versions with a sunset header, don't remove them immediately
4. Mobile client sends `X-API-Version` header; backend can use it for
   version-aware responses

## Detection

`check_pattern` greps for unversioned route registrations (app.post('/chat/
without /v1/ prefix). `check_expect: none` means all routes should be versioned.
