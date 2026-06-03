<!-- [ORCHESTRATOR_EXCEPTION] negative-path matrix against prod auth -->

# B6 — Negative-path test matrix (live, prod)

Direct backend tests via `fetch()` from the browser context — all against `https://backend-production-344e1.up.railway.app`. No UI involved; pure HTTP behaviour.

## Auth verify — wrong / malformed inputs

| Test                                 | Input                                           | Status  | Body                                                                           | Verdict                                                                    |
| ------------------------------------ | ----------------------------------------------- | ------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Wrong OTP code on bypass phone       | `+919381378257`, `999999`                       | **401** | `{"error":"OTP_INVALID","message":"OTP invalid, expired, or already used"}`    | ✓ correct                                                                  |
| Wrong OTP `000000`                   | `+919381378257`, `000000`                       | **401** | same                                                                           | ✓ correct                                                                  |
| Empty code                           | `+919381378257`, `""`                           | **400** | Zod: `OTP must be exactly 6 digits`                                            | ✓ correct (input validation)                                               |
| Malformed phone                      | `not-a-phone`, `123456`                         | **400** | Zod: `Phone must be 10–15 digits, optionally prefixed with +`                  | ✓ correct                                                                  |
| SQLi attempt in phone                | `+91' OR '1'='1`, `123456`                      | **400** | Zod regex rejected before reaching DB                                          | ✓ correct (boundary defense)                                               |
| XSS attempt in code                  | `<script>alert(1)</script>`                     | **400** | Zod regex rejected                                                             | ✓ correct                                                                  |
| Non-allowlist phone + magic code     | `+919999999999`, `123456`                       | **401** | `OTP_INVALID`                                                                  | ✓ **bypass fails closed** — confirms `otp-bypass.ts` allowlist enforcement |
| Non-allowlist phone + arbitrary code | `+919999999998`, `567890`                       | **401** | same                                                                           | ✓ correct                                                                  |
| No Authorization header              | GET `/worker/today`                             | **401** | `{"error":"AUTH_REQUIRED","message":"Authorization: Bearer <token> required"}` | ✓ correct                                                                  |
| Corrupted/tampered JWT               | GET `/worker/today` with last 10 chars replaced | **401** | `{"error":"AUTH_INVALID","message":"Token invalid or expired"}`                | ✓ correct                                                                  |

**All defenses fired correctly.** Boundary validation, allowlist enforcement, signature check, presence check — all working.

## Rate limiting

| Test                                            | Action                 | Result                                       |
| ----------------------------------------------- | ---------------------- | -------------------------------------------- |
| 5 rapid `POST /auth/otp/request` for same phone | back-to-back, no delay | Status sequence: `[200, 200, 429, 429, 429]` |

**Backend enforces rate limit.** First 2 requests within the window are allowed (burst tolerance, presumably to handle accidental double-tap), 3rd onward returns 429. This **invalidates H-07 (down-graded)** — the resend-window IS enforced server-side, just with a 2-request burst tolerance.

**Cooldown window:** Not measured exactly. A subsequent `step1` request 30+ seconds later still returned 429 in the next walk — so cooldown is in the minute(s) range, matching the `resendInSeconds:60` hint roughly.

## B-02 confirmation — supervisor data shape disclosed to worker

| Test                                       | Action                | Result                                                                                                                                                                                |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker token → `GET /supervisor/decisions` | Bearer `<worker JWT>` | **200** with full structured response: `{rows: [], counts: {needsYouNow, routine, autoDismissedThisRead, failedReview, total}, pageInfo: {cursor, hasMore, limit, totalAcrossPages}}` |

The `rows` are empty (service-layer scope by `supervisorId == userId`), but **the response envelope shape leaks**:

- Worker learns the supervisor decision-queue categorization (`needsYouNow`, `failedReview`, etc.)
- Worker learns pagination params (`limit: 50`)

**Severity:** still HIGH (information disclosure even when data is empty). The fix is the same as B-02 (add `requireRole` preHandler).

## B-03 escalation — `/auth/sign-out` endpoint DOES NOT EXIST

Earlier C1 stated the route was registered. **That was wrong.** Live test:

| Test                                                                    | Action                 | Result                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST /auth/sign-out` with valid worker JWT + refresh token             | normal sign-out call   | **404 Not Found** — `{"message":"Route POST:/auth/sign-out not found","error":"Not Found","statusCode":404}` |
| `POST /auth/refresh` with the same refresh token after "local sign-out" | should fail if revoked | **200 OK** — new accessToken minted, sub matches the same worker, role=WORKER                                |

**Conclusion:**

- The backend has no concept of sign-out. There is no endpoint to revoke a refresh token family.
- Frontend "sign-out" only clears local storage. The refresh token remains valid server-side until its natural TTL expiry.
- A stolen refresh token can mint access tokens forever (until rotation expires the family naturally).

**B-03 is now strictly worse than originally reported.** Updating C1-blockers.md accordingly.

**Fix:**

1. Backend: implement `POST /auth/sign-out` (revoke the refresh-token family by `userId` or by token-family-id).
2. Frontend: in `onAppLogout`, call it before clearing local storage; fire-and-forget so local sign-out always succeeds even if backend fails.
3. Consider: implement a server-side `revoked_at` timestamp on the RefreshToken family that the refresh route checks before minting.

## Token presence/integrity

Both the standard 401 messages are present and distinguish cases. Useful for frontend handling:

- `AUTH_REQUIRED` — no header at all
- `AUTH_INVALID` — header present but signature fails / expired

The frontend `api.ts` audit confirmed both branches are handled. Live behaviour matches.

## What I did not test live

- Token natural expiry → automatic refresh on 401 (would need to wait 15 minutes for `exp` to lapse, OR I'd need to programmatically set a fake `exp` claim in the past — JWT signature would then fail, which would surface as `AUTH_INVALID` instead of `AUTH_EXPIRED`).
- CSRF (the API uses Bearer tokens, not cookies, so CSRF is not in the threat model).
- HTTPS downgrade attempts (out of scope — Railway terminates TLS).
- Sustained DDoS (rate-limit test was a 5-burst, not a sustained-rate test).
