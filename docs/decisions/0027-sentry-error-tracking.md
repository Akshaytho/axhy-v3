# ADR-0027: Sentry for backend error tracking (env-gated)

- **Status:** Accepted
- **Date:** 2026-06-11
- **Master plan §:** §G (production hardening)
- **Panel debate:** none — FIX-AUTONOMY grant (docs/walks/README.md): launch-blocker fix from the 2026-06-10 findings doc ("prod 500s invisible"), proven-vendor choice
- **Supersedes:** none

## Context

The 2026-06-10 full-codebase review flagged a launch gap: when the deployed
backend throws a 5xx or dies on startup, nothing records it. Railway keeps
container logs, but nobody is paged, there is no aggregation, no release
tagging, and fatal startup errors vanish when the container restarts. One
founder operating solo cannot tail logs all day.

Constraints: zero behavior change to API responses (the dual-lens walks
depend on exact response shapes), no PII leaving the system (requests carry
worker phone numbers and JWTs), and zero cost/ops burden until there are
real customers.

## Options considered

| Option                                | Pros                                                                                                   | Cons                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| A. @sentry/node, env-gated            | Industry default; free tier; release tagging; catches uncaught/unhandled by default; inert without DSN | One more vendor; SDK adds ~?MB to image                            |
| B. pino-only (status quo + alerts)    | No new dependency                                                                                      | No aggregation, no grouping, no paging; logs die with container    |
| C. Self-hosted (GlitchTip/Sentry OSS) | Data stays ours                                                                                        | A whole service to run — wrong trade for a solo founder pre-launch |

## Decision

We chose **Option A**: official `@sentry/node` (v10), wired so that:

- `initSentry()` runs once at process entry (`apps/backend/src/index.ts`) and
  is a **permanent no-op unless `SENTRY_DSN` is set** — prod behavior today is
  byte-identical.
- Request errors are captured via a Fastify **`onError` hook** (observational),
  NOT `setErrorHandler` — default error responses, shapes and status codes are
  untouched. Only `statusCode >= 500` is reported; 4xx is expected traffic.
- `sendDefaultPii: false` — no request bodies/headers (worker phones, JWTs)
  in events; context is limited to route template, method, status.
- Fatal startup errors are captured + flushed before `process.exit(1)`.

## Consequences

### Positive

- Prod 500s and startup crashes become visible, grouped, and release-tagged
  (`RAILWAY_GIT_COMMIT_SHA`) the moment the founder sets `SENTRY_DSN`
  (already documented in `apps/backend/.env.example`).

### Negative

- A vendor SDK in the dependency tree; events live on Sentry's servers
  (mitigated: PII off, fake QA data until customer #1).

### Neutral

- admin-web/mobile are NOT wired in this ADR — backend first, where the
  blind spot was flagged.

## Cost at scale

| Scale                    | Storage / compute / API cost  | Per-customer cost  | % of revenue |
| ------------------------ | ----------------------------- | ------------------ | ------------ |
| 1 customer (pilot)       | Free tier (5k events/mo)      | ₹0                 | 0%           |
| 5 customers / 5K workers | Free tier or Team ~$26/mo     | ~₹450/customer/yr  | <1%          |
| 50 customers             | Team ~$26–80/mo (quota-based) | ~₹120/customer/yr  | <1%          |
| 200 customers            | Business tier if needed       | falls per customer | <1%          |

Cost ceiling considered: yes — events are error-only (no tracing/replay
sampling enabled), so volume scales with bugs, not traffic.

## Lineage

- **Derives from:** docs/findings/2026-06-10-full-codebase-deep-review-and-recommendations.md (launch item), master plan §G
- **Affects packages:** none
- **Affects apps:** apps/backend
- **Implementation tracked in:** slice `sentry-env-gated-wiring` (this commit)
