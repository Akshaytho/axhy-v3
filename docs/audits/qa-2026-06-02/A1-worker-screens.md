# A1 — Worker screens walked (live, against prod)

Each section: what I did, what the screen rendered, what backend it called, what I noted. Findings here are cross-referenced to C1–C3 by code (B-01, H-04, etc.).

Driving: Chrome on `--remote-debugging-port=9222`, Expo Web at `http://localhost:8081` (already running PID 18357 at session start, bundle confirmed to inject `EXPO_PUBLIC_API_BASE_URL=https://backend-production-344e1.up.railway.app`).

Viewport: 390×844 (iPhone 14), `mobile: true` via CDP `Emulation.setDeviceMetricsOverride`.

Screenshots saved to `/tmp/qa-2026-06-02/*.png`.

---

## /phone (auth entry)

**What rendered:** "AXHY / Sign in / Enter your mobile number to continue. / +91 / Get OTP"

**DOM:**

- 1 input: `type=tel`, `placeholder="98765 43210"`, `maxLength=10`, no `aria-label`, no `testID`.
- 1 button: `<div>Get OTP</div>`, no `role="button"`, `aria-disabled=true` initially.

**Action:** Programmatically set `inputs[0].value = "9381378257"` via the React-aware native-input-setter pattern, then dispatched `input` + `change` events. Button enabled (aria-disabled cleared).

**Backend call after Get OTP click:** `POST /auth/otp/request` body `{"phone":"+919381378257"}` → `200 {"ok":true,"resendInSeconds":60}`. Preflighted (CORS OPTIONS 204).

**Findings rooted here:**

