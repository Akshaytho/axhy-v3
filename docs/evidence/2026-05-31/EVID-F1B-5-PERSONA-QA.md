# EVID-F1B-5-PERSONA-QA

**Date:** 2026-05-31
**Scope:** F1-b 5-persona enterprise QA walk — auth, refresh-token rotation, family revocation, tokenEpoch enforcement, anonymize cascade
**Target:** Local backend on `http://localhost:4000` against Railway prod Postgres (`DATABASE_URL` from `apps/backend/.env.local`)
**Harness:** `apps/backend/scripts/_qa-f1b-tmp/persona-walk.mjs` (gitignored, throwaway)
**Branch:** `feat/f1b-5-persona-qa`
**Run log:** `/tmp/f1b-walk-v2.log`

---

## Run summary

- Tenant: `axhy-qa-f1b-1780230273416`
- Personas seeded: OWNER, HR, SUPERVISOR, WORKER, SUPER_ADMIN (`is_platform_admin=true`)
- Backend `/health`: `{"ok":true,"checks":{"postgres":"ok","redis":"ok"}}`
- Walk exit: `0`
- Bugs surfaced: **0**
- Contracts confirmed: **11**

Two script bugs were found and fixed before the clean run (see "Script corrections" below). No production code was modified.

---

## Persona Matrix

| Persona     | Sign-in | Token shape | Authed read | Rotate | Replay (>10s) | Family revoke | tokenEpoch bump | Anonymize cascade      |
| ----------- | ------- | ----------- | ----------- | ------ | ------------- | ------------- | --------------- | ---------------------- |
| OWNER       | PASS    | PASS        | PASS (200)  | PASS   | PASS          | PASS          | PASS (epoch=1)  | n/a                    |
| HR          | PASS    | PASS        | PASS (200)  | PASS   | PASS          | PASS          | PASS (epoch=1)  | n/a                    |
| SUPERVISOR  | PASS    | PASS        | PASS (200)  | PASS   | PASS          | PASS          | PASS (epoch=1)  | n/a                    |
| WORKER      | PASS    | PASS        | PASS (200)  | PASS   | PASS          | PASS          | PASS (epoch=1)  | PASS (REFRESH_REVOKED) |
| SUPER_ADMIN | PASS    | PASS        | PASS (200)  | PASS   | PASS          | PASS          | PASS (epoch=1)  | n/a                    |

**Authed-read routes used:**

- `/me` for OWNER, HR, SUPER_ADMIN (universal `requireAuth` GET)
- `/supervisor/today` for SUPERVISOR (`requireAuth` GET)
- `/worker/today` for WORKER (`requireWorkerRole` GET)

**Token shape contract:**

- `accessToken` = JWT (three dot-separated parts)
- `refreshToken` = opaque `axrt_<base64url>`

**Rotate contract:**

- POST `/auth/refresh` → 200 with fresh JWT access + fresh `axrt_` refresh (must not equal the previous one)
- Old token's sha256 hash lands in `RefreshToken.previousTokenHash`

**Replay-attack contract (>10s after rotation):**

- POST `/auth/refresh` with old token → 401 `INVALID_REFRESH`
- `RefreshToken.revokedAt` set, `revokedReason=COMPROMISE`
- `Membership.tokenEpoch` incremented
- Previously-issued access token (from the rotation that triggered compromise) → 401 on protected route

**Anonymize cascade (WORKER):** sign in fresh, anonymize `User.phone` + bump epoch + `TERMINATED` membership + revoke all live `RefreshToken` rows in one transaction, then POST `/auth/refresh` with the worker's refresh token → 401 `REFRESH_REVOKED`. PASS.

---

## Adversarial Matrix

| Scenario                                     | Expected                                 | Got                    | Result |
| -------------------------------------------- | ---------------------------------------- | ---------------------- | ------ |
| Forged JWT (wrong secret)                    | 401 on `/me`                             | 401 `AUTH_INVALID`     | PASS   |
| Expired JWT (real secret, exp in past)       | 401 on `/me`                             | 401 `AUTH_INVALID`     | PASS   |
| Random `axrt_<base64url>` token              | 401 `INVALID_REFRESH`                    | 401 `INVALID_REFRESH`  | PASS   |
| Within-grace prev-hash reuse (<10s)          | 200 + new tokens minted (grace re-mint)  | 200 + valid new tokens | PASS   |
| Beyond-grace prev-hash reuse (>10s)          | 401 `INVALID_REFRESH` + family revoked   | 401 `INVALID_REFRESH`  | PASS   |
| SUPER_ADMIN refresh with `membershipId=null` | 200 + valid tokens (platform-admin path) | 200 + valid tokens     | PASS   |

