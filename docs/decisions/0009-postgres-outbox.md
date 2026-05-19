# ADR-0009: Postgres outbox over Redis

- **Status:** SUPERSEDED by [ADR-0024](0024-redis-for-caches.md) (2026-05-20). Postgres outbox + AuditEvent stay on Postgres for durable delivery + audit. Cache-shaped state (rate limits, OTP, chat idempotency, concurrency semaphore, circuit-breaker state) moved to Railway-managed Redis.
- **Date:** 2026-04-29

## Context

This ADR was referenced in code via `@derives(ADR-0009)` before its full body
was written. Auto-created by `scripts/backfill-adr-stubs.mjs` so the lineage
audit doesn't hard-fail. The actual decision is already locked — see ADR-0001
(tech stack umbrella) and the master plan.

## Decision

(Stub — replace with full options-considered + decision text when this ADR
is the focus of a panel debate or revisit.)

## Consequences

(Stub.)

## Cost at scale

(Add when the body lands — see ADR template.)

## Lineage

- **Derives from:** master plan, ADR-0001
- **Affects:** see code references via grep '@derives(ADR-0009)'
