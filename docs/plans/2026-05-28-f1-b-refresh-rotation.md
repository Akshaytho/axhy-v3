# F1-b Trust Model — Refresh Rotation + Family Detection

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining F1 vulnerability: refresh tokens today are unverifiable JWTs (anyone with a stolen one rotates infinitely). F1-b makes refresh tokens opaque random bytes backed by a Postgres family row + Redis `current_hash` hot path, with Stripe-style family detection (any reuse of a rotated token → revoke the entire family + bump `Membership.tokenEpoch`). Adds the missing `POST /auth/refresh` route. Wires the mobile auth client to call it on 401 + persist rotated tokens.

**Architecture (locked NEXT_SESSION.md §6):**

1. **`RefreshToken` model:** family-row in Postgres. One row per (membership + device-session). Holds family-id, membershipId, userId (denormalized for SUPER_ADMIN), `currentTokenHash` (SHA-256 of latest opaque secret), `previousTokenHash` (for rotation grace window), `previousRotatedAt`, `createdAt`, `lastUsedAt`, `revokedAt`, `revokedReason`, `userAgent`, `ipFirst`, `ipLast`.
2. **Redis hot path:** `RedisKeys.refreshCurrentHash(familyId)` → string (current SHA-256 hex). TTL = 31 days (sliding). On `/auth/refresh` happy path, do `GET` from Redis first; on miss, fall back to Postgres + warm Redis. Saves the prod read budget at scale (locked: 22k SETs/day at 2K users = 0.0005% Redis capacity).
3. **Rotation grace window:** 10 seconds. After rotation, the `previousTokenHash` is still accepted for 10 s to absorb mobile network races (client sends refresh, network drops mid-response, client retries with the same token). After 10 s the previous hash is cleared. Reuse OUTSIDE the grace window → COMPROMISE.
4. **Compromise response:** family-only revoke. Set `RefreshToken.revokedAt = now`, `revokedReason = 'COMPROMISE'`, `DEL` the Redis hash key, AND bump `Membership.tokenEpoch` (kills outstanding access tokens too — same membership cannot recover without re-OTP). Stripe pattern: only this family gets nuked; other devices for the same membership keep working.
5. **Opaque token format:** `axrt_<base64url(32 random bytes)>` (43 chars after prefix). Prefix lets us spot leakage in logs. Stored only as SHA-256 hex (no plaintext at rest).
6. **New `POST /auth/refresh`:** accepts `{ refreshToken }` JSON body. Returns `{ accessToken, refreshToken, expiresIn }`. Errors: `400 BAD_FORMAT`, `401 INVALID_REFRESH`, `401 AUTH_LEGACY_REFRESH` (JWT-shaped tokens from before F1-b), `401 REFRESH_REVOKED`, `429 REFRESH_RATE_LIMITED` (10/min per IP).
7. **Login update:** `/auth/otp/verify` line 170 stops calling legacy `issueRefreshToken(userId)`. Instead creates a `RefreshToken` family row + returns the opaque token. Same for super-admin bootstrap (SUPER_ADMIN refresh family carries `userId` only, no membershipId).
8. **Mobile interceptor:** `apps/mobile/lib/api-client.ts` fetch wrapper catches 401 from any non-/auth/ endpoint, calls `/auth/refresh`, on success persists rotated tokens to SecureStore + retries the original request once. On any refresh failure → wipe tokens + signal logout (existing `useAuthStore` does this).
9. **Legacy refresh rejection:** if the body contains a token NOT starting with `axrt_`, return `401 AUTH_LEGACY_REFRESH`. Mobile catches this specific code → wipe tokens → route to OTP screen with toast "Session expired, please log in again." Founder decision 2026-05-28.

**Tech Stack:** Prisma 5 + Postgres (Railway), Fastify 4, ioredis, Zod, vitest, tsx. Web app uses fetch + localStorage; mobile uses expo-secure-store; both share `apps/mobile/lib/api-client.ts`.

**Non-goals for this slice (deferred to f1-c/d):**

