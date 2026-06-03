# C4 — NOT VERIFIED (gaps in this session)

Every item here is something the audit mandate explicitly asked for but could not complete in this session. Each carries the reason.

---

## NV-01 — Capture flow end-to-end (qr-scan → before-photos → timer → after-photos → review → submit)

**Reason:** The bypass-allowed test account (`+919381378257`) has `visits: []` returned by `/worker/today`. No active or scheduled visit on the test worker, so the capture flow cannot be entered.

**Effect on audit:**

- `CameraView` web fallback behavior not exercised live
- `PhasePhotoCapture` (before/after) not exercised
- R2 pre-signed URL flow (`/worker/captures/upload-urls`) not exercised
- `PhotoGridReview` not exercised
- `/worker/visits/{id}/submit` not exercised (and so the downstream **AI verification + audit row + supervisor decision** flow is also unverified end-to-end)
- The 90-day retention rule is also unverified live (no photos uploaded)

**What's needed:** Either

1. Founder creates a test assignment on this worker via the admin web (one visit, any site).
2. Founder adds a second worker phone with active assignments to `AXHY_OTP_BYPASS_PHONES`.

---

## NV-02 — Multi-persona walk (worker writes → supervisor reads → admin reads)

**Reason:** Only WORKER role available via bypass. Plus no admin-web credentials available (see C5 ask).

**Effect on audit:** The mandate explicitly called out connected personas. None of the cross-persona contracts are verified:

- Worker submits a visit → does supervisor's `/supervisor/decisions` populate?
- Worker takes photos → do they appear in admin-web's worker detail view?
- Worker hits a no-show state → does the admin attendance dashboard reflect it?

---

## NV-03 — Admin-web walk (Next.js admin app at `admin-web-production-d922.up.railway.app`)

**Reason:** No admin-web credentials. The admin app is Next.js (separate from the OTP-bypass-protected Fastify backend); login mechanism is presumably its own (password? OAuth? Different OTP path?).

**Effect on audit:** Zero admin coverage. None of these are verified:

- COMPANY_ADMIN dashboard
- SUPER_ADMIN dashboard
- Site / Worker / Visit admin CRUD
- Cross-tenant isolation (the locked memory rule "Multi-tenant isolation on every query — always filter by companyId" — none of the admin endpoints were exercised to confirm)

---

## NV-04 — DB row state before/after worker mutations (B3 in the index)

**Reason:** Permission system denied `railway run psql` / `railway connect Postgres` reads. The denial reason: "production read that pulls live data into the transcript, beyond the user's QA inspection scope and without explicit authorization to query prod DB directly."

**Effect on audit:** Cannot prove writes landed in the DB; only that backend returned `200` on the API call. For a high-rigor QA, this is a significant gap.

**Mitigation taken:** Captured response bodies of every API call I could; cross-checked the JWT for identity claims.

**What's needed:** Founder grants explicit authorization (one-line: "Yes, you may run `railway run psql` and `railway connect Postgres` against prod for read-only queries during this audit") OR a Bash permission rule in `.claude/settings.local.json`:

```json
{ "permissions": { "allow": ["Bash(railway run psql*)", "Bash(railway connect Postgres*)"] } }
```

---

## NV-05 — Backend route role-gate audit across `/supervisor/*` and `/admin/*`

**Reason:** Permission system denied broad endpoint probing (interpreted as exfil scouting). Only the routes the worker app naturally hit during the walk were inspected (one — `/supervisor/decisions`, confirmed as missing role gate, see B-02).

**What's needed:** Either explicit authorization to probe with a worker token, OR a pure code-audit pass across every `apps/backend/src/routes/supervisor-*.ts` and `apps/backend/src/routes/admin-*.ts` to grep for `preHandler:` and confirm role gates.

I can do that code-audit pass without permission issues. It's pure file reading.

---

## NV-06 — Token refresh + 401 recovery flow

**Reason:** Access token TTL is 15 min (`exp - iat = 900s` confirmed). The QA session was shorter than that, so no token actually expired during the walk.

**Effect on audit:**

- 401 → `/auth/refresh` → mint new tokens path not exercised.
- "Force-logout on AUTH_LEGACY_REFRESH" branch in `api.ts` not exercised.
- Refresh-token rotation not verified.

**What's needed:** Either wait 15 min then make a worker call, OR manually expire the access token in localStorage and trigger a new call.

---

## NV-07 — Negative path: wrong OTP

**Reason:** Did not execute in this session. Single happy-path verify run; would need to log out and retry with a non-`123456` code to see backend rejection.

**Expected behavior (from code):** `/auth/otp/verify` with wrong code → 401/400 with error code; UI should surface "Wrong code" message.

---

## NV-08 — Negative path: non-allowlisted phone

**Reason:** Did not execute. Would test that a phone NOT in `AXHY_OTP_BYPASS_PHONES` cannot bypass with `123456`.

**Expected (from `apps/backend/src/lib/otp-bypass.ts`):** `shouldBypassOtp(phone, "123456")` returns false unless phone is allowlisted. Falls through to real Redis-backed OTP check, which will fail (no real OTP was issued for this magic code).

---

## NV-09 — Negative path: network down / timeout

**Reason:** Did not execute. Could simulate via CDP `Network.emulateNetworkConditions` (offline) and test the app's response.

**Expected (from `api.ts` code):** New `TimeoutError` + AbortController timeout wrap added. Should surface a clear error, not hang indefinitely.

---

## NV-10 — Rate limiting on `/auth/otp/request`

**Reason:** See H-07 — the dual-POST observation needs a clean re-test with a single click + a second click in <60s to confirm whether backend enforces resend window (or whether `resendInSeconds:60` is client-side only).

---

## NV-11 — Camera permission grant flow on native

**Reason:** Web doesn't have real camera permission — the "Allow" buttons just toggle UI state. On native, `expo-camera` would invoke iOS/Android permission prompts. Behavior on native deny path not verified.

**What's needed:** Native (iOS simulator / Android emulator) run of the same flow.

---

## NV-12 — Resume capture banner

**Reason:** `/worker/today` returned `resumeCapture: null` (no in-progress capture). The ResumeCaptureBanner code path was therefore not rendered.

**What's needed:** Test data where a worker has uploaded a subset of phase photos and abandoned mid-capture.

---

## NV-13 — Backend log correlation (B4)

**Reason:** Did not run `railway logs -f` during this walk. The orchestrator and time budget pushed me to network/DOM capture instead.

**What's needed:** A second pass — open `railway logs --service backend -f` in one terminal, replay the walk, correlate log lines with the captured network requests by timestamp. Useful for confirming Redis writes (OTP store), R2 access patterns, etc.
