# B7 — Admin web live walk

Driving: Chrome on `--remote-debugging-port=9222`, viewport 390×844 (mobile). Target: `https://admin-web-production-d922.up.railway.app`.

## Landing page `/`

Marketing site. Title: "Axhy — Voice-first ops for Indian cleaning companies."

Body excerpt:

> Run your floor by voice, not by typing. Built for Indian cleaning. Your supervisors speak in Telugu, Hindi, or English between visits. Axhy listens, verifies the work, and remembers how your company actually runs. Starting at ₹8,000/month. Free 30-day pilot.

Has CTAs: "Talk to founder on WhatsApp", "See pricing".

Tech stack signal: **uses React Native Web** (same console warnings as the worker mobile: `shadow*`, `pointerEvents`, `useNativeDriver`, OneSignal init skipped).

Same RN-Web findings (L-01, L-02, L-03) apply to admin web.

## `/login`

**Form:**

- 1 input: `type=tel`, placeholder `+91 98765 43210`, **`autoComplete="tel"`** ✓ (the worker app has this wrong — `"on"` — see L-04).
- 1 button: `<button type="submit">Send OTP</button>` ✓ (the worker app uses `<div>` with click handler — admin form is more accessible / e2e-stable).

**Critical observation: the admin web uses the SAME `/auth/otp/*` backend endpoints as the worker mobile.**

This means **the bypass phone `+919381378257` + magic code `123456` logs in here too**.

## Login walk

1. Typed `+919381378257`, clicked "Send OTP".
2. Backend `POST /auth/otp/request` → `200`. UI moved to OTP screen.
3. OTP form: `type=text`, `maxLength=6`, placeholder "••••••". Resend countdown started at 60s.
4. Typed `123456`, clicked "Verify and continue".
5. Backend `POST /auth/otp/verify` → `200` (real tokens minted).
6. **App navigated to `/owner`.**

## Post-login state

| Item                    | State                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| URL                     | `/owner`                                                                 |
| localStorage            | **empty** (`Object.keys(localStorage) → []`)                             |
| Cookies on admin domain | **none** (verified via CDP `Network.getCookies`)                         |
| Page title              | "Axhy — Voice-first ops for Indian cleaning companies" (same as landing) |
| Page body               | "OWNER DASHBOARD / Coming soon. / Your owner dashboard isn't live yet…"  |

## Authentication is COSMETIC, not enforced

To test whether `/owner` is auth-gated, I cleared all browser cookies and re-navigated to `/owner` directly with no auth state.

Result: **identical page**. `/owner` is a public placeholder. The login flow doesn't gate anything.

## Admin routes that don't exist yet

Probed common admin paths (all from a clean no-auth state):

| Path         | Status                                  |
| ------------ | --------------------------------------- |
| `/`          | 200 (marketing landing)                 |
| `/login`     | 200 (OTP form)                          |
| `/owner`     | 200 (public "Coming soon" placeholder)  |
| `/pricing`   | 200 (marketing)                         |
| `/dashboard` | **404 — This page could not be found.** |
| `/workers`   | **404**                                 |
| `/sites`     | **404**                                 |
| `/visits`    | **404**                                 |
| `/settings`  | **404**                                 |
| `/profile`   | **404**                                 |

## What this means for the QA mandate

The QA mandate explicitly called for testing **connected personas** — supervisor/COMPANY_ADMIN/SUPER_ADMIN views against worker writes. The framing in earlier C5 ("need admin credentials") was wrong:

**The admin/supervisor dashboards are NOT BUILT YET.**

- Admin web is essentially marketing + login + placeholder.
- All admin operational routes return 404.
- The only working backend-touching code path is the login itself (which exists but doesn't gate anything).
- The supervisor view is `apps/mobile/app/(supervisor)/*` (lives inside the same mobile codebase as worker — see B-01 BLOCKER for the routing collision risk between the two).

**Therefore:**

- Cross-persona walk (worker → supervisor → admin) can't happen against the admin web because there's no admin UI yet.
- The B-02 supervisor-decisions backend exposure (no role gate) is real but **not exploitable via the admin UI today** because the admin UI doesn't surface it.
- The supervisor MOBILE preview exists (`apps/mobile/(supervisor)`) but requires SUPERVISOR-role auth — and the founder phone has WORKER role only.

## Positive findings on admin

These are deliberate good choices that the worker app should learn from:

| Item                          | Worker mobile             | Admin web                     | Recommended action                                                                               |
| ----------------------------- | ------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `autoComplete` on phone input | `"on"` (wrong)            | `"tel"` (right)               | Bring worker to parity (see L-04)                                                                |
| Login submit element          | `<div>` with onClick      | `<button type="submit">`      | Bring worker to parity (a11y + form semantics + e2e stability)                                   |
| Token storage on web          | `localStorage` (XSS-vuln) | None set yet (cosmetic login) | When admin is built, prefer httpOnly secure cookies — apply same to worker web if shipped (H-05) |

## Negative findings on admin

| Item                                                                                  | Severity          | Detail                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/owner` and other future-admin routes have no auth gate**                          | **HIGH (latent)** | Currently safe because `/owner` is just "Coming soon" placeholder. When the real owner dashboard ships, the route needs an auth + role guard wired into the Next.js layout.                 |
| **No client-side role check on `/owner`**                                             | OBSERVATION       | A WORKER token reaching `/owner` is currently harmless (placeholder). Will be a real bug if the placeholder is ever replaced without adding `requireRole('OWNER')` server-side at the page. |
| **OTP request from `/login` accepts phone repeatedly with `resendInSeconds:60` hint** | INHERITED from B6 | Same rate-limit behavior as worker app: 2 burst, then 429.                                                                                                                                  |

## Console warnings on admin (identical to worker)

- `[warning] "shadow*" style props are deprecated`
- `[warning] props.pointerEvents is deprecated`
- `[warning] [identity-lifecycle] OneSignal initialize skipped` (web)
- `[warning] Animated: useNativeDriver is not supported` (web)

Same RN-Web tech debt. Fix once, benefit twice.

## supervisor-preview not walked

`apps/supervisor-preview/` exists as a separate Next.js app, and `https://supervisor-preview-production.up.railway.app` is in the backend CORS allowlist — so it's deployed too. Did not walk in this session (out of time + same WORKER-role-only auth limit applies).

## Final framing correction to earlier docs

**C5-A-02 (admin credentials ask) should be reframed.** It's not "need creds to walk admin" — it's **"admin UI is not built; nothing to walk yet."**

When admin UI is built, the unblock path will be different — role membership records, not phone bypass.