- Access TTL 15 → 5 min (f1-c)
- `/auth/logout-everywhere` route (f1-c)
- `anonymize-worker-service` wired to bump epoch + revoke families (f1-c)
- `AUTH_STRICT_MODE` env flip + legacy code deletion (f1-d)
- KMS-backed JWT signing (post-arc)
- Device binding (e.g. attestation hash) (deferred until external launch)
- Family-count cap per membership (premature optimization; revisit at scale)

**Branch:** `feat/f1-b-refresh-rotation` (created from main at `dd7381f`).

**Enterprise-QA bar:** This slice qualifies — new public auth route + schema change on active surface. Every task ends with TDD evidence. Final task is `handoff/F1_B_QA_FINDINGS_2026-05-28.md` covering all 5 personas + adversarial (token theft, replay, family-compromise detection, rate-limit, legacy-reject, race-condition rotation).

---

## File Structure

**Create:**

- `packages/shared-schema/prisma/migrations/20260528_021_f1_refresh_token_family/migration.sql` — `RefreshToken` table + indexes
- `apps/backend/src/lib/services/refresh-token-store.ts` — Postgres family CRUD + Redis `current_hash` hot path + family-detection helper
- `apps/backend/src/lib/services/refresh-token-store.test.ts` — unit tests for hash, rotate, grace-window, compromise-detect
- `apps/backend/src/routes/auth-refresh.ts` — `POST /auth/refresh` route + Zod schema + rate limit + error mapping
- `apps/backend/test/auth-refresh-happy.test.ts` — login → refresh once → use new access → refresh again
- `apps/backend/test/auth-refresh-rotation-grace.test.ts` — refresh twice within 10s using same old token (race) → both succeed; refresh with rotated-out token after grace → COMPROMISE
- `apps/backend/test/auth-refresh-compromise-detect.test.ts` — attacker steals + uses rotated token AFTER grace → family revoked + epoch bumped + legitimate user's next refresh 401s
- `apps/backend/test/auth-refresh-legacy-reject.test.ts` — JWT-shaped refresh token → 401 AUTH_LEGACY_REFRESH
- `apps/backend/test/auth-refresh-rate-limit.test.ts` — 11th request in 60s → 429 REFRESH_RATE_LIMITED
- `apps/backend/test/auth-refresh-revoked.test.ts` — manually revoked family row → 401 REFRESH_REVOKED
- `apps/backend/test/auth-refresh-super-admin.test.ts` — SUPER_ADMIN refresh flow (no membershipId; keyed by userId)
- `apps/mobile/lib/api-client-refresh-interceptor.test.ts` — 401 → /auth/refresh → retry original; refresh fails → wipe + logout
- `apps/mobile/lib/api-client.ts` MODIFY (interceptor) — see Modify section
- `handoff/F1_B_QA_FINDINGS_2026-05-28.md` — enterprise-QA findings doc

**Modify:**

- `packages/shared-schema/prisma/schema.prisma` — add `RefreshToken` model + relations on `User` + `Membership`
- `apps/backend/src/lib/jwt.ts:67-81` — DELETE `issueRefreshToken` (no longer JWT). Callers switch to `refresh-token-store.create`.
- `apps/backend/src/routes/auth.ts:170-175` — `/auth/otp/verify` calls `refreshTokenStore.create({membershipId, userId, userAgent, ip})` instead of `issueRefreshToken`
- `apps/backend/src/lib/redis-keys.ts` — add `refreshCurrentHash(familyId)` + `refreshRateLimit(ip)`
- `apps/backend/src/server.ts` — register new `auth-refresh.ts` route
- `apps/mobile/lib/api-client.ts` — refresh-on-401 fetch wrapper + rotated-token persistence + AUTH_LEGACY_REFRESH → wipe-and-logout
- `apps/mobile/lib/auth-store.ts` — no shape change; one new method `replaceTokens(tokens)` to atomically swap after rotation

**Untouched (verified — must not regress):**