- M-03 (no aria-label / testID)
- M-02 (phone leaks into next URL's query string)
- L-04 (autocomplete should be "tel")
- H-07 (server may not enforce resendInSeconds)

---

## /otp?phone=… (OTP entry)

**What rendered:** "← Back / Enter OTP / Sent to +91 ••••8257 / Verify / Resend OTP in 58s"

**DOM:**

- 3 `<input>` elements present:
  - `idx=0`: stale `type=tel` carryover from /phone (hidden, value preserved) — see M-04
  - `idx=1`: hidden composite OTP paste-capture input
  - `idx=2`: visible OTP input, `type=text`, `maxLength=6`, `inputMode=numeric`, placeholder "------"
- "Verify" rendered as nested DOM: outer `<div>` Pressable (wide, aria-disabled until input valid) + inner `<div>` text label
- "Resend" countdown visible

**Action:** Typed `123456` into visible input (idx 2). Clicked outer Verify wrapper.

**Backend call:** `POST /auth/otp/verify` body `{"phone":"+919381378257","code":"123456"}` → `200`. Response includes `accessToken` (JWT). Decoded JWT:

```
sub: aa3699e4-95a3-4880-8bff-0c69c49621cb     (User.id)
companyId: eb552ff4-5f7f-4469-8632-56c5a1c0fd43
role: WORKER
availableRoles: ["WORKER"]
membershipId: dca8d94c-5d71-4d2d-aa79-14e237586a08
iat: 1780347387
exp: 1780348287   ← 15-min access TTL
kind: access
```

**Tokens persisted:** `localStorage` gets `axhy_access_token`, `axhy_refresh_token`, `axhy_active_role`. See H-05.

**Findings rooted here:**

- M-02 (phone in URL `/otp?phone=%2B919381378257`)
- M-04 (stale input from /phone)
- L-05 (autocomplete should be "one-time-code")
- H-05 (refresh token in localStorage on web)
- OBS-01 (JWT.sub User.id ≠ worker.workerId)

---

## /permissions (camera + location prompt)

**What rendered:** "Allow access / Camera is for before-and-after photos. Location confirms you're at the right site when you start work. / Camera [Required] [Allow] / Location [Required] [Allow] / Continue"

**DOM:**

- 2 small "Allow" Pressables (35–59 px wide) — initially the Continue button is disabled (`aria-disabled=true` on outer wrapper at y=583)
- Continue inner text element (y=599)

**Action:** Pre-granted browser permissions via CDP `Browser.grantPermissions {geolocation, videoCapture, audioCapture}`. Walked up DOM to find clickable parent of each "Allow" `<div>`, clicked both. Then clicked outer Continue wrapper.

**Backend call:** Nothing fired from this screen. Permissions are gated client-side only (verified via Network capture: no POST during this screen). On web specifically, the "Allow" buttons just toggle UI state — they don't request real browser permissions (those were granted via CDP).

**Caveat for native:** On iOS/Android the buttons would invoke real OS prompts. Not tested in this session.

**No findings unique to this screen.** The flow worked.

---

## /consent (privacy notice)

**What rendered:** "Your privacy / Axhy stores your name, phone, photos you take during work, and your location while you are on a job. We use this to prove the work was done and to pay you on time. We never sell your data. / • Photos are kept until 90 days after you leave. / • Location is only tracked while a job is active. / • You can delete your account by emailing support@axhy.app. / Read the full privacy notice → / I agree, continue / I don't agree"

**Action:** Found outer "I agree, continue" Pressable (width 468), clicked.

**Backend calls:**

- `POST /worker/consent` body `{"policyVersion":"2026-05-21"}` → `200 {"ok":true,"acceptedAt":"2026-06-01T20:59:24.862Z"}`
- Then `GET /worker/today` → `200` with payload

**Positive observations** (see OBS-02 in C3):

- Plain-English copy, honest, retention disclosure, opt-out path.
- Calls the documented backend endpoint with the policy version string.

**Not verified:**

- What happens on "I don't agree" path. Probably blocks progression. Could be a kicker UI.

---

## / (worker Home)

**What rendered (live body):**

```
Tuesday, 2 June
Good morning
0  DONE
0  PLANNED
TODAY'S PLAN · 0 SITES
[icon] No work today
Your supervisor will assign jobs when ready.
[tab bar: Today / Capture / History / You]
```

**Backend call:** `GET /worker/today` →

```json
{
  "workerId": "497fbe55-28a1-48d3-9e30-c31a5156a21d",
  "workerState": "ACTIVE",
  "todayDate": "2026-06-02",
  "supervisorPhone": null,
  "visits": [],
  "resumeCapture": null
}
```

**Observations:**

- Greeting falls back to "Good morning" with no name (audit confirmed JWT has no `name` claim, and `/worker/today` doesn't return one).
- "0 DONE / 0 PLANNED" stat strip — Avg score removed per prior plan ✓ (no fake data).
- Empty state copy is concise and accurate.
- NextSiteCard hero is NOT rendered (correct — no visits).
- ResumeCaptureBanner not rendered (correct — `resumeCapture: null`).
- Hamburger (top-left) and Sync pill (top-right) rendered.

**No new findings on Home itself** — code-audited as correct, live behavior matches.

---

## /capture-launcher (Capture tab tap with no assignments) — see H-01

**Action:** Clicked Capture tab (tab href = `/capture-launcher`).

**What rendered:** URL momentarily flickered to `/capture-launcher` then returned to `/`. Body added the leaf text "Opening your capture flow…" alongside home content. No further navigation, no error, no empty-state CTA.

**Backend call:** None (used cached `/worker/today` data).

**Finding:** H-01 (capture-launcher silent redirect leaves loader text in DOM).

---

## /history (History tab)

**What rendered:**

```
History
Real completed work only
TODAY
0  Verified
0  Waiting
0  Total
Multi-day visit history is not connected yet, so this screen only shows today's…
Completed today
No completed sites yet
Finished visits will appear here after they reach verified state.
```

**Backend call:** None additional — used the cached `/worker/today` from Home.

**Findings:**

- H-02 (admitted-broken multi-day history).
- Positive: stats are real (filtered from `visits[]`), no fake numbers.

---

## /profile via tab "You" — see B-01

**Action:** Clicked the "You" tab in the bottom navigation.

**What rendered:** The **worker** profile (`(worker)/profile.tsx`):

```
W
Worker
+91 ••••• •••••
Verified
TODAY
0 Sites
0 Verified
0 Remaining
Synced
All queued captures are up to date.
SUPPORT
Need help or a schedule change?
Use your supervisor contact for leave requests, shift swaps, or task questions.
Supervisor contact is not configured yet.
Member since January 2024
Axhy v1.0.0
```

**Backend call:** Only `GET /worker/today` (the cached one re-fetched once on tab focus). **Correctly NO supervisor calls** via this path.

**Positive observations:**

- Phone masked: `+91 ••••• •••••`
- No fake score ring (removed per prior plan ✓)
- "Supervisor contact is not configured yet" — honest empty state
- "Member since January 2024" — hardcoded display, see L-OBS below

---

## /profile via direct URL navigation — B-01 BLOCKER

**Action:** `Page.navigate('/profile')` directly (no tab click).

**What rendered:** The **SUPERVISOR** profile (`(supervisor)/profile.tsx`):

```
Namaste, Akshay.
WORKER · axhy-qa-f1b-1780229716832
PROFILE
Name: Akshay (real-phone)
Company: axhy-qa-f1b-1780229716832
Role: WORKER
Language: English ›
NOTIFICATIONS
Push notifications
WhatsApp
Email
Sign out
AXHY · v3 · BUILD 2026.05.18
```

**Backend calls fired:**

- `GET /me`
- `GET /supervisor/decisions` → 200 (B-02 — no role gate)
- `GET /chat/reload-context/state` → 200 (H-04 — no role gate)

**Why:** Both `(worker)/profile.tsx` and `(supervisor)/profile.tsx` declare URL `/profile`. With layout context (worker tab → worker layout), expo-router scopes correctly. Without layout context (cold URL nav), it picks the supervisor file.

**This is B-01 BLOCKER.** See [C1-blockers.md](./C1-blockers.md).

**Also:** M-01 — name "Akshay (real-phone)" looks like a dev annotation leak.

---

## Drawer (hamburger top-left from Home)

**Action:** Clicked `[aria-label="Open menu"]` from Home.

**What rendered:** Drawer items: `A·` (avatar), `AXHY` (brand), `My profile`, `Help & support`, `Sign out`, `Axhy v1.0.0`.

**Backend call:** None.

**Positive observations:**

- "My profile" link uses `(worker)/profile.tsx` route per audit code (not affected by B-01)
- "Help & support" link target unverified live (L-06 — external `https://axhy.app/help` per audit)

---

## Sign out (drawer)

**Action:** Clicked "Sign out".

**Result:**

- URL navigated to `/phone`
- `localStorage`: `axhy_access_token`, `axhy_refresh_token`, `axhy_active_role` all removed
- Body rendered the sign-in screen

**Backend calls:** **None.** Specifically NO `POST /auth/sign-out` was fired. Only a residual `GET /worker/today` from an unmounting query.

**Finding:** B-03 BLOCKER — sign-out doesn't revoke server-side refresh token.

---

## Console (across all screens)

Recurring warnings observed (in order of first appearance):

1. `[info] Download the React DevTools for a better development experience` — expected dev mode.
2. `[log] Running application "main" with appParams: Development-level warnings: ON.` — Expo dev mode.
3. `[warning] "shadow*" style props are deprecated. Use "boxShadow".` — L-01.
4. `[warning] props.pointerEvents is deprecated. Use style.pointerEvents.` — L-02.
5. `[warning] [identity-lifecycle] OneSignal initialize skipped (web or no app id); push lifecycle will no-op this session.` — expected on web.
6. `[warning] [identity-lifecycle] OneSignal disabled (web or no app id); auth proceeds without push identity link.` — expected.
7. `[warning] Animated: useNativeDriver is not supported because the native animated module is missing. Falling back to JS-based animation.` — L-03, expected on web.

**No `[error]` messages fired.**

---

## Network (across all screens)

All requests landed on prod backend `backend-production-344e1.up.railway.app`. All preflighted (OPTIONS 204) before the actual call.

| Verb | Path                       | Status | Triggered by                               |
| ---- | -------------------------- | ------ | ------------------------------------------ |
| POST | /auth/otp/request          | 200    | /phone Get OTP click                       |
| POST | /auth/otp/verify           | 200    | /otp Verify click                          |
| POST | /worker/consent            | 200    | /consent "I agree"                         |
| GET  | /worker/today              | 200    | / load, /profile tab focus, /history focus |
| GET  | /me                        | 200    | /profile via URL nav (B-01)                |
| GET  | /supervisor/decisions      | 200    | /profile via URL nav (B-01 → B-02)         |
| GET  | /chat/reload-context/state | 200    | /profile via URL nav (B-01 → H-04)         |

**Auth header:** Every authenticated call carried `Authorization: Bearer <jwt>` (463 chars — typical). Not redacted in transcripts; the JWT is not a long-term credential and rotates every 15 min.

**Time-to-first-paint:** Not measured (not in scope, no specific perf complaint). Worker Home appeared responsive on Expo Web.
