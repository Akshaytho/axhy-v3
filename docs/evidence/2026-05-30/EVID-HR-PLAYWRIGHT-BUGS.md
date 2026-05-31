---
title: EVID-HR-PLAYWRIGHT-BUGS — Real UI bugs surfaced during HR A1 visual verification
date: 2026-05-30
slice: HR A1 (Playwright visual-proof attempt)
branch: feat/hr-a1-thin-portal
status: RESOLVED 2026-05-30 — both bugs fixed in same branch; 14/14 HR screens captured
resolved_by: docs/evidence/2026-05-30/EVID-HR-A1-PLAYWRIGHT.md
[ORCHESTRATOR_EXCEPTION] documentation only, status flip + pointer to resolution evidence
---

> **RESOLVED 2026-05-30.** Both bugs documented below were fixed in this
> branch (feat/hr-a1-thin-portal) the same session they were surfaced:
>
> 1. **admin-web login destructure** — `apps/admin-web/app/login/page.tsx`
>    now reads `{ accessToken, refreshToken, memberships }` with role-aware
>    redirect via `/api/auth/session`.
> 2. **jwt-public verifier `sub` vs `userId`** — `packages/jwt-public/src/verify.ts`
>    REQUIRED list now reads `sub` per JWT RFC-7519 §4.1.2; `userId` kept as
>    a legacy alias on the returned payload so existing consumers compile.
>
> Playwright probe re-ran green, 14/14 HR screens captured. See
> [EVID-HR-A1-PLAYWRIGHT.md](./EVID-HR-A1-PLAYWRIGHT.md) for the proof.
> Original findings preserved verbatim below for audit trail.

---

## Summary

While running the HR A1 screenshot-capture probe (`apps/admin-web/e2e/hr-screenshots.spec.ts`) against the freshly seeded `axhy-sandbox` tenant with the operator OTP allowlist bypass (`code='123456'`), I hit a **real UI bug in `/login` that blocks every login** through the admin-web. Per the session task's hard rule ("If Playwright surfaces a REAL UI bug — not a flake or env issue — STOP, write findings, do not fix, report and exit") I am stopping here.

## The bug

**Symptom:** After entering phone `+919900001111` and the bypass OTP `123456`, the page shows the inline error **"Login response invalid — please retry"** and never navigates away from `/login`.

**Root cause (precise):**

`apps/admin-web/app/login/page.tsx:135` destructures the `/auth/otp/verify` JSON response as:

```ts
const { accessToken, refreshToken, user } = verifyJson;
if (!accessToken || !refreshToken || !user) {
  setOtpError('Login response invalid — please retry');
  return;
}
```

But the backend `POST /auth/otp/verify` (`apps/backend/src/routes/auth.ts:180-191`) returns:

```ts
const out: VerifyOTPOutput = {
  ok: true,
  accessToken,
  refreshToken,
  memberships: memberships.map((m) => ({
    companyId: m.companyId,
    companyName: m.company.name,
    role: m.role as Role,
  })),
};
```

**There is no `user` field on the response.** The `!user` guard always fails. **Nobody can log in via the admin-web.**

**Verified by direct curl** (bypass path, against the same Railway dev DB):

```
$ curl -X POST http://localhost:4000/auth/otp/verify \
    -H 'content-type: application/json' \
    -d '{"phone":"+919900001111","code":"123456"}'
{
  "ok": true,
  "accessToken": "eyJhbGciOiJIUzI1NiJ9.…",
  "refreshToken": "axrt_…",
  "memberships":[{"companyId":"…","companyName":"Reddy Cleaning Services","role":"HR"}]
}
HTTP 200
```

The backend works. The admin-web login page is the bug.

## Scope of impact

- Every persona (HR, SUPERVISOR, OWNER, COMPANY_ADMIN, SUPER_ADMIN) is blocked from signing into admin-web.
- This is **not** an HR A1 regression — `login/page.tsx` is the same shape as before HR A1 (last touched in commit `0c905d7`, well before HR A1 work).
- The HR A1 routes themselves cannot be visually verified through the UI until this is fixed, OR until the test bypasses the UI auth step by directly seeding the session cookie via `/api/auth/session`.

## Why this wasn't caught earlier