- `apps/backend/src/middleware/tenant-context.ts` — `requireAuth` dual-mode logic unchanged; rotated access tokens flow through the same path
- `apps/backend/src/middleware/role-gates.ts` — unchanged
- `apps/backend/scripts/mint-token.ts` — unchanged (dev tool); never issues refresh tokens
- All 5 worker routes — they accept access tokens; F1-b only changes the refresh path

---

## Task 1: Schema migration + Prisma model

**Files:**

- Create: `packages/shared-schema/prisma/migrations/20260528_021_f1_refresh_token_family/migration.sql`
- Modify: `packages/shared-schema/prisma/schema.prisma`

- [ ] **Step 1: Write migration SQL**

```sql
-- F1-b refresh token families
-- Opaque random tokens, hashed at rest. One family row per device-session.
-- Family-detection (Stripe pattern): reuse of a rotated token → revoke entire
-- family + bump membership.token_epoch.

CREATE TABLE "axhy"."RefreshToken" (
  "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  "userId"              UUID         NOT NULL,
  "membershipId"        UUID,                                              -- NULL for SUPER_ADMIN
  "currentTokenHash"    VARCHAR(64)  NOT NULL,                             -- SHA-256 hex (always set until revoked)
  "previousTokenHash"   VARCHAR(64),                                       -- rotation grace window (10s)
  "previousRotatedAt"   TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "lastUsedAt"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "expiresAt"           TIMESTAMPTZ  NOT NULL,                             -- 30 days from creation, sliding
  "revokedAt"           TIMESTAMPTZ,
  "revokedReason"       VARCHAR(32),                                       -- 'LOGOUT' | 'COMPROMISE' | 'EXPIRED' | 'ADMIN_REVOKE'
  "userAgent"           VARCHAR(256),
  "ipFirst"             VARCHAR(64),
  "ipLast"              VARCHAR(64),
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefreshToken_userId_fkey"       FOREIGN KEY ("userId")       REFERENCES "axhy"."User"("id")       ON DELETE CASCADE,
  CONSTRAINT "RefreshToken_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "axhy"."Membership"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "RefreshToken_currentTokenHash_key" ON "axhy"."RefreshToken"("currentTokenHash");
CREATE        INDEX "RefreshToken_userId_idx"           ON "axhy"."RefreshToken"("userId");
CREATE        INDEX "RefreshToken_membershipId_idx"     ON "axhy"."RefreshToken"("membershipId");
CREATE        INDEX "RefreshToken_previousTokenHash_idx" ON "axhy"."RefreshToken"("previousTokenHash") WHERE "previousTokenHash" IS NOT NULL;
CREATE        INDEX "RefreshToken_expiresAt_idx"        ON "axhy"."RefreshToken"("expiresAt") WHERE "revokedAt" IS NULL;
```

Rationale: unique index on `currentTokenHash` makes the happy-path lookup O(1) and structurally prevents two families sharing a token. Partial index on `previousTokenHash` keeps the compromise-detection path cheap. Partial index on `expiresAt` lets a future cleanup job sweep efficiently without scanning revoked rows.

- [ ] **Step 2: Update Prisma schema**

Add to `packages/shared-schema/prisma/schema.prisma` after the `Membership` model:

```prisma
/// F1 trust model — opaque refresh-token family. One row per device-session.
/// Reuse of a rotated token (outside the 10-s grace window) triggers
/// compromise response: family revoked + Membership.tokenEpoch bumped.
/// @derives(F1 trust model 2026-05-27, slice f1-b)
model RefreshToken {
  id                 String    @id @default(uuid()) @db.Uuid
  userId             String    @db.Uuid
  membershipId       String?   @db.Uuid
  currentTokenHash   String    @unique @db.VarChar(64)
  previousTokenHash  String?   @db.VarChar(64)
  previousRotatedAt  DateTime? @db.Timestamptz
  createdAt          DateTime  @default(now()) @db.Timestamptz
  lastUsedAt         DateTime  @default(now()) @db.Timestamptz
  expiresAt          DateTime  @db.Timestamptz
  revokedAt          DateTime? @db.Timestamptz
  revokedReason      String?   @db.VarChar(32)
  userAgent          String?   @db.VarChar(256)
  ipFirst            String?   @db.VarChar(64)
  ipLast             String?   @db.VarChar(64)

  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  membership Membership? @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([membershipId])
  @@index([previousTokenHash])
  @@schema("axhy")
}
```

