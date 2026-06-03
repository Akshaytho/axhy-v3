<!-- [ORCHESTRATOR_EXCEPTION] QA audit findings — high tier -->

# C2 — HIGH (should-fix this cycle)

---

## H-01 — Capture tab with empty visits leaves "Opening your capture flow…" stuck

**Surface:** Worker bottom tab "Capture" (`capture-launcher` route)  
**Repro (live):**

1. Worker logged in, `/worker/today` returns `visits: []`.
2. Tap "Capture" tab.
3. URL flickers to `/capture-launcher` then settles back at `/` (home).
4. DOM still contains the text "Opening your capture flow…" rendered alongside home content.
5. No further navigation, no error, no empty-state CTA.

**File:** [apps/mobile/app/(worker)/capture-launcher.tsx](<../../apps/mobile/app/(worker)/capture-launcher.tsx>) (new untracked file in worktree at session start)

**Expected:**

- When `pickWorkerCaptureVisit(data)` returns null, render an explicit empty state ("No active visit — your supervisor will assign jobs when ready") OR redirect back to `/` without leaving the loader text in the DOM.

**Actual:**

- Silent redirect to `/`; the loader interstitial remains in the tree.

**Fix sketch:**

- In `capture-launcher.tsx`, branch on the result of `pickWorkerCaptureVisit`. If null, return an empty-state component. If a visit, `router.replace(NAV_ROUTES.workerCaptureEntry(visit.id))`.
- Either way, unmount the "Opening…" interstitial after the resolution settles.

---

## H-02 — Multi-day history is admitted-broken in UI copy

**Surface:** Worker History tab (`/history`)  
**Evidence (live body text):**

> "Multi-day visit history is not connected yet, so this screen only shows today's…"

**File:** [apps/mobile/app/(worker)/history.tsx](<../../apps/mobile/app/(worker)/history.tsx>)

**Why HIGH:** The product is publicly admitting a missing feature on a worker-facing tab. Workers will not trust the app if it tells them it's incomplete.

**Options:**

1. Implement backend `/worker/history` (a paginated past-day visit list scoped to `workerId`). Frontend already audited as ready to consume — see prior QA observation 4777 (2026-06-01).
2. Hide the History tab entirely until ready; the bottom nav goes back to 3 tabs (Today/Capture/You).
3. Rename tab to "Today" if it only shows today (but Today already exists — would conflict).

**Recommendation:** Option 1 (implement). The work is mostly backend.

---

## H-03 — `/profile` URL collision (covered in BLOCKER B-01) — also pulls in supervisor drawer

**Surface:** When the supervisor profile mistakenly renders for a worker (B-01), it uses `useDrawer` from `apps/mobile/components/Drawer.tsx` — NOT the worker drawer.

**Side-effect calls observed:** GET `/chat/reload-context/state`, GET `/supervisor/decisions`.

**Cross-references:** See B-01 (BLOCKER) for the root cause.

---

## H-04 — `/chat/reload-context/state` reachable by worker role

**Surface:** Backend, `GET /chat/reload-context/state`  
**File:** [apps/backend/src/routes/chat-reload-context.ts:149](../../apps/backend/src/routes/chat-reload-context.ts#L149)

`preHandler: requireAuth` — no role gate.

**Live evidence:** Worker session (when on supervisor profile due to B-01) hits this and gets `200`. Body not captured (permission system blocked broader probing) but the lack of role gate is the structural finding.

**Why HIGH (not BLOCKER):** Chat may legitimately be cross-role (workers may chat with supervisors in some flows). Need product confirmation. If chat is supervisor-only:

- Add `requireRole('SUPERVISOR', 'COMPANY_ADMIN', 'SUPER_ADMIN')` preHandler
- Audit `/chat/messages`, `/chat/transcribe`, `/chat/apply`, `/chat/reload-context` (POST) for the same.

If chat IS cross-role, the worker app should expose a chat surface (currently it doesn't — only supervisor has `(supervisor)/chat.tsx`).

---

## H-05 — Refresh token in localStorage on web (XSS theft vector)

**Surface:** Worker app on web (Expo Web)  
**Evidence:** Post-login `Object.keys(localStorage)` returns `['axhy_access_token', 'axhy_refresh_token', 'axhy_active_role']`.

**Mechanism:** `expo-secure-store` falls back to `localStorage` on web. On native, it uses Keychain/Keystore — safe.

**Risk gate:** Severity depends on whether Expo Web of the worker app is ever shipped to real users.

- If web is QA-only (current state, confirmed — no `worker-web` service in Railway), severity is LOW.
- If web ships publicly, severity is **BLOCKER** — XSS gives permanent account access until refresh expires.

**Recommendation:**

- Either commit to "worker app is mobile-only" and add a CI guard that blocks `expo export --platform web` deploys, OR
- Move refresh token to an httpOnly + secure cookie on web (the access token can stay in memory).

---

## H-06 — Founder's phone (`+919381378257`) has WORKER role only — admin personas untestable

**Surface:** Account configuration / seed data  
**Evidence (live JWT decode):**

```json
{
  "sub": "aa3699e4-95a3-4880-8bff-0c69c49621cb",
  "companyId": "eb552ff4-5f7f-4469-8632-56c5a1c0fd43",
  "role": "WORKER",
  "availableRoles": ["WORKER"]
}
```

**Why HIGH:** The QA mandate explicitly required walking COMPANY_ADMIN and SUPER_ADMIN persona surfaces against worker writes. With only WORKER bypass available, the cross-persona QA cannot be completed via the bypass path.

**Options:**

1. Add a second phone to `AXHY_OTP_BYPASS_PHONES` with COMPANY_ADMIN (and a third with SUPER_ADMIN). Per `apps/backend/src/lib/otp-bypass.ts`, the env var accepts a comma-separated list.
2. Promote the founder's account to multi-role (add COMPANY_ADMIN and SUPER_ADMIN membership records) so `availableRoles` includes all three.
3. Provide separate admin-web login credentials (admin web likely uses a different auth path).

See C5 for the consolidated user-action ask.

---

## H-07 — Two OTP request POSTs on a single button press (REPRO PENDING)

**Surface:** Worker `/phone` → Get OTP  
**Evidence:** First walk captured 2x `POST /auth/otp/request` with identical body. Both returned `200 ok`.

**Cause likely my CDP click harness firing multiple synthetic events** (click + pointerup + mouseup). On retry with a single `.click()`, the OTP verify produced exactly one POST. Same fix to be applied here — re-test with single click to rule out the harness artifact.

**Why still HIGH:**

- If a real user double-taps the button (slow network, no haptic feedback), do two real OTPs get generated? Backend response says `resendInSeconds:60` — but both requests succeeded.
- This means the **resend countdown is a client-side hint only**; the backend does not enforce it. Server-side rate-limiting on `/auth/otp/request` is not visible in this trace.

**Fix sketch:**

- Frontend: debounce Get OTP button; disable after first click until response.
- Backend: enforce rate-limit per phone (e.g., max 1 OTP/min) — should reply 429 on the second request within the window.

**Verify by re-testing with a single click and confirming the second click within 60s returns 429.**
