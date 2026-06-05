# Done memo — RCA-G config/resilience (2026-06-04)

**Slice:** three gaps sharing one root (silent unsafe degradation): fail loud on a prod Redis-namespace misconfig; bound the client token-refresh so a blip can't freeze the app; correct ADR-0024 to match reality.

## What shipped (NOT pushed — fix-only)

1. **Boot guard** — `apps/backend/src/server.ts`: after the OTP-bypass guard, refuse to boot when `NODE_ENV==='production' && !AXHY_REDIS_NAMESPACE`. Stops two prod-class environments sharing one Redis from both resolving to the `production:` prefix and colliding (OTP codes, refresh-hash hot path, rate-limit windows, circuit breaker). Dev/test keep the `NODE_ENV` fallback. `apps/backend/src/lib/redis-keys.ts`: doc note pointing to the boot guard (no module-load throw — would break the test suite).
2. **Client refresh resilience** — `apps/mobile/lib/api.ts` `attemptRefresh`: was a bare un-timed `fetch` (the only un-timed auth-critical call) that could hang every screen behind the shared `inFlightRefresh` mutex. Now: 8s `AbortController` timeout (shorter than the 15s default so the mutex frees fast) + 2 bounded jittered retries for **transient** failures only (network reject / timeout / 502/503/504). Definitive `401 / AUTH_LEGACY_REFRESH / INVALID_REFRESH` throw immediately → existing force-logout path fires (never retried). `auth-refresh.ts` route deliberately unchanged (already 10/min/IP).
3. **ADR-0024 amendment** — `docs/decisions/0024-redis-for-caches.md` (not a locked doc): dated note correcting the over-promise. The promised `AXHY_REDIS_FALLBACK_TO_POSTGRES` + inline Postgres fallback were **never built**; real posture is per-consumer **fail-open** (reversible to fail-closed via `AXHY_RATE_LIMIT_FAIL_CLOSED=1`). Decision: do NOT build a SQL sliding-window fallback (it would re-introduce the Postgres hot-path churn this ADR moved off; fail-open is adequate at ~2K users) — fix the doc, not the code.

## Verification

- `apps/backend/test/redis-namespace-boot-guard.test.ts` — **3/3 green**: prod+unset refuses to boot; test+unset boots normally (fallback preserved); prod+set passes the guard. (Self-contained — dynamic-imports buildServer after a dummy DATABASE_URL; no real DB/Redis.)
- `apps/mobile/lib/api.test.ts` — **7/7 green**: the 5 existing refresh tests unchanged (proving 401s are NOT retried and the mutex holds) + 2 new (transient-retry-then-succeed; persistent-blip surfaces WITHOUT logout).
- `pnpm --filter @axhy/backend run typecheck` + `pnpm --filter @axhy/mobile run typecheck` — **clean**.

## Decisions

- **No SQL rate-limit fallback** (fix the ADR instead) — per "simple > complex; don't build what isn't needed".
- **Hard boot-throw** (not a warn) — mirrors the OTP-bypass guard; a silent cross-env Redis collision is a security+correctness incident.
- INVARIANT 3 preserved (no Company creation added).

## ⚠️ DEPLOY PRECONDITION

Set `AXHY_REDIS_NAMESPACE` to a **distinct** value on every `NODE_ENV=production` Railway environment (e.g. `prod` / `staging`) **BEFORE** deploying this change — otherwise those services will refuse to boot. Env-first, code-second.

## Known gaps (NOT in this slice)

- `auth-refresh-happy` / `-rotation-grace` integration suites self-skip on a pre-existing hardcoded `QA_COMPANY` fixture FK (P2003) — pre-existing, unrelated to RCA-G (boot path verified by the boot-guard test instead).
- The full 8s-timeout abort path is covered by analogy (TimeoutError feeds the same transient-retry branch as a network reject, which IS tested) rather than a dedicated fake-timer test.