Add back-relations on `User`: `refreshTokens RefreshToken[]`
Add back-relations on `Membership`: `refreshTokens RefreshToken[]`

- [ ] **Step 3: Apply migration locally + regenerate client**

```bash
railway run --service Postgres -- pnpm --filter @axhy/shared-schema prisma migrate deploy
pnpm --filter @axhy/shared-schema prisma generate
```

- [ ] **Step 4: Verify** — `railway run --service Postgres -- psql -c "\d axhy.\"RefreshToken\""` returns the table with all columns + indexes. Confirm unique constraint on `currentTokenHash`.

**Acceptance:** migration applied to Railway prod DB; Prisma client regenerates with the `RefreshToken` model; `prismaClient.refreshToken` is callable.

---

## Task 2: Redis keys + family-detection unit tests (TDD)

**Files:**

- Modify: `apps/backend/src/lib/redis-keys.ts`
- Create: `apps/backend/src/lib/services/refresh-token-store.test.ts` (failing first)

- [ ] **Step 1: Extend `redis-keys.ts`**

```ts
// ── Refresh-token family hot path (string, current SHA-256 hex) ─────
// TTL: 31 days sliding. Owner: lib/services/refresh-token-store.ts.
refreshCurrentHash: (familyId: string): string => k(`rt:cur:${familyId}`),

// ── Refresh-token rate limit (sliding window ZSET, per-IP) ──────────
// TTL: 60 s. Owner: routes/auth-refresh.ts.
refreshRateLimit: (ip: string): string => k(`rl:authrefresh:${ip}`),
```

- [ ] **Step 2: Write failing unit tests for `refresh-token-store.ts`**

Create `apps/backend/src/lib/services/refresh-token-store.test.ts`. Tests must FAIL until Task 3 lands:

- `create()` returns `{ familyId, plainToken }` where `plainToken` matches `/^axrt_[A-Za-z0-9_-]{43}$/`
- `create()` writes a row with `currentTokenHash = sha256hex(plainToken)`, `previousTokenHash = null`, `expiresAt ≈ now + 30d`
- `rotate(plainToken)` returns new `{ plainToken }`; the old hash is now in `previousTokenHash` with `previousRotatedAt = now`
- `rotate()` updates Redis `refreshCurrentHash` to the new hash
- `validate(plainToken)` returns `{ family }` on happy path (current hash match)
- `validate()` returns `{ family, withinGrace: true }` when the token matches `previousTokenHash` AND `now - previousRotatedAt <= 10s`
- `validate()` returns `{ compromise: true, family }` when the token matches `previousTokenHash` AND `now - previousRotatedAt > 10s`
- `revokeForCompromise(familyId)` sets `revokedAt`, `revokedReason='COMPROMISE'`, deletes the Redis key, AND bumps `Membership.tokenEpoch` by 1
- `validate()` on a revoked family returns `{ revoked: true }`
- `validate()` on a token NOT in the table returns `{ notFound: true }`

Run: `pnpm --filter @axhy/backend test:integration -- refresh-token-store` → 10 tests fail (file does not exist). Commit the failing tests with `[wip] failing tests for refresh-token-store`.

---

## Task 3: Implement `refresh-token-store.ts`

**Files:**

- Create: `apps/backend/src/lib/services/refresh-token-store.ts`

- [ ] **Step 1: Implement the store**