- The login page's "happy path" was never exercised end-to-end after backend `/auth/otp/verify` was changed to drop the `user` field (or never returned it at all). Backend integration tests cover route responses but no admin-web integration test exercises the login form.
- The deferred Playwright spec (`hr-water-flow.spec.ts` at commit `805edc8`) was authored ahead-of-execution and was never run, so this break was invisible.

## Proposed fix (NOT applied — for founder triage)

One of:

1. **Update admin-web login page**: drop the `user` guard. Use `memberships[0]` (or `accessToken` decode) to confirm a successful response:

   ```ts
   const { accessToken, refreshToken, memberships } = verifyJson;
   if (!accessToken || !refreshToken || !Array.isArray(memberships) || memberships.length === 0) {
     setOtpError('Login response invalid — please retry');
     return;
   }
   ```

2. **Update backend** to also include a `user` field (`{ id, phone, name, locale }`). Probably overkill — login page doesn't actually consume the `user` value, it only checks for truthy.

Option 1 is the correct fix: backend response shape matches the typed `VerifyOTPOutput` contract; the admin-web guard is the bug.

## Other findings during this session (informational, not blockers)

- `apps/admin-web/e2e/hr-water-flow.spec.ts` (the deferred spec from `805edc8`) uses **selectors that don't match the implemented login form**:
  - spec uses `input[name="phone"]` / `input[name="otp"]` but login uses `id="phone"` / `id="otp"` with no `name=` attribute.
  - spec uses bypass code `'000000'` but the production-safe operator bypass requires `'123456'` (`apps/backend/src/lib/otp-store.ts:158` for `AXHY_OTP_BYPASS=1` path, `apps/backend/src/lib/otp-bypass.ts:23` for production allowlist path).
  - spec uses `await page.click('button:has-text("Verify"))` but the actual button text is `"Verify and continue"`.
  - playwright.config.ts uses port `3001`, but `pnpm --filter admin-web dev` runs on port `3000`.
  - These selector/port mismatches are pure spec drift (the deferred spec was authored without running) and should be fixed alongside the login bug fix.

- The login page hard-codes redirect target as `setRedirectTarget(redirect ?? '/owner')` (line 153). Once the login bug is fixed, HR users will be routed to `/hr` correctly per `/api/auth/session/route.ts:72-73`.

## What I did before stopping

1. Installed Playwright `1.59.1` + Chromium for `@axhy/admin-web`.
2. Confirmed backend is running locally on `:4000` against Railway DB; admin-web dev on `:3000`.
3. Seeded the persistent `axhy-sandbox` tenant via `apps/backend/scripts/seed-sandbox.ts` (no destructive ops — idempotent).
4. Added HR membership for `+919900001111` (`Anita HR`) under the same tenant via a one-off seed script.
5. Authored `apps/admin-web/e2e/hr-screenshots.spec.ts` to capture full-page screenshots of every HR route.
6. Ran the probe — failed at the login step.

## Captured screenshots (only the 2 pre-bug shots)

- `docs/evidence/2026-05-30/hr-00-login-phone.png` — empty phone form
- `docs/evidence/2026-05-30/hr-01-login-otp.png` — OTP step, blank field

The remaining 12 HR-screen screenshots were not captured because the UI bug blocks navigation past `/login`.

## Cleanup state

- Admin-web dev server still running on `:3000` (Next dev). Kill with: `lsof -ti:3000 | xargs kill`.
- Backend on `:4000` was already running pre-session (not started by this session).
- No `.env.local` files were modified or committed; no secrets touched.
- Seeded DB rows in `axhy-sandbox` (`Reddy Cleaning Services` tenant) persist — same pattern as prior smoke-test runs.

## Recommended next steps

1. Founder triages the `/login` bug (1-line guard fix in `apps/admin-web/app/login/page.tsx:135-138`).
2. Re-run the screenshot probe — should complete all 13 HR screens once login works.
3. Separately, fix `hr-water-flow.spec.ts` selector drift (or supersede with `hr-screenshots.spec.ts`).

## Files touched in this session

- (new) `apps/admin-web/e2e/hr-screenshots.spec.ts`
- (new) `docs/evidence/2026-05-30/EVID-HR-PLAYWRIGHT-BUGS.md` (this file)
- (new) `docs/evidence/2026-05-30/hr-00-login-phone.png`
- (new) `docs/evidence/2026-05-30/hr-01-login-otp.png`
- (DB) seeded `axhy-sandbox` tenant rows (idempotent)

No production code touched.