---

## Bugs found

**None.** All five personas and all six adversarial scenarios passed.

---

## Contracts confirmed

1. OWNER: family revoked with `reason=COMPROMISE` on replay.
2. OWNER: access token rejected after `tokenEpoch` bump.
3. HR: family revoked with `reason=COMPROMISE` on replay.
4. HR: access token rejected after `tokenEpoch` bump.
5. SUPERVISOR: family revoked with `reason=COMPROMISE` on replay.
6. SUPERVISOR: access token rejected after `tokenEpoch` bump.
7. WORKER: family revoked with `reason=COMPROMISE` on replay.
8. WORKER: access token rejected after `tokenEpoch` bump.
9. WORKER: anonymize cascade revokes live refresh tokens — anonymized worker cannot rotate (`REFRESH_REVOKED`).
10. SUPER_ADMIN: family revoked with `reason=COMPROMISE` on replay.
11. SUPER_ADMIN: `membershipId=null` refresh path returns 200 + valid tokens (platform-admin compatibility confirmed).

These are the load-bearing auth invariants for F1-b. All hold across every persona seeded in this run.

---

## Script corrections (QA infra only, not production)

Two false positives surfaced on the first run; both were script-side assumptions, not production bugs. Fixed in `persona-walk.mjs`, re-run produced the clean matrix above.

### 1. Stale `PROTECTED_ROUTE` map (HIGH false positive)

Original mapping pointed OWNER/HR at `GET /admin/memberships` and SUPER_ADMIN at `GET /super-admin/memberships`. Neither GET exists — only `POST /admin/memberships` (R1, see `apps/backend/src/routes/admin-memberships.ts`) and `POST /super-admin/memberships`. Result: 404 on the authed-read check, and a chained false CRITICAL on `epoch-enforcement` (404 is route-shape, not auth, so it looked like the post-bump access token "still worked").

**Fix:** Point OWNER/HR/SUPER_ADMIN at `GET /me` — the universal `requireAuth` GET — since neither role currently has a dedicated GET surface. SUPERVISOR keeps `/supervisor/today`, WORKER keeps `/worker/today`.

**Implication for production:** GET surfaces for OWNER/HR/SUPER_ADMIN listing memberships don't exist yet. Likely intentional for F1-b (write paths only), but worth confirming when admin-web UI lands. Not in scope of this commit.

### 2. Anonymize cascade `User.phone` length (CRITICAL false positive)

Original anonymize scheme: `anon:${sha256(phone).hexDigest}` = `anon:` + 64 hex chars = **69 chars**. `User.phone` is `VarChar(16)` (per `packages/shared-schema/prisma/schema.prisma`). Prisma raised `P2000` "value too long" and crashed the WORKER walk before the cascade assertion could run.

**Fix:** `anon:` + 11 hex chars = exactly 16 chars, fits the column. Anonymization still uniquely keyed on the original phone (sha256 prefix collision probability negligible for QA scope; production anonymizer should use a dedicated, schema-aware encoding — not in scope here).

**Implication for production:** None. This was purely the QA harness using an unrealistic anonymization length. Real anonymization paths (when built) need to respect the `VarChar(16)` constraint or migrate the column.

---

## Recommendations

1. **Land a real `GET /me`-equivalent for OWNER/HR scope** when admin-web needs to enumerate company memberships — current state forces UI to call write endpoints or read indirect data. Not a security gap, just a missing read surface.
2. **Document the prev-hash grace window (10s) explicitly** in `docs/locked/` if not already there — the script's PASS on within-grace re-mint is load-bearing for mobile flaky-network scenarios.
3. **Anonymize path needs schema-aware encoding** before HR-anonymization ships. Either widen `User.phone` (breaks E.164 invariant) or use a shorter deterministic encoding (e.g., base32 of first 8 bytes of sha256 → fits 16-char limit with `anon:` prefix room to spare).
4. **The harness lives in `_qa-f1b-tmp/` (gitignored).** Future F1-c/F1-d walks should fork it into a similarly-gitignored dir, not promote it to permanent infra — these are throwaway acceptance harnesses, not regression suites.

---

## Environment

- `BASE_URL=http://localhost:4000`
- `DATABASE_URL` = Railway prod Postgres (from `apps/backend/.env.local`)
- `JWT_SECRET` = from `apps/backend/.env.local`
- `NODE_ENV=development`
- Backend process: pre-existing (not started by this walk)
- Node: harness uses native `fetch` + `jose@SignJWT` + `@prisma/client@5.22.0`