```ts
import crypto from 'node:crypto';
import type { PrismaClient } from '@axhy/shared-schema';
import { redis } from '../redis.js';
import { RedisKeys } from '../redis-keys.js';

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const REDIS_TTL_SECONDS = 60 * 60 * 24 * 31; // 31 days (1 d slack)
const ROTATION_GRACE_MS = 10_000;
const TOKEN_PREFIX = 'axrt_';
const TOKEN_RANDOM_BYTES = 32;

export function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function mintRawToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(TOKEN_RANDOM_BYTES).toString('base64url');
}

export function isLegacyToken(token: string): boolean {
  return !token.startsWith(TOKEN_PREFIX);
}

export interface RefreshTokenStore {
  create(input: {
    userId: string;
    membershipId: string | null;
    userAgent?: string;
    ipFirst?: string;
  }): Promise<{ familyId: string; plainToken: string; expiresAt: Date }>;

  validate(plainToken: string): Promise<
    | { found: false }
    | {
        found: true;
        family: RefreshFamily;
        withinGrace?: boolean;
        compromise?: boolean;
        revoked?: boolean;
      }
  >;

  rotate(input: {
    familyId: string;
    ipLast?: string;
  }): Promise<{ plainToken: string; expiresAt: Date }>;

  revokeForCompromise(familyId: string): Promise<void>;
  revokeForLogout(familyId: string): Promise<void>;
}

export function createRefreshTokenStore(prisma: PrismaClient): RefreshTokenStore {
  /* ... */
}
```

Key implementation details:

1. `validate()` first does `GET RedisKeys.refreshCurrentHash(familyId)` — but we don't know `familyId` from the plaintext. So actually: query Postgres by `currentTokenHash = sha256hex(token)` (unique index — O(1)). If hit → happy path, refresh Redis cache + return. If miss → query by `previousTokenHash = sha256hex(token)`. If hit + within grace → return `withinGrace: true`. If hit + outside grace → return `compromise: true`. If miss → `found: false`.
2. `rotate()` writes new hash into `currentTokenHash`, moves old `currentTokenHash` into `previousTokenHash`, sets `previousRotatedAt = now`, slides `expiresAt = now + 30d`, sets `lastUsedAt = now`. Updates Redis. Uses Prisma `update` for atomicity.
3. `revokeForCompromise()` runs in a single `prisma.$transaction`: update RefreshToken (revokedAt, reason) + update Membership (tokenEpoch +1) + DEL Redis key. If `membershipId` is null (SUPER_ADMIN) skip the epoch bump.
4. All times stored as UTC.

- [ ] **Step 2: Run Task-2 tests** — `pnpm --filter @axhy/backend test:integration -- refresh-token-store`. Iterate until 10/10 green. Commit `feat(f1-b): refresh-token-store with family detection`.

**Acceptance:** all unit tests green against Railway prod DB.

---

## Task 4: `/auth/refresh` route

**Files:**

- Create: `apps/backend/src/routes/auth-refresh.ts`
- Modify: `apps/backend/src/server.ts` (register route)

- [ ] **Step 1: Route implementation**

```ts
// POST /auth/refresh
// Body: { refreshToken: string }
// Returns 200 { accessToken, refreshToken, expiresIn }
// Errors: 400 BAD_FORMAT, 401 INVALID_REFRESH | AUTH_LEGACY_REFRESH | REFRESH_REVOKED, 429 REFRESH_RATE_LIMITED
```

Logic:

