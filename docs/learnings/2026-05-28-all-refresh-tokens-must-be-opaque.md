---
broken_rule: 'F1-b trust model — refresh tokens must be opaque axrt_-prefixed bytes backed by RefreshToken family, never JWTs'
persona: all
date: 2026-05-28
session: 'F1-b refresh-rotation Tasks 7+8+9 — swap legacy issueRefreshToken and guard against regression'
check_pattern: 'issueRefreshToken|kind:\s*[''"]refresh[''"]'
check_paths: 'apps/backend/src,apps/mobile/lib'
check_expect: 'none'
---

# Learning: refresh tokens must be opaque axrt\_-prefixed bytes, not JWTs

## What happened

Pre-F1-b, `/auth/otp/verify` returned a JWT-shaped refresh token via `issueRefreshToken(userId)`. Anyone who stole that JWT could rotate against `/auth/refresh` indefinitely — the server had no way to detect reuse because JWTs are stateless. F1-b replaced this with opaque random bytes (`axrt_<base64url>`) backed by a Postgres `RefreshToken` family row + Redis `current_hash` hot path. Reuse of a rotated token outside the 10-second grace window now triggers family revoke + `Membership.tokenEpoch` bump (Stripe pattern).

Task 7 swapped `/auth/otp/verify` to call `refreshTokenStore.create({ userId, membershipId, userAgent, ipFirst })` instead of `issueRefreshToken(user.id)`, and deleted `issueRefreshToken` from `apps/backend/src/lib/jwt.ts` entirely. Task 8 wired the mobile interceptor to consume the new opaque tokens with a per-process refresh mutex.

## Root cause of the original gap

JWT refresh tokens were chosen for stateless simplicity. The gap: statelessness means the server cannot tell "this user just rotated to a new token" from "an attacker who stole the old one is using it." Family detection requires server-side state, and server-side state means opaque tokens hashed at rest.

## Prevention rule

Any new code that issues a refresh token MUST go through `refreshTokenStore.create()`. Any code that signs a JWT with `kind: 'refresh'` is reintroducing the F1-b vulnerability and must be removed before merge.

## Detection

- **Pre-commit:** This learning's `check_pattern: 'issueRefreshToken|kind:[''"]refresh[''"]'` greps `apps/backend/src` + `apps/mobile/lib`. Any production hit fires HIGH in Phase 3 audit output.
- **Exemption:** Test files that intentionally craft legacy-shape JWTs to verify the AUTH_LEGACY_REFRESH reject path use `// audit-ok: <reason>` at end of line (e.g. `apps/backend/test/auth-refresh-legacy-reject.test.ts:40`). `check_paths` does not include `test/` so tests are already out of scope, but the comment serves as documentation if the pattern ever expands.

## How to apply

When implementing any auth-adjacent slice that touches token issuance: search for `issueRefreshToken` and `kind: 'refresh'` before opening the PR. Both must return zero hits in production paths (`apps/backend/src` + `apps/mobile/lib`). If a new code path needs to issue a refresh, use `createRefreshTokenStore(prisma).create(...)` — never re-introduce the JWT-refresh primitive.
