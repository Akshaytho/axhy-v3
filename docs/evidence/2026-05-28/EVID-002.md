# EVID-002 | test-run | F1-b Tasks 5-6 — 7 integration test files 11/11 green + 1 skipped | 2026-05-28 20:09 IST

**Slice:** f1-b-task-5-6-integration-tests
**Branch:** feat/f1-b-refresh-rotation
**Plan:** docs/plans/2026-05-28-f1-b-refresh-rotation.md (Task 5 + Task 6)

## Command

```
cd apps/backend && \
  set -a && source .env.local && set +a && \
  railway run --service Postgres -- \
  node_modules/.bin/vitest run \
    test/auth-refresh-happy.test.ts \
    test/auth-refresh-rotation-grace.test.ts \
    test/auth-refresh-compromise-detect.test.ts \
    test/auth-refresh-legacy-reject.test.ts \
    test/auth-refresh-rate-limit.test.ts \
    test/auth-refresh-revoked.test.ts \
    test/auth-refresh-super-admin.test.ts \
    --reporter=verbose
```

## Result

```
 ✓ test/auth-refresh-happy.test.ts              (1 test) 13433ms
 ✓ test/auth-refresh-rotation-grace.test.ts     (1 test) 14257ms
 ✓ test/auth-refresh-compromise-detect.test.ts  (1 test) 28755ms
 ✓ test/auth-refresh-legacy-reject.test.ts      (3 tests)
 ✓ test/auth-refresh-rate-limit.test.ts         (1 test + 1 skipped) 15874ms
 ✓ test/auth-refresh-revoked.test.ts            (2 tests)
 ✓ test/auth-refresh-super-admin.test.ts        (2 tests) 10499ms + 2425ms

 Test Files  7 passed (7)
      Tests  11 passed | 1 skipped (12)
```

Skipped test: `auth-refresh-rate-limit.test.ts > skipped — REDIS_URL not set, fail-open path can't exercise cap` — `it.skipIf(REDIS_AVAILABLE)` guard; not skipped here because REDIS_URL is set, but the no-Redis branch is in the file for future runs.

## Coverage

| Plan scenario                                                     | File                           | Assertions                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Happy: mint → refresh → refresh, all distinct, JWT carries claims | auth-refresh-happy             | refresh tokens distinct, axrt\_ prefix, accessToken decodes to {sub, companyId, membershipId, epoch=0, isPlatformAdmin=true, role}, family row reflects current/previous hashes |
| Within-grace re-rotation (network race)                           | auth-refresh-rotation-grace    | T1≠T2≠T3, family.currentTokenHash=hash(T3), tokenEpoch NOT bumped                                                                                                               |
| Compromise detection (rotated-out reuse after 10s)                | auth-refresh-compromise-detect | 401 INVALID_REFRESH (silent), family.revokedReason='COMPROMISE', membership.tokenEpoch bumped 0→1                                                                               |
| Legacy JWT-shape refresh → 401 AUTH_LEGACY_REFRESH                | auth-refresh-legacy-reject     | 3 cases: signed JWT, fake JWT-shape, body too short (400 BAD_FORMAT)                                                                                                            |
| Rate limit (10/min/IP)                                            | auth-refresh-rate-limit        | 10 × 401 INVALID_REFRESH, 11th = 429 REFRESH_RATE_LIMITED + retry-after header                                                                                                  |
| Family pre-revoked (ADMIN_REVOKE or LOGOUT) → 401 REFRESH_REVOKED | auth-refresh-revoked           | Distinct revoke reasons preserved on the family row                                                                                                                             |
| SUPER_ADMIN path (membershipId=null)                              | auth-refresh-super-admin       | accessToken carries role=SUPER_ADMIN + isPlatformAdmin=true + companyId=user.id, no membershipId leak; revoking is_platform_admin → 401 INVALID_REFRESH on next refresh         |

## Iteration

Initial run had 2 failures from Redis rate-limit bucket pollution across parallel test files (all sharing `req.ip='127.0.0.1'`). Fix: each test file uses a unique simulated remoteAddress (10.99.0.1 .. 10.99.0.7) via Fastify `app.inject({ remoteAddress })`, isolating the per-IP rate-limit bucket. Re-run after the patch: 11/11 green.

## Iteration root cause (for future test authors)

The route `POST /auth/refresh` at apps/backend/src/routes/auth-refresh.ts:72 uses `req.ip ?? 'unknown'` as the rate-limit subject. Fastify `app.inject` defaults all sockets to `127.0.0.1` unless `remoteAddress` is passed — so concurrent test files all collide on `rl:authrefresh:127.0.0.1`. Pattern: any new integration test that hits a per-IP-rate-limited route should pass `remoteAddress: TEST_IP_UNIQUE_PER_FILE`.

## Acceptance check (plan §Task 5/Task 6)

- [x] Task 5 acceptance: "all 5 happy/error scenarios pass against Railway prod DB" → met (Task 5's 3 files all green)
- [x] Task 6 acceptance: "all 7 integration test files green (3 from Task 5 + 4 from Task 6)" → met (7/7 files green)

## Files touched

```
apps/backend/test/auth-refresh-happy.test.ts                 (new)
apps/backend/test/auth-refresh-rotation-grace.test.ts        (new)
apps/backend/test/auth-refresh-compromise-detect.test.ts     (new)
apps/backend/test/auth-refresh-legacy-reject.test.ts         (new)
apps/backend/test/auth-refresh-rate-limit.test.ts            (new)
apps/backend/test/auth-refresh-revoked.test.ts               (new)
apps/backend/test/auth-refresh-super-admin.test.ts           (new)
docs/evidence/2026-05-28/EVID-002.md                         (this file)
```

## tsc

`pnpm --filter @axhy/backend exec tsc --noEmit` → exit 0, no errors.