1. Parse body with Zod (`{ refreshToken: z.string().min(20).max(60) }`) → 400 on fail.
2. Rate limit per IP: 10/min via existing `consumeRateLimit(RedisKeys.refreshRateLimit(ip), 10, 60)`. 429 on exceed.
3. If `isLegacyToken(token)` → 401 `AUTH_LEGACY_REFRESH`. (Mobile catches this and force-logs-out.)
4. `validate(token)`:
   - `found: false` → 401 `INVALID_REFRESH`
   - `revoked` → 401 `REFRESH_REVOKED`
   - `compromise` → revokeForCompromise + 401 `INVALID_REFRESH` (don't tell attacker we detected)
   - `withinGrace` → rotate the family and return the freshly minted token. (Amended 2026-05-28: the original spec said "return the current token, not a new one" but refresh-token-store keeps only SHA-256 hashes at rest — plaintext T2 cannot be re-produced on a retry. Re-rotating preserves the locked compromise-detection property: rotated-token reuse OUTSIDE grace still triggers family revoke + tokenEpoch++. The in-grace race is absorbed without false-positive. Rate limit caps any amplification at 10/min/IP. See apps/backend/src/routes/auth-refresh.ts:130-227.)
   - happy path → `rotate(familyId)` → re-issue access token with current Membership claims (look up Membership again to catch role/status changes since last refresh) → return `{ accessToken, refreshToken: newPlain, expiresIn: 900 }`

5. For SUPER_ADMIN (membershipId null on the family row): re-issue access via the same SUPER_ADMIN code path used in `/auth/otp/verify` (companyId placeholder, role='SUPER_ADMIN', isPlatformAdmin=true). Re-verify `User.is_platform_admin` is STILL true (someone may have revoked since login).

- [ ] **Step 2: Register route** in `apps/backend/src/server.ts` next to existing `auth.ts` registration.

- [ ] **Step 3: Run integration tests Task 5–10.** Implementation iterates until green.

**Acceptance:** All 5 happy/error scenarios pass against Railway prod DB.

---

## Task 5: Integration tests — happy + rotation grace + compromise

**Files:**

- Create: `apps/backend/test/auth-refresh-happy.test.ts`
- Create: `apps/backend/test/auth-refresh-rotation-grace.test.ts`
- Create: `apps/backend/test/auth-refresh-compromise-detect.test.ts`

Each test uses Magic Bypass OTP + Founder phone (per F1-a precedent in `auth-flow-new-format.test.ts`).

- [ ] **Step 1: happy path** — `verifyOtp` → use access → access TTL elapsed → refresh → use new access → refresh again. Assert new tokens differ from old. Assert old refresh no longer accepted (after grace window).

- [ ] **Step 2: rotation grace** — `verifyOtp` → refresh → IMMEDIATELY refresh again with the OLD token (simulates network race) → both calls succeed. Second call returns a FRESH token (T3, distinct from T2) because the store retains hashes only — see Task 4 amendment. Assert: T1, T2, T3 all distinct; both responses carry valid 200 access tokens; family row reflects T3 as `currentTokenHash` and T2 as `previousTokenHash`. After 11 s, the OLD token T1 returns 401 INVALID_REFRESH (rotated-out + grace expired).

- [ ] **Step 3: compromise detect** — `verifyOtp` → refresh (legitimate user; old token rotated out) → wait 11 s → attacker presents the ROTATED-OUT old token → 401 INVALID_REFRESH → verify family is `revokedAt!=null`, `revokedReason='COMPROMISE'` → verify `Membership.tokenEpoch` bumped → verify the legitimate user's NEXT access-token-protected call returns 401 EPOCH_MISMATCH (because epoch bumped). User must re-OTP.

---

## Task 6: Integration tests — legacy-reject + rate-limit + revoked + super-admin

**Files:**

- Create: `apps/backend/test/auth-refresh-legacy-reject.test.ts`
- Create: `apps/backend/test/auth-refresh-rate-limit.test.ts`
- Create: `apps/backend/test/auth-refresh-revoked.test.ts`
- Create: `apps/backend/test/auth-refresh-super-admin.test.ts`

- [ ] **legacy-reject** — POST `/auth/refresh` with a JWT-shaped token (issue via the now-deleted-but-still-imported-as-test-utility `issueRefreshToken` OR a hand-crafted JWT). Expect `401 AUTH_LEGACY_REFRESH`.

- [ ] **rate-limit** — 11 POST `/auth/refresh` calls from same IP in 60 s. 11th returns `429 REFRESH_RATE_LIMITED`. (Gated on `REDIS_URL` per existing worker-rate-limit precedent.)

- [ ] **revoked** — Manually update a family row (`revokedAt = now`, reason='ADMIN_REVOKE'). Refresh with that token → `401 REFRESH_REVOKED`. Verify Redis hash key absent.

- [ ] **super-admin** — Mint a SUPER_ADMIN OTP flow → refresh → verify new access carries `isPlatformAdmin=true`, no companyId leak. Verify family row has `membershipId IS NULL`. Bonus: set `User.is_platform_admin=false` after login, then refresh → 401 INVALID_REFRESH (privilege revoked).

**Acceptance:** all 7 integration test files green (3 from Task 5 + 4 from Task 6).

---

## Task 7: `/auth/otp/verify` swap + delete `issueRefreshToken`

**Files:**

- Modify: `apps/backend/src/routes/auth.ts:170-175`
- Modify: `apps/backend/src/lib/jwt.ts:67-81`
- Modify: `apps/backend/src/routes/auth.ts` imports

- [ ] **Step 1:** In `auth.ts` `/auth/otp/verify`, replace `const refreshToken = await issueRefreshToken(user.id);` with:

```ts
const { plainToken: refreshToken } = await refreshTokenStore.create({
  userId: user.id,
  membershipId: chosenMembership?.id ?? null, // null only for the SUPER_ADMIN bootstrap path
  userAgent: req.headers['user-agent']?.slice(0, 256),
  ipFirst: req.ip?.slice(0, 64),
});
```

- [ ] **Step 2:** Delete `issueRefreshToken` from `jwt.ts`. Remove the import in `auth.ts`. Run `tsc --noEmit` to catch any other call sites.

- [ ] **Step 3:** Re-run F1-a auth-flow test (`auth-flow-new-format.test.ts`) — must still pass. The refresh token in the response now starts with `axrt_` instead of `eyJ...`. Update assertion if the test checked refresh format (it shouldn't — tests only checked access JWT shape).

**Acceptance:** `/auth/otp/verify` returns `axrt_…` refresh tokens. F1-a tests still green.

---

## Task 8: Mobile interceptor + auth-store update

**Files:**

- Modify: `apps/mobile/lib/api-client.ts`
- Modify: `apps/mobile/lib/auth-store.ts` (add `replaceTokens`)
- Create: `apps/mobile/lib/api-client-refresh-interceptor.test.ts`

- [ ] **Step 1: Interceptor**

In `api-client.ts`, wrap the fetch call so that on 401 from any non-/auth/ path:

1. Read current refresh token from auth-store.
2. POST `/auth/refresh` with `{ refreshToken }`.
3. On 200: `authStore.replaceTokens({ accessToken, refreshToken })` → retry original request once with new access token.
4. On 401 `AUTH_LEGACY_REFRESH`: `authStore.wipe()` → signal logout (existing useAuthStore subscriber routes to OTP screen with "Session expired" toast).
5. On 401 anything else: `authStore.wipe()` → signal logout.
6. On 429: surface to caller as a normal 429 (don't loop).
7. On network error during refresh: surface original 401 to caller (don't wipe; retry next time).

Mutex on the refresh call so concurrent 401s share a single in-flight refresh (prevents the same race we built grace-window for, on the client side).

- [ ] **Step 2: `replaceTokens`** — atomic two-write to SecureStore (native) or localStorage (web). Reuse existing `setTokens` shape; the new method just doesn't touch `activeRole`.

- [ ] **Step 3: Unit test** — mock fetch + auth-store. Verify:
  - 401 + valid refresh → /auth/refresh called → original retried → final 200 returned to caller
  - 401 + AUTH_LEGACY_REFRESH → wipe + signal logout + original 401 surfaced
  - 401 + INVALID_REFRESH → wipe + signal logout
  - Two parallel 401s → only one /auth/refresh call (mutex)
  - /auth/refresh itself returning 401 does NOT loop (no nested interceptor)

**Acceptance:** unit tests green. (Real-device integration deferred to QA pass in Task 10.)

---

## Task 9: Audit pattern + enterprise preflight rerun

**Files:**

- Modify: `packages/ai-tools/src/session-audit.ts` (add pattern)
- Create: `docs/learnings/2026-05-28-all-refresh-tokens-must-be-opaque.md`

- [ ] **Step 1: Audit learning + pattern** — pattern that fails CI if any new code calls `issueRefreshToken` or creates a JWT with `kind:'refresh'`. Pattern: `issueRefreshToken|kind:\s*['"]refresh['"]`. `// audit-ok` comment exempts test files that craft legacy JWTs to verify the reject path.

- [ ] **Step 2: Run `pnpm --filter @axhy/ai-tools run audit`** — must pass clean (or with the same 7 pre-existing MEDIUMs that F1-b doesn't touch).

**Acceptance:** audit pattern in place; full run green.

---

## Task 10: Enterprise QA matrix + findings doc

**Files:**

- Create: `handoff/F1_B_QA_FINDINGS_2026-05-28.md`

- [ ] **Step 1: 5-persona walk against Railway prod**

Mint a token per persona (worker, supervisor, HR, COMPANY_ADMIN, SUPER_ADMIN). For each:

- a. Hit a protected route with the access token → 200
- b. Wait until access expires (or manually craft an expired one) → 401
- c. Mobile interceptor (or curl) calls `/auth/refresh` → new tokens
- d. Hit the same protected route with the rotated access token → 200
- e. Reuse the OLD access token → 401 (still expired)
- f. Reuse the OLD refresh token after 11 s → 401 INVALID_REFRESH + family revoked + epoch bumped → next refresh of the same family returns 401 even with the new token

- [ ] **Step 2: Adversarial pass**

- Attacker steals a refresh token, uses it 2 s after legitimate user rotated → tries to use within grace → BOTH succeed → 11 s later attacker reuses → COMPROMISE detected → both attacker + legitimate user locked out. Acceptable per locked spec.
- Attacker brute-forces refresh tokens by guessing — 11 attempts/min returns 429.
- Replay: capture a 200 refresh response, replay the body → server has already rotated → next refresh with that same old token = 401.
- Race: 50 parallel `/auth/refresh` calls from the same client with the same starting token (simulates app multiplexer) → grace window absorbs them; all 50 return the same rotated token (no compromise event).
- Cross-family: family A's token used against family B's `currentTokenHash` (manually crafted collision attempt) → 401 INVALID_REFRESH; unique index would have made the collision impossible to land anyway.

- [ ] **Step 3: Findings doc** with sections: scope, personas walked, adversarial scenarios, data-shape inspection (RefreshToken rows after walk), side-effects (Membership.tokenEpoch deltas, Redis key churn), latency profile (refresh round-trip < 50 ms p95 against Railway).

- [ ] **Step 4: `check_before_done`** with `flow_completeness` enumerating each persona + each adversarial scenario.

**Acceptance:** findings doc committed; `check_before_done` returns `allowed: true`.

---

## Done definition

- [ ] All 10 tasks above checked.
- [ ] 14 test files green (10 unit + 7 integration + 1 mobile + 4 from F1-a regression).
- [ ] `packages/ai-tools` audit clean (no new violations).
- [ ] Railway prod DB has the `RefreshToken` table.
- [ ] `handoff/F1_B_QA_FINDINGS_2026-05-28.md` committed.
- [ ] `handoff/NEXT_SESSION.md` updated to show F1-b DONE + F1-c queued.
- [ ] PR opened against main with all 10 task commits.

## Risk register

| Risk                                                 | Mitigation                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Redis outage mid-rotation                            | Postgres is source of truth; Redis is cache. Implementation tolerates Redis failure (logs warning, proceeds via DB).             |
| Migration locks Membership/User                      | Pure additive `CREATE TABLE` + FK adds — no ALTER on existing rows. Applied online with no downtime.                             |
| Mobile interceptor infinite loop                     | Mutex + explicit "do not intercept /auth/refresh itself" guard tested in Task 8.                                                 |
| Legacy token holders force-logged-out at scale       | Only the founder + ~3 test workers have tokens today. Confirmed cheap (Founder decision 2026-05-28).                             |
| Compromise false-positive killing legitimate session | 10-s grace window absorbs the realistic race window (mobile retry after 3 s timeout). Beyond 10 s it's almost certainly a steal. |
| Family-row table grows unbounded                     | Out-of-scope sweeper; partial index on `expiresAt` makes a future cron job cheap. Filed for f1-c.                                |
