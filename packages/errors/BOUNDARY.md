# @axhy/errors — BOUNDARY

## Owns
- Error code catalog (every error has a code, customer-facing message, internal reason, runbook link)
- Error class hierarchy (DomainError, ValidationError, AuthError, RateLimitError, AIError, ...)
- Translation key references (resolved against `@axhy/copy`)

## Does NOT own
- Error handling logic (lives in apps)
- Logging
- Sentry capture (lives in apps)

## Internal dependencies
**ZERO.** Pure types + JSON catalog.

## Who imports this
- `apps/backend`
- `apps/admin-web`
- `apps/mobile`
- `@axhy/ai-tools` — for AIError throwing

## Lineage anchor
ADR-0018 — Centralized error catalog with stable codes.
